import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Injectable,
  Module,
  NotFoundException,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import {
  NotifType,
  Referral,
  ReferralStatus,
  ReferralTarget,
  ReferralUrgency,
  Role,
} from '@prisma/client';
import {
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { randomBytes } from 'crypto';
import { Audit, AuthUser, CurrentUser, Roles } from '../common/decorators';
import { PATIENT_PUBLIC_SELECT } from '../patients/patient.select';
import { PrismaModule } from '../prisma/prisma.module';
import { PrismaService } from '../prisma/prisma.service';

export class CreateReferralDto {
  @IsUUID()
  patientId: string;

  @IsOptional()
  @IsEnum(ReferralTarget)
  target?: ReferralTarget;

  @IsOptional()
  @IsEnum(ReferralTarget)
  targetType?: ReferralTarget;

  @IsEnum(ReferralUrgency)
  urgency: ReferralUrgency;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reasonEn?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reasonAr?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  clinicalNoteEn?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  clinicalNoteAr?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  testPanel?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  medicationEn?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  medicationAr?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  departmentEn?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  departmentAr?: string;
}

export class ActOnReferralDto {
  @IsEnum(ReferralStatus)
  status: ReferralStatus;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  responseNoteEn?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  responseNoteAr?: string;
}

const TARGET_ROLE_MAP: Record<ReferralTarget, Role> = {
  [ReferralTarget.HOSPITAL]: Role.HOSPITAL_STAFF,
  [ReferralTarget.LAB]: Role.LAB_TECH,
  [ReferralTarget.PHARMACY]: Role.PHARMACIST,
};

const referralInclude = {
  patient: { select: PATIENT_PUBLIC_SELECT },
  sender: {
    select: {
      id: true,
      fullNameEn: true,
      fullNameAr: true,
      specialityEn: true,
      specialityAr: true,
    },
  },
};

@Injectable()
export class ReferralsService {
  constructor(private readonly prisma: PrismaService) {}

  private mapReferral(r: any) {
    return {
      ...r,
      targetType: r.target,
      clinicalNoteEn: r.reasonEn,
      clinicalNoteAr: r.reasonAr,
    };
  }

  async create(dto: CreateReferralDto, senderId: string) {
    const patient = await this.prisma.patient.findUnique({
      where: { id: dto.patientId },
      select: { id: true, fullNameEn: true, fullNameAr: true },
    });
    if (!patient) {
      throw new NotFoundException(`Patient ${dto.patientId} not found`);
    }

    const target = dto.target || dto.targetType || ReferralTarget.HOSPITAL;
    const reasonEn = dto.reasonEn || dto.clinicalNoteEn || 'Referred for specialist evaluation and follow-up.';
    const reasonAr = dto.reasonAr || dto.clinicalNoteAr || 'تحويل طبي لتقييم الاستشاري والمتابعة المتخصصة.';

    const testPanel =
      target === ReferralTarget.LAB
        ? dto.testPanel?.trim() || reasonEn
        : dto.testPanel ?? null;
    const medicationEn =
      target === ReferralTarget.PHARMACY
        ? dto.medicationEn?.trim() || reasonEn
        : dto.medicationEn ?? null;
    const medicationAr =
      target === ReferralTarget.PHARMACY
        ? dto.medicationAr?.trim() || dto.medicationEn?.trim() || reasonAr
        : dto.medicationAr ?? null;
    const departmentEn =
      target === ReferralTarget.HOSPITAL
        ? dto.departmentEn?.trim() || 'Emergency & Specialty Care'
        : dto.departmentEn ?? null;
    const departmentAr =
      target === ReferralTarget.HOSPITAL
        ? dto.departmentAr?.trim() || 'الطوارئ والرعاية التخصصية'
        : dto.departmentAr ?? null;

    const isCriticalHospital =
      dto.urgency === ReferralUrgency.CRITICAL && target === ReferralTarget.HOSPITAL;

    const res = await this.prisma.$transaction(async (tx) => {
      const referral = await tx.referral.create({
        data: {
          patientId: dto.patientId,
          senderId,
          target,
          urgency: dto.urgency,
          reasonEn,
          reasonAr,
          testPanel,
          medicationEn,
          medicationAr,
          departmentEn,
          departmentAr,
          status: ReferralStatus.PENDING,
        },
        include: referralInclude,
      });

      // If LAB referral, also create a LabSample linked to this referral so the lab intake queue receives it immediately
      if (target === ReferralTarget.LAB) {
        await tx.labSample.create({
          data: {
            barcode: `EG${randomBytes(4).toString('hex').toUpperCase()}`,
            patientId: dto.patientId,
            panelEn: testPanel || 'Comprehensive Panel',
            panelAr: testPanel || 'تحليل شامل',
            sampleTypeEn: 'Venous Blood',
            sampleTypeAr: 'دم وريدي',
            orderedById: senderId,
            priority: dto.urgency === ReferralUrgency.CRITICAL ? 'STAT' : 'ROUTINE',
            status: 'AWAITING_COLLECTION',
            referralId: referral.id,
          },
        });
      }

      if (!isCriticalHospital) {
        return referral;
      }

      // CRITICAL + HOSPITAL → open an immediate ErCase
      const erCase = await tx.erCase.create({
        data: {
          patientId: dto.patientId,
          arrivalEn: 'Via critical referral',
          arrivalAr: 'عبر إحالة حرجة',
          complaintEn: reasonEn,
          complaintAr: reasonAr,
          acuity: 1,
          status: 'TRIAGE',
          areaEn: departmentEn,
          areaAr: departmentAr,
          referralId: referral.id,
        },
      });

      return tx.referral.update({
        where: { id: referral.id },
        data: { erCaseId: erCase.id },
        include: referralInclude,
      });
    });

    return this.mapReferral(res);
  }

  async list(role: Role, userId: string) {
    if (role === Role.DOCTOR || role === Role.ADMIN || role === Role.EXECUTIVE) {
      const rows = await this.prisma.referral.findMany({
        include: referralInclude,
        orderBy: { createdAt: 'desc' },
      });
      return rows.map((r) => this.mapReferral(r));
    }

    const targetMap: Partial<Record<Role, ReferralTarget>> = {
      [Role.HOSPITAL_STAFF]: ReferralTarget.HOSPITAL,
      [Role.LAB_TECH]: ReferralTarget.LAB,
      [Role.PHARMACIST]: ReferralTarget.PHARMACY,
    };

    const target = targetMap[role];
    if (!target) {
      throw new ForbiddenException('Your role cannot list referrals');
    }

    const rows = await this.prisma.referral.findMany({
      where: { target },
      include: referralInclude,
      orderBy: [{ urgency: 'desc' }, { createdAt: 'desc' }],
    });
    return rows.map((r) => this.mapReferral(r));
  }

  async act(
    id: string,
    dto: ActOnReferralDto,
    actorId: string,
    actorRole: Role,
  ) {
    const allowed: ReferralStatus[] = [
      ReferralStatus.ACCEPTED,
      ReferralStatus.REJECTED,
      ReferralStatus.COMPLETED,
    ];
    if (!allowed.includes(dto.status)) {
      throw new BadRequestException(
        `Status must be one of: ${allowed.join(', ')}`,
      );
    }

    const referral = await this.prisma.referral.findUnique({ where: { id } });
    if (!referral) {
      throw new NotFoundException(`Referral ${id} not found`);
    }
    if (referral.status !== ReferralStatus.PENDING && referral.status !== ReferralStatus.ACCEPTED) {
      throw new BadRequestException(
        `Referral is already ${referral.status} — cannot act on it`,
      );
    }

    const expectedRole = TARGET_ROLE_MAP[referral.target];
    if (actorRole !== expectedRole && actorRole !== Role.ADMIN && actorRole !== Role.DOCTOR) {
      throw new ForbiddenException(
        `Only ${expectedRole} can act on ${referral.target} referrals`,
      );
    }

    const notifContent = this.buildNotifContent(dto.status, referral);

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.referral.update({
        where: { id },
        data: {
          status: dto.status,
          decidedById: actorId,
          decidedAt: new Date(),
          responseNoteEn: dto.responseNoteEn ?? null,
          responseNoteAr: dto.responseNoteAr ?? null,
        },
        include: referralInclude,
      });

      await tx.pushNotification.create({
        data: {
          userId: referral.senderId,
          type: NotifType.REFERRAL_UPDATED,
          titleEn: notifContent.titleEn,
          titleAr: notifContent.titleAr,
          bodyEn: notifContent.bodyEn,
          bodyAr: notifContent.bodyAr,
          data: {
            referralId: referral.id,
            patientId: referral.patientId,
            newStatus: dto.status,
            target: referral.target,
            responseNoteEn: dto.responseNoteEn ?? null,
            responseNoteAr: dto.responseNoteAr ?? null,
          },
        },
      });

      return updated;
    });
  }

  async cancel(id: string, senderId: string) {
    const referral = await this.prisma.referral.findUnique({ where: { id } });
    if (!referral) {
      throw new NotFoundException(`Referral ${id} not found`);
    }
    if (referral.senderId !== senderId) {
      throw new ForbiddenException('You can only cancel your own referrals');
    }
    if (referral.status !== ReferralStatus.PENDING) {
      throw new BadRequestException(
        `Only PENDING referrals can be cancelled — current status: ${referral.status}`,
      );
    }

    return this.prisma.referral.update({
      where: { id },
      data: { status: ReferralStatus.CANCELLED },
      include: referralInclude,
    });
  }

  private buildNotifContent(
    status: ReferralStatus,
    referral: Referral,
  ): { titleEn: string; titleAr: string; bodyEn: string; bodyAr: string } {
    const targetLabelEn: Record<ReferralTarget, string> = {
      HOSPITAL: 'Hospital',
      LAB: 'Laboratory',
      PHARMACY: 'Pharmacy',
    };
    const targetLabelAr: Record<ReferralTarget, string> = {
      HOSPITAL: 'المستشفى',
      LAB: 'المختبر',
      PHARMACY: 'الصيدلية',
    };

    const tEn = targetLabelEn[referral.target];
    const tAr = targetLabelAr[referral.target];

    switch (status) {
      case ReferralStatus.ACCEPTED:
        return {
          titleEn: 'Referral Accepted',
          titleAr: 'تم قبول الإحالة',
          bodyEn: `Your referral to the ${tEn} has been accepted.`,
          bodyAr: `تم قبول إحالتك إلى ${tAr}.`,
        };
      case ReferralStatus.REJECTED:
        return {
          titleEn: 'Referral Rejected',
          titleAr: 'تم رفض الإحالة',
          bodyEn: `Your referral to the ${tEn} has been rejected.`,
          bodyAr: `تم رفض إحالتك إلى ${tAr}.`,
        };
      case ReferralStatus.COMPLETED:
        return {
          titleEn: 'Referral Completed',
          titleAr: 'اكتملت الإحالة',
          bodyEn: `The ${tEn} has completed your referral request.`,
          bodyAr: `أكملت ${tAr} طلب إحالتك.`,
        };
      default:
        return {
          titleEn: 'Referral Updated',
          titleAr: 'تم تحديث الإحالة',
          bodyEn: `Your referral status changed to ${status}.`,
          bodyAr: `تغيّرت حالة إحالتك إلى ${status}.`,
        };
    }
  }
}

@ApiTags('Referrals')
@ApiBearerAuth()
@Audit('referral')
@Controller('referrals')
export class ReferralsController {
  constructor(private readonly referralsService: ReferralsService) {}

  @Post()
  @Roles(Role.DOCTOR, Role.ADMIN)
  @ApiOperation({
    summary: 'Create a referral',
    description:
      'Doctor refers a patient to a hospital, lab, or pharmacy. ' +
      'CRITICAL urgency + HOSPITAL target immediately opens an ErCase.',
  })
  create(
    @Body() dto: CreateReferralDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.referralsService.create(dto, user.id);
  }

  @Get()
  @Roles(Role.DOCTOR, Role.HOSPITAL_STAFF, Role.LAB_TECH, Role.PHARMACIST, Role.ADMIN, Role.EXECUTIVE)
  @ApiOperation({
    summary: 'List referrals',
  })
  list(@CurrentUser() user: AuthUser) {
    return this.referralsService.list(user.role, user.id);
  }

  @Patch(':id/status')
  @Roles(Role.HOSPITAL_STAFF, Role.LAB_TECH, Role.PHARMACIST, Role.DOCTOR, Role.ADMIN)
  @ApiOperation({
    summary: 'Act on a referral',
  })
  @ApiParam({ name: 'id', description: 'Referral UUID' })
  act(
    @Param('id') id: string,
    @Body() dto: ActOnReferralDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.referralsService.act(id, dto, user.id, user.role);
  }

  @Delete(':id')
  @Roles(Role.DOCTOR, Role.ADMIN)
  @ApiOperation({
    summary: 'Cancel a referral',
  })
  @ApiParam({ name: 'id', description: 'Referral UUID' })
  cancel(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.referralsService.cancel(id, user.id);
  }
}

@Module({
  imports: [PrismaModule],
  controllers: [ReferralsController],
  providers: [ReferralsService],
  exports: [ReferralsService],
})
export class ReferralsModule {}
