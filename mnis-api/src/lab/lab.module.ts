import { BadRequestException, Body, Controller, Get, Injectable, Module, NotFoundException, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { NotifType, ResultFlag, Role, SamplePriority, SampleStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsEnum, IsNumber, IsOptional, IsString, IsUUID, MaxLength, ValidateNested } from 'class-validator';
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

  list() { return this.prisma.labSample.findMany({ include, orderBy: [{ priority: 'desc' }, { collectedAt: 'desc' }], take: 200 }); }

  order(userId: string, dto: OrderSampleDto) {
    return this.prisma.labSample.create({ data: { ...dto, orderedById: userId, barcode: `EG${randomBytes(4).toString('hex').toUpperCase()}` }, include });
  }

  async setStatus(id: string, dto: SampleStatusDto) {
    const s = await this.prisma.labSample.findUnique({ where: { id } });
    if (!s) throw new NotFoundException();
    if (!NEXT[s.status].includes(dto.status)) throw new BadRequestException('INVALID_STATE_TRANSITION');
    return this.prisma.labSample.update({ where: { id }, data: { status: dto.status, rejectReason: dto.status === 'REJECTED' ? dto.rejectReason ?? 'UNSPECIFIED' : undefined }, include });
  }

  async enterResults(id: string, dto: EnterResultsDto, user: AuthUser) {
    const s = await this.prisma.labSample.findUnique({ where: { id } });
    if (!s) throw new NotFoundException();
    if (s.status !== 'PROCESSING') throw new BadRequestException('SAMPLE_NOT_IN_PROCESSING');
    await this.prisma.$transaction([
      this.prisma.labResult.deleteMany({ where: { sampleId: id } }),
      this.prisma.labResult.createMany({ data: dto.rows.map((r) => ({ ...r, sampleId: id, flag: computeFlag(r.value, r.refLow, r.refHigh) })) }),
      this.prisma.labSample.update({ where: { id }, data: { status: 'RESULTS_ENTERED', enteredById: user.id } }),
    ]);
    return this.prisma.labSample.findUnique({ where: { id }, include });
  }

  async verify(id: string, user: AuthUser) {
    const s = await this.prisma.labSample.findUnique({ where: { id } });
    if (!s) throw new NotFoundException();
    if (s.status !== 'RESULTS_ENTERED') throw new BadRequestException('RESULTS_NOT_ENTERED');
    const r = await this.prisma.labSample.updateMany({
      where: { id, status: 'RESULTS_ENTERED' },
      data: { status: 'VERIFIED', verifiedById: user.id, verifiedAt: new Date() },
    });
    if (r.count === 0) throw new BadRequestException('INVALID_STATE_TRANSITION');

    const verified = await this.prisma.labSample.findUnique({ where: { id }, include });
    if (verified) {
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
    }
    return verified;
  }
}

@ApiTags('lab') @ApiBearerAuth() @Audit('LAB_SAMPLE')
@Controller('lab/samples')
export class LabController {
  constructor(private svc: LabService) {}
  @Get() @Roles(Role.LAB_TECH, Role.DOCTOR, Role.ADMIN, Role.EXECUTIVE) list() { return this.svc.list(); }
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
