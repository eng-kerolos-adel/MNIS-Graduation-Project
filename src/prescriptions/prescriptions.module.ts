import { BadRequestException, Body, Controller, ForbiddenException, Get, Injectable, Module, NotFoundException, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ClaimStatus, NotifType, Prisma, Role, RxStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsEnum, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { CryptoService } from '../common/crypto.service';
import { Audit, AuthUser, CurrentUser, Roles } from '../common/decorators';
import { PATIENT_PUBLIC_SELECT } from '../patients/patient.select';
import { NotificationsModule, NotificationsService } from '../notifications/notifications.module';

export class RxItemDto {
  @IsString() @MaxLength(120) nameEn: string;
  @IsString() @MaxLength(120) nameAr: string;
  @IsOptional() @IsString() @MaxLength(60) form?: string;
  @IsString() @MaxLength(40) dose: string;
  @IsString() @MaxLength(120) frequencyEn: string;
  @IsString() @MaxLength(120) frequencyAr: string;
  @IsInt() @Min(1) @Max(365) durationDays: number;
  @IsInt() @Min(1) @Max(1000) quantity: number;
  @IsOptional() @IsBoolean() substitutionAllowed?: boolean;
  @IsOptional() @IsBoolean() isChronic?: boolean;
  @IsOptional() @IsInt() @Min(1) @Max(1000) monthlyAllowance?: number;
}
export class CreateRxDto {
  @IsUUID() patientId: string;
  @IsString() @MaxLength(200) diagnosisEn: string;
  @IsString() @MaxLength(200) diagnosisAr: string;
  @IsOptional() @IsString() @MaxLength(40) icd10?: string;
  @IsOptional() @IsBoolean() isChronic?: boolean;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(20) @ValidateNested({ each: true }) @Type(() => RxItemDto) items: RxItemDto[];
}
export class RejectDto { @IsString() @MaxLength(300) reason: string; }
export class RxQueryDto {
  @IsOptional() @IsEnum(RxStatus) status?: RxStatus;
  @IsOptional() @IsUUID() patientId?: string;
}

const include = { items: true, patient: { select: PATIENT_PUBLIC_SELECT } };

@Injectable()
export class PrescriptionsService {
  constructor(
    private prisma: PrismaService,
    private crypto: CryptoService,
    private notifs: NotificationsService,
  ) {}

  create(physicianId: string, dto: CreateRxDto) {
    const { items, ...head } = dto;
    const anyItemChronic = items.some((i) => i.isChronic);
    return this.prisma.prescription.create({
      data: {
        ...head,
        isChronic: head.isChronic ?? anyItemChronic,
        physicianId,
        code: `RX-${randomBytes(5).toString('hex').toUpperCase()}`,
        items: {
          create: items.map(({ isChronic: itemChronic, ...item }) => ({
            ...item,
            monthlyAllowance: (head.isChronic || itemChronic) ? (item.monthlyAllowance ?? item.quantity) : item.monthlyAllowance,
          })),
        },
      },
      include,
    });
  }

  list(user: AuthUser, status?: RxStatus, patientId?: string) {
    const where: Prisma.PrescriptionWhereInput = {
      ...(patientId ? { patientId } : {}),
      ...(status ? { status } : user.role === Role.PHARMACIST ? { status: { not: RxStatus.DRAFT } } : {}),
    };
    return this.prisma.prescription.findMany({ where, include, orderBy: { createdAt: 'desc' }, take: 100 });
  }

  private async load(id: string) {
    const rx = await this.prisma.prescription.findUnique({ where: { id }, include });
    if (!rx) throw new NotFoundException('RX_NOT_FOUND');
    return rx;
  }

  async sign(id: string, user: AuthUser) {
    const rx = await this.load(id);
    if (rx.physicianId !== user.id && user.role !== Role.ADMIN) throw new ForbiddenException('NOT_YOUR_PRESCRIPTION');
    if (rx.status !== 'DRAFT') throw new BadRequestException('ALREADY_SIGNED');
    if (rx.items.length === 0) throw new BadRequestException('EMPTY_PRESCRIPTION');

    const canonical = JSON.stringify({ id: rx.id, patientId: rx.patientId, physicianId: rx.physicianId, dx: rx.diagnosisEn, items: rx.items.map((i) => [i.nameEn, i.dose, i.quantity, i.durationDays]) });
    const signed = await this.prisma.prescription.update({
      where: { id },
      data: { status: 'SIGNED', signedAt: new Date(), signatureHash: this.crypto.hmacSign(canonical) },
      include,
    });

    // If chronic prescription (or duration >= 30 days), auto-register ChronicAllowance rows for the patient
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const resetAt = new Date(year, month, 1);

    for (const item of signed.items) {
      if (signed.isChronic || item.durationDays >= 30 || item.monthlyAllowance) {
        const limit = item.monthlyAllowance ?? item.quantity;
        await this.prisma.chronicAllowance.upsert({
          where: {
            patientId_itemId_periodYear_periodMonth: {
              patientId: signed.patientId,
              itemId: item.id,
              periodYear: year,
              periodMonth: month,
            },
          },
          create: {
            patientId: signed.patientId,
            prescriptionId: signed.id,
            itemId: item.id,
            nameEn: item.nameEn,
            nameAr: item.nameAr,
            monthlyLimit: limit,
            consumed: 0,
            periodYear: year,
            periodMonth: month,
            resetAt,
          },
          update: {
            monthlyLimit: limit,
          },
        });
      }
    }

    return signed;
  }

  private async transition(id: string, from: RxStatus, data: Record<string, unknown>) {
    // Conditional update: two pharmacists cannot both win the same transition.
    const r = await this.prisma.prescription.updateMany({ where: { id, status: from }, data: data as never });
    if (r.count === 0) {
      await this.load(id);
      throw new BadRequestException('INVALID_STATE_TRANSITION');
    }
    return this.load(id);
  }

  verify(id: string, u: AuthUser) { return this.transition(id, 'SIGNED', { status: 'VERIFIED', verifiedById: u.id, verifiedAt: new Date() }); }

  async dispense(id: string, u: AuthUser) {
    const dispensed = await this.transition(id, 'VERIFIED', { status: 'DISPENSED', dispensedById: u.id, dispensedAt: new Date() });

    // Deduct dispensed quantities from Pharmacy DrugInventory if matching drug exists
    for (const item of dispensed.items) {
      const drug = await this.prisma.drugInventory.findFirst({
        where: {
          OR: [
            { nameEn: { contains: item.nameEn.split(' ')[0], mode: 'insensitive' } },
            { nameAr: { contains: item.nameAr.split(' ')[0] } },
          ],
        },
      });
      if (drug) {
        await this.prisma.drugInventory.update({
          where: { id: drug.id },
          data: { quantity: Math.max(0, drug.quantity - item.quantity) },
        });
      }
    }

    // Auto-generate UHIA Insurance Claim if not already present
    const existingClaim = await this.prisma.pharmacyClaim.findUnique({ where: { prescriptionId: id } });
    if (!existingClaim) {
      const totalAmount = dispensed.items.reduce((sum, item) => sum + Math.max(50, item.quantity * 12), 0);
      const coveragePct = dispensed.patient.insuranceActive ? 80 : 0;
      const insuranceAmount = Number(((totalAmount * coveragePct) / 100).toFixed(2));
      const patientBalance = Number((totalAmount - insuranceAmount).toFixed(2));

      await this.prisma.pharmacyClaim.create({
        data: {
          prescriptionId: id,
          patientId: dispensed.patientId,
          dispensedById: u.id,
          totalAmount,
          coveragePct,
          insuranceAmount,
          patientBalance,
          status: ClaimStatus.PENDING,
        },
      });
    }

    // Notify Citizen on Mobile App
    const citizenUser = await this.prisma.user.findUnique({ where: { patientId: dispensed.patientId } });
    if (citizenUser) {
      await this.notifs.sendToUser(
        citizenUser.id,
        NotifType.PRESCRIPTION_DISPENSED,
        'Prescription Dispensed',
        'تم صرف الروشتة الدوائية',
        `Your prescription #${dispensed.code} (${dispensed.diagnosisEn}) has been dispensed at the pharmacy.`,
        `تم صرف الروشتة رقم #${dispensed.code} (${dispensed.diagnosisAr}) من الصيدلية بنجاح.`,
        { prescriptionId: dispensed.id, code: dispensed.code }
      );
    }

    return dispensed;
  }

  reject(id: string, reason: string, u: AuthUser) { return this.transition(id, 'SIGNED', { status: 'REJECTED', rejectReason: reason, verifiedById: u.id, verifiedAt: new Date() }); }
}

@ApiTags('prescriptions') @ApiBearerAuth() @Audit('PRESCRIPTION')
@Controller('prescriptions')
export class PrescriptionsController {
  constructor(private svc: PrescriptionsService) {}
  @Post() @Roles(Role.DOCTOR, Role.ADMIN) create(@CurrentUser() u: AuthUser, @Body() dto: CreateRxDto) { return this.svc.create(u.id, dto); }
  @Get() @Roles(Role.DOCTOR, Role.PHARMACIST, Role.ADMIN, Role.EXECUTIVE) list(@CurrentUser() u: AuthUser, @Query() q: RxQueryDto) { return this.svc.list(u, q.status, q.patientId); }
  @Post(':id/sign') @Roles(Role.DOCTOR, Role.ADMIN) sign(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() u: AuthUser) { return this.svc.sign(id, u); }
  @Post(':id/verify') @Roles(Role.PHARMACIST, Role.ADMIN) verify(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() u: AuthUser) { return this.svc.verify(id, u); }
  @Post(':id/dispense') @Roles(Role.PHARMACIST, Role.ADMIN) dispense(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() u: AuthUser) { return this.svc.dispense(id, u); }
  @Post(':id/reject') @Roles(Role.PHARMACIST, Role.ADMIN) reject(@Param('id', ParseUUIDPipe) id: string, @Body() dto: RejectDto, @CurrentUser() u: AuthUser) { return this.svc.reject(id, dto.reason, u); }
}

@Module({ imports: [NotificationsModule], controllers: [PrescriptionsController], providers: [PrescriptionsService] })
export class PrescriptionsModule {}
