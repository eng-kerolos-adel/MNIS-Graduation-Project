import { BadRequestException, Body, Controller, Get, Injectable, Module, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { NotifType, ResultFlag, Role, SamplePriority, SampleStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsEnum, IsIn, IsNumber, IsOptional, IsString, IsUUID, MaxLength, ValidateNested } from 'class-validator';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { Audit, AuthUser, CurrentUser, Roles } from '../common/decorators';
import { PATIENT_PUBLIC_SELECT } from '../patients/patient.select';
import { NotificationsModule, NotificationsService } from '../notifications/notifications.module';

export class OrderSampleDto {
  @IsUUID() patientId: string;
  @IsString() @MaxLength(120) panelEn: string;
  @IsString() @MaxLength(120) panelAr: string;
  @IsString() @MaxLength(120) sampleTypeEn: string;
  @IsString() @MaxLength(120) sampleTypeAr: string;
  @IsOptional() @IsEnum(SamplePriority) priority?: SamplePriority;
  @IsOptional() @IsUUID() targetLabUserId?: string;
}
export class SampleStatusDto {
  @IsEnum(SampleStatus) status: SampleStatus;
  @IsOptional() @IsString() @MaxLength(300) rejectReason?: string;
}
export class ResultRowDto {
  @IsString() @MaxLength(80) analyteEn: string;
  @IsString() @MaxLength(80) analyteAr: string;
  @IsNumber() value: number;
  @IsString() @MaxLength(20) unit: string;
  @IsNumber() refLow: number;
  @IsNumber() refHigh: number;
}
export class EnterResultsDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(60) @ValidateNested({ each: true }) @Type(() => ResultRowDto) rows: ResultRowDto[];
}
export class CreateConditionFlagDto {
  @IsUUID() patientId: string;
  @IsOptional() @IsUUID() sampleId?: string;
  @IsString() @MaxLength(160) conditionEn: string;
  @IsString() @MaxLength(160) conditionAr: string;
  @IsIn(['ALLERGY', 'CHRONIC_CONDITION']) conditionType: 'ALLERGY' | 'CHRONIC_CONDITION';
}
export class ReviewConditionFlagDto {
  @IsIn(['APPROVED', 'REJECTED']) status: 'APPROVED' | 'REJECTED';
  @IsOptional() @IsString() @MaxLength(300) reviewNote?: string;
}

/** Forward-only workflow; rejection is allowed until verification. */
const NEXT: Record<SampleStatus, SampleStatus[]> = {
  AWAITING_COLLECTION: ['IN_TRANSIT', 'RECEIVED', 'REJECTED'],
  IN_TRANSIT: ['RECEIVED', 'REJECTED'],
  RECEIVED: ['PROCESSING', 'REJECTED'],
  PROCESSING: ['REJECTED'],           // RESULTS_ENTERED is only reachable via POST /results
  RESULTS_ENTERED: [],                // VERIFIED only via POST /verify
  VERIFIED: [],
  REJECTED: [],
};

export function computeFlag(v: number, low: number, high: number): ResultFlag {
  if (v < low * 0.6 || v > high * 1.6) return 'CRITICAL';
  if (v < low) return 'LOW';
  if (v > high) return 'HIGH';
  return 'NORMAL';
}

const include = { patient: { select: PATIENT_PUBLIC_SELECT }, results: true };

@Injectable()
export class LabService {
  constructor(
    private prisma: PrismaService,
    private notifs: NotificationsService,
  ) {}

  private async hydrateStaff<T extends { orderedById: string; enteredById?: string | null; verifiedById?: string | null }>(rows: T[]) {
    const ids = Array.from(
      new Set(
        rows
          .flatMap((r) => [r.orderedById, r.enteredById, r.verifiedById])
          .filter((x): x is string => !!x),
      ),
    );
    const users = ids.length
      ? await this.prisma.user.findMany({
          where: { id: { in: ids } },
          select: {
            id: true,
            fullNameEn: true,
            fullNameAr: true,
            licenseNo: true,
            specialityEn: true,
            specialityAr: true,
            facilityEn: true,
            facilityAr: true,
          },
        })
      : [];
    const map = new Map(users.map((u) => [u.id, u]));
    return rows.map((r) => ({
      ...r,
      orderedBy: map.get(r.orderedById) ?? null,
      enteredBy: r.enteredById ? (map.get(r.enteredById) ?? null) : null,
      verifiedBy: r.verifiedById ? (map.get(r.verifiedById) ?? null) : null,
    }));
  }

  async list(u: AuthUser, patientId?: string) {
    const rows = await this.prisma.labSample.findMany({
      where: {
        ...(patientId ? { patientId } : {}),
        ...(!patientId && u.role === Role.DOCTOR ? { orderedById: u.id } : {}),
      },
      include,
      orderBy: [{ priority: 'desc' }, { collectedAt: 'desc' }],
      take: 200,
    });
    const hydrated = await this.hydrateStaff(rows);
    if (!patientId && u.role === Role.LAB_TECH) {
      const actor = await this.prisma.user.findUnique({
        where: { id: u.id },
        select: { facilityEn: true, facilityAr: true, specialityEn: true },
      });
      if (actor?.facilityEn) {
        const facEn = actor.facilityEn.trim().toLowerCase();
        return hydrated.filter(
          (s) =>
            s.orderedBy?.facilityEn?.trim().toLowerCase() === facEn ||
            s.sampleTypeEn.toLowerCase().includes(facEn) ||
            s.enteredBy?.facilityEn?.trim().toLowerCase() === facEn ||
            s.verifiedBy?.facilityEn?.trim().toLowerCase() === facEn,
        );
      }
    }
    return hydrated;
  }

  async order(userId: string, dto: OrderSampleDto) {
    const { targetLabUserId, ...rest } = dto;
    let sampleTypeEn = rest.sampleTypeEn;
    let sampleTypeAr = rest.sampleTypeAr;
    if (targetLabUserId) {
      const labUser = await this.prisma.user.findUnique({
        where: { id: targetLabUserId },
        select: { facilityEn: true, facilityAr: true },
      });
      if (labUser?.facilityEn && !sampleTypeEn.includes('@')) {
        sampleTypeEn = `${sampleTypeEn} @ ${labUser.facilityEn}`;
      }
      if (labUser?.facilityAr && !sampleTypeAr.includes('@')) {
        sampleTypeAr = `${sampleTypeAr} @ ${labUser.facilityAr}`;
      }
    }
    const created = await this.prisma.labSample.create({
      data: {
        ...rest,
        sampleTypeEn,
        sampleTypeAr,
        orderedById: userId,
        barcode: `EG${randomBytes(4).toString('hex').toUpperCase()}`,
      },
      include,
    });
    const [hydrated] = await this.hydrateStaff([created]);
    return hydrated;
  }

  async setStatus(id: string, dto: SampleStatusDto) {
    const s = await this.prisma.labSample.findUnique({ where: { id } });
    if (!s) throw new NotFoundException();
    if (!NEXT[s.status].includes(dto.status)) throw new BadRequestException('INVALID_STATE_TRANSITION');
    const updated = await this.prisma.labSample.update({ where: { id }, data: { status: dto.status, rejectReason: dto.status === 'REJECTED' ? dto.rejectReason ?? 'UNSPECIFIED' : undefined }, include });
    const [hydrated] = await this.hydrateStaff([updated]);
    return hydrated;
  }

  async enterResults(id: string, dto: EnterResultsDto, user: AuthUser) {
    if (user.role === Role.LAB_TECH) {
      const actor = await this.prisma.user.findUnique({ where: { id: user.id }, select: { specialityEn: true } });
      if (actor?.specialityEn === 'LAB_RECEPTION') {
        throw new BadRequestException('LAB_RECEPTION_CANNOT_ENTER_OR_VERIFY_RESULTS');
      }
    }
    const s = await this.prisma.labSample.findUnique({ where: { id } });
    if (!s) throw new NotFoundException();
    if (s.status !== 'PROCESSING') throw new BadRequestException('SAMPLE_NOT_IN_PROCESSING');
    await this.prisma.$transaction([
      this.prisma.labResult.deleteMany({ where: { sampleId: id } }),
      this.prisma.labResult.createMany({ data: dto.rows.map((r) => ({ ...r, sampleId: id, flag: computeFlag(r.value, r.refLow, r.refHigh) })) }),
      this.prisma.labSample.update({ where: { id }, data: { status: 'RESULTS_ENTERED', enteredById: user.id } }),
    ]);
    const updated = await this.prisma.labSample.findUnique({ where: { id }, include });
    if (!updated) throw new NotFoundException();
    const [hydrated] = await this.hydrateStaff([updated]);
    return hydrated;
  }

  async verify(id: string, user: AuthUser) {
    if (user.role === Role.LAB_TECH) {
      const actor = await this.prisma.user.findUnique({ where: { id: user.id }, select: { specialityEn: true } });
      if (actor?.specialityEn === 'LAB_RECEPTION') {
        throw new BadRequestException('LAB_RECEPTION_CANNOT_ENTER_OR_VERIFY_RESULTS');
      }
    }
    const s = await this.prisma.labSample.findUnique({ where: { id } });
    if (!s) throw new NotFoundException();
    if (s.status !== 'RESULTS_ENTERED') throw new BadRequestException('RESULTS_NOT_ENTERED');
    if (user.role === Role.LAB_TECH && s.enteredById && s.enteredById === user.id) {
      throw new BadRequestException('DUAL_SIGNOFF_REQUIRED');
    }
    const r = await this.prisma.labSample.updateMany({
      where: { id, status: 'RESULTS_ENTERED' },
      data: { status: 'VERIFIED', verifiedById: user.id, verifiedAt: new Date() },
    });
    if (r.count === 0) throw new BadRequestException('INVALID_STATE_TRANSITION');

    const verified = await this.prisma.labSample.findUnique({ where: { id }, include });
    if (verified) {
      await this.prisma.appointment.updateMany({
        where: { patientId: verified.patientId, type: 'LAB', status: 'CONFIRMED' },
        data: { status: 'COMPLETED' },
      });
      if (verified.referralId) {
        await this.prisma.referral.updateMany({
          where: { id: verified.referralId, status: { in: ['PENDING', 'ACCEPTED'] } },
          data: { status: 'COMPLETED', decidedById: user.id, decidedAt: new Date() },
        });
      }
      const citizenUser = await this.prisma.user.findUnique({ where: { patientId: verified.patientId } });
      if (citizenUser) {
        await this.notifs.sendToUser(
          citizenUser.id,
          NotifType.LAB_RESULT_READY,
          'Lab Results Verified & Ready',
          'نتائج التحاليل الطبية جاهزة ومعتمدة',
          `Your lab results for ${verified.panelEn} (${verified.barcode}) have been verified and are ready to view.`,
          `تم اعتماد نتائج تحليل ${verified.panelAr} (${verified.barcode}) وهي متاحة الآن في ملفك الطبي.`,
          { sampleId: verified.id, barcode: verified.barcode }
        );
      }
      const [hydrated] = await this.hydrateStaff([verified]);
      return hydrated;
    }
    return verified;
  }

  async createConditionFlag(dto: CreateConditionFlagDto, flaggedById: string) {
    const flag = await this.prisma.conditionFlag.create({
      data: {
        patientId: dto.patientId,
        sampleId: dto.sampleId ?? null,
        flaggedById,
        conditionEn: dto.conditionEn,
        conditionAr: dto.conditionAr,
        conditionType: dto.conditionType,
      },
    });
    const [hydrated] = await this.hydrateFlags([flag]);
    return hydrated;
  }

  async listConditionFlags(patientId?: string) {
    const rows = await this.prisma.conditionFlag.findMany({
      where: patientId ? { patientId } : undefined,
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return this.hydrateFlags(rows);
  }

  private async hydrateFlags<T extends { patientId: string; flaggedById: string; reviewedById: string | null }>(rows: T[]) {
    if (rows.length === 0) return [];
    const patientIds = Array.from(new Set(rows.map((r) => r.patientId)));
    const userIds = Array.from(new Set(rows.flatMap((r) => [r.flaggedById, r.reviewedById]).filter((x): x is string => !!x)));
    const [patients, users] = await Promise.all([
      this.prisma.patient.findMany({ where: { id: { in: patientIds } }, select: PATIENT_PUBLIC_SELECT }),
      userIds.length
        ? this.prisma.user.findMany({
            where: { id: { in: userIds } },
            select: { id: true, fullNameEn: true, fullNameAr: true, specialityEn: true, specialityAr: true },
          })
        : Promise.resolve([]),
    ]);
    const pMap = new Map(patients.map((p) => [p.id, p]));
    const uMap = new Map(users.map((u) => [u.id, u]));
    return rows.map((r) => ({
      ...r,
      patient: pMap.get(r.patientId) ?? null,
      flaggedBy: uMap.get(r.flaggedById) ?? null,
      reviewedBy: r.reviewedById ? (uMap.get(r.reviewedById) ?? null) : null,
    }));
  }

  async reviewConditionFlag(id: string, dto: ReviewConditionFlagDto, reviewerId: string) {
    const flag = await this.prisma.conditionFlag.findUnique({ where: { id } });
    if (!flag) throw new NotFoundException('FLAG_NOT_FOUND');

    const updated = await this.prisma.conditionFlag.update({
      where: { id },
      data: {
        status: dto.status,
        reviewedById: reviewerId,
        reviewedAt: new Date(),
        reviewNote: dto.reviewNote ?? null,
      },
    });

    if (dto.status === 'APPROVED') {
      const patient = await this.prisma.patient.findUnique({ where: { id: flag.patientId } });
      if (patient) {
        const parseArr = (val: unknown): Array<{ en: string; ar: string }> => {
          if (Array.isArray(val)) return val as Array<{ en: string; ar: string }>;
          if (typeof val === 'string') {
            try { return JSON.parse(val); } catch { return []; }
          }
          return [];
        };
        if (flag.conditionType === 'ALLERGY') {
          const arr = parseArr(patient.allergies);
          if (!arr.some((x) => x.en?.toLowerCase() === flag.conditionEn.toLowerCase())) {
            arr.push({ en: flag.conditionEn, ar: flag.conditionAr });
            await this.prisma.patient.update({ where: { id: patient.id }, data: { allergies: arr as never } });
          }
        } else {
          const arr = parseArr(patient.chronicConditions);
          if (!arr.some((x) => x.en?.toLowerCase() === flag.conditionEn.toLowerCase())) {
            arr.push({ en: flag.conditionEn, ar: flag.conditionAr });
            await this.prisma.patient.update({ where: { id: patient.id }, data: { chronicConditions: arr as never } });
          }
        }
        const citizenUser = await this.prisma.user.findUnique({ where: { patientId: patient.id }, select: { id: true } });
        if (citizenUser) {
          await this.notifs.sendToUser(
            citizenUser.id,
            NotifType.LAB_RESULT_READY,
            'Medical Profile Updated',
            'تم تحديث ملفك الطبي وإضافة تنبيه صحي معتمد من الطبيب',
            `${flag.conditionEn} was approved by your physician and added to your medical profile & emergency card.`,
            `تم اعتماد وإضافة (${flag.conditionAr}) إلى ملفك الطبي وبطاقة الطوارئ الخاصة بك.`,
            { conditionFlagId: flag.id },
          );
        }
      }
    }

    const [hydrated] = await this.hydrateFlags([updated]);
    return hydrated;
  }
}

@ApiTags('lab') @ApiBearerAuth() @Audit('LAB_SAMPLE')
@Controller('lab/samples')
export class LabController {
  constructor(private svc: LabService) {}
  @Get() @Roles(Role.LAB_TECH, Role.DOCTOR, Role.ADMIN, Role.EXECUTIVE) list(@CurrentUser() u: AuthUser, @Query('patientId') patientId?: string) { return this.svc.list(u, patientId); }
  @Get('condition-flags') @Roles(Role.DOCTOR, Role.LAB_TECH, Role.HOSPITAL_STAFF, Role.ADMIN, Role.EXECUTIVE) listFlags(@Query('patientId') patientId?: string) { return this.svc.listConditionFlags(patientId); }
  @Post('condition-flags') @Roles(Role.LAB_TECH, Role.DOCTOR, Role.ADMIN) createFlag(@CurrentUser() u: AuthUser, @Body() dto: CreateConditionFlagDto) { return this.svc.createConditionFlag(dto, u.id); }
  @Patch('condition-flags/:id/review') @Roles(Role.DOCTOR, Role.ADMIN) reviewFlag(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ReviewConditionFlagDto, @CurrentUser() u: AuthUser) { return this.svc.reviewConditionFlag(id, dto, u.id); }
  @Post() @Roles(Role.DOCTOR, Role.LAB_TECH, Role.ADMIN) order(@CurrentUser() u: AuthUser, @Body() dto: OrderSampleDto) { return this.svc.order(u.id, dto); }
  @Patch(':id/status') @Roles(Role.LAB_TECH, Role.ADMIN) setStatus(@Param('id', ParseUUIDPipe) id: string, @Body() dto: SampleStatusDto) { return this.svc.setStatus(id, dto); }
  @Post(':id/results') @Roles(Role.LAB_TECH, Role.ADMIN) enter(@Param('id', ParseUUIDPipe) id: string, @Body() dto: EnterResultsDto, @CurrentUser() u: AuthUser) { return this.svc.enterResults(id, dto, u); }
  @Post(':id/verify') @Roles(Role.LAB_TECH, Role.DOCTOR, Role.ADMIN) verify(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() u: AuthUser) { return this.svc.verify(id, u); }
}

import { QcController, QcService } from './qc.service';
import { ReagentsController, ReagentsService } from './reagents.service';
import { LabAnalyticsController, LabAnalyticsService } from './lab-analytics.service';
import { RadiologyController, RadiologyService } from './radiology.service';

@Module({ 
  imports: [NotificationsModule],
  controllers: [LabController, QcController, ReagentsController, LabAnalyticsController, RadiologyController], 
  providers: [LabService, QcService, ReagentsService, LabAnalyticsService, RadiologyService] 
})
export class LabModule {}
