import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  ParseUUIDPipe,
  Body,
  Query,
  Injectable,
  Module,
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role, ClaimStatus, NotifType } from '@prisma/client';
import { IsNumber, IsString, IsInt, Min, Max, IsUUID, IsOptional, IsDateString } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { PrismaModule } from '../prisma/prisma.module';
import { Audit, CurrentUser, AuthUser, Roles } from '../common/decorators';
import { NotificationsModule, NotificationsService } from '../notifications/notifications.module';

// --- DTOs ---
export class CreateClaimDto {
  @IsUUID()
  prescriptionId: string;

  @IsNumber()
  @Min(0)
  @Max(100)
  coveragePct: number;
}

export class DispenseAllowanceDto {
  @IsUUID()
  allowanceId: string;

  @IsInt()
  @Min(1)
  quantity: number;
}

export class RunSettlementDto {
  @IsInt()
  year: number;

  @IsInt()
  @Min(1)
  @Max(12)
  month: number;
}

export class CreateDrugDto {
  @IsString()
  nameEn: string;
  @IsString()
  nameAr: string;
  @IsString()
  @IsOptional()
  form?: string;
  @IsString()
  @IsOptional()
  dose?: string;
  @IsString()
  @IsOptional()
  batchNo?: string;
  @IsDateString()
  @IsOptional()
  expiryDate?: string;
  @IsInt()
  @Min(0)
  quantity: number;
  @IsInt()
  @Min(0)
  reorderAt: number;
  @IsNumber()
  @Min(0)
  @IsOptional()
  unitCost?: number;
  @IsNumber()
  @Min(0)
  @IsOptional()
  unitPrice?: number;
}

export class UpdateDrugDto {
  @IsInt()
  @Min(0)
  @IsOptional()
  quantity?: number;
}

// --- Service ---
@Injectable()
export class PharmacyService {
  constructor(
    private prisma: PrismaService,
    private notifs: NotificationsService,
  ) {}

  // -- CLAIMS --
  async createClaim(dto: CreateClaimDto, pharmacistId: string) {
    const rx = await this.prisma.prescription.findUnique({
      where: { id: dto.prescriptionId },
      include: { items: true },
    });
    if (!rx) throw new NotFoundException('Prescription not found');
    if (rx.status !== 'DISPENSED') {
      throw new BadRequestException('Prescription must be dispensed before claiming');
    }
    const existing = await this.prisma.pharmacyClaim.findUnique({ where: { prescriptionId: rx.id } });
    if (existing) throw new ConflictException('CLAIM_ALREADY_EXISTS');

    let totalAmount = 0;
    for (const item of rx.items) {
      const drug = await this.prisma.drugInventory.findFirst({
        where: {
          OR: [
            { nameEn: { contains: item.nameEn.split(' ')[0], mode: 'insensitive' } },
            { nameAr: { contains: item.nameAr.split(' ')[0] } },
          ],
        },
      });
      totalAmount += (drug?.unitCost ?? 45) * item.quantity;
    }
    totalAmount = Number(totalAmount.toFixed(2));
    const insuranceAmount = Number((totalAmount * (dto.coveragePct / 100)).toFixed(2));
    const patientBalance = Number((totalAmount - insuranceAmount).toFixed(2));

    return this.prisma.pharmacyClaim.create({
      data: {
        prescriptionId: rx.id,
        patientId: rx.patientId,
        dispensedById: pharmacistId,
        totalAmount,
        coveragePct: dto.coveragePct,
        insuranceAmount,
        patientBalance,
        status: ClaimStatus.PENDING,
      }
    });
  }

  async listClaims(status?: ClaimStatus, month?: number, year?: number) {
    const rows = await this.prisma.pharmacyClaim.findMany({
      where: {
        ...(status && { status }),
        ...(month && year && {
          dispensedAt: {
            gte: new Date(year, month - 1, 1),
            lt: new Date(year, month, 1),
          }
        })
      },
      include: {
        patient: { select: { mti: true, fullNameEn: true, fullNameAr: true } },
        prescription: {
          include: {
            patient: { select: { mti: true, fullNameEn: true, fullNameAr: true } },
          },
        },
      },
      orderBy: { dispensedAt: 'desc' }
    });
    return rows.map((c) => ({
      ...c,
      totalAmountEgp: c.totalAmount,
      insuranceCoverEgp: c.insuranceAmount,
      patientCopayEgp: c.patientBalance,
    }));
  }

  async submitClaim(id: string) {
    const claimed = await this.prisma.pharmacyClaim.updateMany({
      where: { id, status: ClaimStatus.PENDING },
      data: { status: ClaimStatus.SUBMITTED },
    });
    if (claimed.count === 0) {
      const existing = await this.prisma.pharmacyClaim.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException('Claim not found');
      throw new BadRequestException('INVALID_STATE_TRANSITION');
    }
    const c = await this.prisma.pharmacyClaim.findUniqueOrThrow({ where: { id } });
    return {
      ...c,
      totalAmountEgp: c.totalAmount,
      insuranceCoverEgp: c.insuranceAmount,
      patientCopayEgp: c.patientBalance,
    };
  }

  // -- SETTLEMENTS --
  async listSettlements() {
    const rows = await this.prisma.pharmacySettlement.findMany({
      orderBy: [{ periodYear: 'desc' }, { periodMonth: 'desc' }]
    });
    return rows.map((s) => ({
      ...s,
      year: s.periodYear,
      month: s.periodMonth,
      totalInsuranceEgp: s.totalAmount,
      settledAt: s.submittedAt,
    }));
  }

  async runSettlement(dto: RunSettlementDto, adminId: string) {
    return this.prisma.$transaction(async (tx) => {
      const claims = await tx.pharmacyClaim.findMany({
        where: {
          status: { in: [ClaimStatus.SUBMITTED, ClaimStatus.PENDING] },
          dispensedAt: {
            gte: new Date(dto.year, dto.month - 1, 1),
            lt: new Date(dto.year, dto.month, 1),
          }
        }
      });

      const existing = await tx.pharmacySettlement.findUnique({
        where: { periodYear_periodMonth: { periodYear: dto.year, periodMonth: dto.month } }
      });

      if (existing) {
        if (claims.length > 0) {
          const addedAmount = claims.reduce((sum, c) => sum + c.insuranceAmount, 0);
          const updated = await tx.pharmacySettlement.update({
            where: { id: existing.id },
            data: {
              totalClaims: existing.totalClaims + claims.length,
              totalAmount: existing.totalAmount + addedAmount,
              submittedAt: new Date(),
              status: ClaimStatus.SETTLED,
            },
          });
          await tx.pharmacyClaim.updateMany({
            where: { id: { in: claims.map((c) => c.id) } },
            data: { status: ClaimStatus.SETTLED, settlementId: updated.id },
          });
          return {
            ...updated,
            year: updated.periodYear,
            month: updated.periodMonth,
            totalInsuranceEgp: updated.totalAmount,
            settledAt: updated.submittedAt,
          };
        }
        return {
          ...existing,
          year: existing.periodYear,
          month: existing.periodMonth,
          totalInsuranceEgp: existing.totalAmount,
          settledAt: existing.submittedAt,
        };
      }

      if (claims.length === 0) throw new BadRequestException('No pending or submitted claims found for this period');

      const totalAmount = claims.reduce((sum, c) => sum + c.insuranceAmount, 0);

      const settlement = await tx.pharmacySettlement.create({
        data: {
          periodYear: dto.year,
          periodMonth: dto.month,
          totalClaims: claims.length,
          totalAmount,
          submittedById: adminId,
          submittedAt: new Date(),
          status: ClaimStatus.SETTLED
        }
      });

      await tx.pharmacyClaim.updateMany({
        where: { id: { in: claims.map(c => c.id) } },
        data: { status: ClaimStatus.SETTLED, settlementId: settlement.id }
      });

      return {
        ...settlement,
        year: settlement.periodYear,
        month: settlement.periodMonth,
        totalInsuranceEgp: settlement.totalAmount,
        settledAt: settlement.submittedAt,
      };
    });
  }

  // -- ALLOWANCES --
  async getAllowances(patientId: string) {
    const rows = await this.prisma.chronicAllowance.findMany({
      where: { patientId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((a) => ({
      ...a,
      medicationEn: a.nameEn,
      medicationAr: a.nameAr,
      drugNameEn: a.nameEn,
      drugNameAr: a.nameAr,
      consumedThisMonth: a.consumed,
      dispensedThisMonth: a.consumed,
      resetDate: a.resetAt,
      dose: 'حصة شهرية معتمدة (UHIA)',
    }));
  }

  async dispenseAllowance(dto: DispenseAllowanceDto) {
    const updated = await this.prisma.$transaction(async (tx) => {
      const allowance = await tx.chronicAllowance.findUnique({ where: { id: dto.allowanceId } });
      if (!allowance) throw new NotFoundException('Allowance not found');
      if (allowance.resetAt <= new Date()) {
        throw new BadRequestException('ALLOWANCE_PERIOD_EXPIRED');
      }

      const newConsumed = allowance.consumed + dto.quantity;
      if (newConsumed > allowance.monthlyLimit) {
        throw new BadRequestException('Exceeds monthly limit');
      }

      const claimed = await tx.chronicAllowance.updateMany({
        where: { id: allowance.id, consumed: allowance.consumed },
        data: { consumed: newConsumed },
      });
      if (claimed.count === 0) {
        throw new ConflictException('ALLOWANCE_CONCURRENT_UPDATE');
      }

      const drug = await tx.drugInventory.findFirst({
        where: {
          OR: [
            { nameEn: { contains: allowance.nameEn.split(' ')[0], mode: 'insensitive' } },
            { nameAr: { contains: allowance.nameAr.split(' ')[0] } },
          ],
        },
      });
      if (drug) {
        await tx.drugInventory.update({
          where: { id: drug.id },
          data: { quantity: Math.max(0, drug.quantity - dto.quantity) },
        });
      }

      return tx.chronicAllowance.findUniqueOrThrow({ where: { id: allowance.id } });
    });

    const citizenUser = await this.prisma.user.findUnique({
      where: { patientId: updated.patientId },
      select: { id: true },
    });
    if (citizenUser) {
      const remaining = Math.max(0, updated.monthlyLimit - updated.consumed);
      await this.notifs.sendToUser(
        citizenUser.id,
        NotifType.PRESCRIPTION_DISPENSED,
        'Chronic Medication Quota Dispensed',
        'تم صرف حصة من دوائك المزمن',
        `Dispensed ${dto.quantity} unit(s) of ${updated.nameEn}. Remaining monthly quota: ${remaining}/${updated.monthlyLimit}.`,
        `تم صرف (${dto.quantity}) عبوة من دوائك المزمن (${updated.nameAr}). الرصيد المتبقي لهذا الشهر: ${remaining} من ${updated.monthlyLimit}.`,
        { allowanceId: updated.id, remaining },
      );
    }
    return updated;
  }

  // -- INVENTORY --
  async getInventory() {
    return this.prisma.drugInventory.findMany({
      orderBy: [{ quantity: 'asc' }]
    });
  }

  async createDrug(dto: CreateDrugDto) {
    const { dose, unitPrice, unitCost, expiryDate, ...rest } = dto;
    const d = dose?.trim();
    return this.prisma.drugInventory.create({
      data: {
        ...rest,
        nameEn: d && !rest.nameEn.includes(d) ? `${rest.nameEn} ${d}`.trim() : rest.nameEn,
        nameAr: d && !rest.nameAr.includes(d) ? `${rest.nameAr} (${d})`.trim() : rest.nameAr,
        unitCost: unitCost ?? unitPrice ?? 45,
        expiryDate: expiryDate ? new Date(expiryDate) : null,
      },
    });
  }

  async updateDrug(id: string, dto: UpdateDrugDto) {
    return this.prisma.drugInventory.update({
      where: { id },
      data: dto
    });
  }
}

// --- Controller ---
@ApiTags('pharmacy')
@ApiBearerAuth()
@Audit('PHARMACY')
@Controller('pharmacy')
export class PharmacyController {
  constructor(private svc: PharmacyService) {}

  // Claims
  @Post('claims')
  @Roles(Role.PHARMACIST)
  createClaim(@Body() dto: CreateClaimDto, @CurrentUser() user: AuthUser) {
    return this.svc.createClaim(dto, user.id);
  }

  @Get('claims')
  @Roles(Role.PHARMACIST, Role.ADMIN, Role.EXECUTIVE)
  listClaims(
    @Query('status') status?: ClaimStatus,
    @Query('month') month?: string,
    @Query('year') year?: string
  ) {
    return this.svc.listClaims(
      status, 
      month ? parseInt(month) : undefined, 
      year ? parseInt(year) : undefined
    );
  }

  @Patch('claims/:id/submit')
  @Roles(Role.PHARMACIST, Role.ADMIN)
  submitClaim(@Param('id', ParseUUIDPipe) id: string) {
    return this.svc.submitClaim(id);
  }

  // Settlements
  @Get('settlements')
  @Roles(Role.PHARMACIST, Role.ADMIN, Role.EXECUTIVE)
  listSettlements() {
    return this.svc.listSettlements();
  }

  @Post('settlements/run')
  @Roles(Role.PHARMACIST, Role.ADMIN)
  runSettlement(@Body() dto: RunSettlementDto, @CurrentUser() user: AuthUser) {
    return this.svc.runSettlement(dto, user.id);
  }

  // Allowances
  @Get('allowances/patient/:patientId')
  @Roles(Role.PHARMACIST, Role.DOCTOR, Role.ADMIN, Role.EXECUTIVE)
  getAllowances(@Param('patientId', ParseUUIDPipe) patientId: string) {
    return this.svc.getAllowances(patientId);
  }

  @Post('allowances/dispense')
  @Roles(Role.PHARMACIST, Role.ADMIN)
  dispenseAllowance(@Body() dto: DispenseAllowanceDto) {
    return this.svc.dispenseAllowance(dto);
  }

  // Inventory
  @Get('inventory')
  @Roles(Role.PHARMACIST, Role.ADMIN, Role.EXECUTIVE)
  getInventory() {
    return this.svc.getInventory();
  }

  @Post('inventory')
  @Roles(Role.PHARMACIST, Role.ADMIN)
  createDrug(@Body() dto: CreateDrugDto) {
    return this.svc.createDrug(dto);
  }

  @Patch('inventory/:id')
  @Roles(Role.PHARMACIST, Role.ADMIN)
  updateDrug(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateDrugDto) {
    return this.svc.updateDrug(id, dto);
  }
}

// --- Module ---
@Module({
  imports: [PrismaModule, NotificationsModule],
  controllers: [PharmacyController],
  providers: [PharmacyService],
  exports: [PharmacyService],
})
export class PharmacyModule {}
