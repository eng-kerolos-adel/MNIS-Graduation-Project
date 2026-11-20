import { BadRequestException, Body, Controller, Get, Injectable, Module, NotFoundException, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { BedStatus, ErStatus, NotifType, Role } from '@prisma/client';
import { IsEnum, IsInt, IsObject, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { Audit, AuthUser, CurrentUser, Roles } from '../common/decorators';
import { PATIENT_PUBLIC_SELECT } from '../patients/patient.select';
import { NotificationsModule, NotificationsService } from '../notifications/notifications.module';

export class BedStatusDto { @IsEnum(BedStatus) status: BedStatus; }
export class ErIntakeDto {
  @IsUUID() patientId: string;
  @IsString() @MaxLength(120) arrivalEn: string;
  @IsString() @MaxLength(120) arrivalAr: string;
  @IsString() @MaxLength(200) complaintEn: string;
  @IsString() @MaxLength(200) complaintAr: string;
  @IsInt() @Min(1) @Max(5) acuity: number;
  @IsOptional() @IsString() @MaxLength(120) areaEn?: string;
  @IsOptional() @IsString() @MaxLength(120) areaAr?: string;
  @IsOptional() @IsObject() vitals?: Record<string, unknown>;
}
export class AdmitDto { @IsUUID() bedId: string; }
export class ErStatusDto { @IsEnum(ErStatus) status: ErStatus; }

const erInclude = { patient: { select: PATIENT_PUBLIC_SELECT } };
const bedInclude = { patient: { select: PATIENT_PUBLIC_SELECT } };

@Injectable()
export class HospitalService {
  constructor(
    private prisma: PrismaService,
    private notifs: NotificationsService,
  ) {}

  async beds(u?: AuthUser) {
    const allBeds = await this.prisma.bed.findMany({ include: bedInclude, orderBy: [{ wardEn: 'asc' }, { bedNumber: 'asc' }] });
    if (u?.role === Role.HOSPITAL_STAFF) {
      const staff = await this.prisma.user.findUnique({ where: { id: u.id }, select: { facilityEn: true } });
      const myFac = staff?.facilityEn?.trim().toLowerCase();
      if (myFac) {
        const ownTagged = allBeds.filter((b) => b.wardEn.toLowerCase().includes(myFac));
        const sharedUntagged = allBeds.filter((b) => !b.wardEn.includes(' — '));
        return ownTagged.length > 0 ? ownTagged : sharedUntagged;
      }
    }
    return allBeds;
  }

  async setBedStatus(id: string, status: BedStatus) {
    if (status === 'OCCUPIED') throw new BadRequestException('USE_ADMIT_ENDPOINT_TO_OCCUPY');
    const bed = await this.prisma.bed.findUnique({ where: { id } });
    if (!bed) throw new NotFoundException();
    // Releasing a bed also releases its patient link.
    return this.prisma.bed.update({ where: { id }, data: { status, patientId: null, acuity: null, admittedAt: null }, include: bedInclude });
  }

  async er(u?: AuthUser) {
    const allCases = await this.prisma.erCase.findMany({ include: erInclude, orderBy: [{ acuity: 'asc' }, { arrivedAt: 'asc' }], take: 200 });
    if (u?.role === Role.HOSPITAL_STAFF) {
      const staff = await this.prisma.user.findUnique({ where: { id: u.id }, select: { facilityEn: true } });
      const myFac = staff?.facilityEn?.trim().toLowerCase();
      if (myFac) {
        return allCases.filter((c) => {
          const area = (c.areaEn ?? '').trim().toLowerCase();
          if (!area) return true;
          const targetsOtherHospital =
            (area.includes('hospital') || area.includes('medical center') || area.includes(' — ')) &&
            !area.includes(myFac);
          return !targetsOtherHospital;
        });
      }
    }
    return allCases;
  }

  async intake(dto: ErIntakeDto, u?: AuthUser) {
    const { vitals, ...rest } = dto;
    let areaEn = rest.areaEn;
    let areaAr = rest.areaAr;
    if (u?.role === Role.HOSPITAL_STAFF) {
      const staff = await this.prisma.user.findUnique({
        where: { id: u.id },
        select: { facilityEn: true, facilityAr: true },
      });
      if (staff?.facilityEn && !(areaEn ?? '').toLowerCase().includes(staff.facilityEn.toLowerCase())) {
        areaEn = areaEn ? `${areaEn} — ${staff.facilityEn}` : staff.facilityEn;
      }
      if (staff?.facilityAr && !(areaAr ?? '').includes(staff.facilityAr)) {
        areaAr = areaAr ? `${areaAr} — ${staff.facilityAr}` : staff.facilityAr;
      }
    }
    return this.prisma.erCase.create({
      data: { ...rest, areaEn, areaAr, vitals: (vitals ?? {}) as object },
      include: erInclude,
    });
  }

  setErStatus(id: string, status: ErStatus) { return this.prisma.erCase.update({ where: { id }, data: { status }, include: erInclude }); }

  /** Atomic: the bed flip is conditional on AVAILABLE, and ER case flip is conditional on not already closed, so two nurses can never assign two beds or overwrite a bed. */
  async admit(id: string, bedId: string) {
    const admitted = await this.prisma.$transaction(async (tx) => {
      const c = await tx.erCase.findUnique({ where: { id } });
      if (!c) throw new NotFoundException('ER_CASE_NOT_FOUND');
      if (c.status === 'ADMITTED' || c.status === 'DISCHARGED') {
        throw new BadRequestException('ER_CASE_ALREADY_CLOSED');
      }
      const erFlipped = await tx.erCase.updateMany({
        where: { id, status: { notIn: ['ADMITTED', 'DISCHARGED'] } },
        data: { status: 'ADMITTED' },
      });
      if (erFlipped.count === 0) throw new BadRequestException('ER_CASE_ALREADY_CLOSED');

      const claimed = await tx.bed.updateMany({ where: { id: bedId, status: 'AVAILABLE' }, data: { status: 'OCCUPIED', patientId: c.patientId, acuity: c.acuity, admittedAt: new Date() } });
      if (claimed.count === 0) throw new BadRequestException('BED_NOT_AVAILABLE');
      if (c.referralId) {
        await tx.referral.updateMany({
          where: { id: c.referralId, status: { in: ['PENDING', 'ACCEPTED'] } },
          data: { status: 'COMPLETED', decidedAt: new Date() },
        });
      }
      return tx.erCase.findUniqueOrThrow({ where: { id }, include: erInclude });
    });

    const [bed, citizenUser] = await Promise.all([
      this.prisma.bed.findUnique({ where: { id: bedId } }),
      this.prisma.user.findUnique({ where: { patientId: admitted.patientId }, select: { id: true } }),
    ]);
    if (citizenUser && bed) {
      await this.notifs.sendToUser(
        citizenUser.id,
        NotifType.GENERAL,
        'Hospital Bed Assigned',
        'تم تخصيص سرير إقامة لك بالمستشفى',
        `You have been admitted to ${bed.wardEn} — Bed ${bed.bedNumber}.`,
        `تم قبول دخولك وتخصيص سرير رقم (${bed.bedNumber}) في قسم (${bed.wardAr}).`,
        { bedId: bed.id, bedNumber: bed.bedNumber },
      );
    }
    return admitted;
  }
}

@ApiTags('hospital') @ApiBearerAuth() @Audit('HOSPITAL')
@Roles(Role.HOSPITAL_STAFF, Role.DOCTOR, Role.ADMIN, Role.EXECUTIVE)
@Controller('hospital')
export class HospitalController {
  constructor(private svc: HospitalService) {}
  @Get('beds') beds(@CurrentUser() u: AuthUser) { return this.svc.beds(u); }
  @Patch('beds/:id/status') @Roles(Role.HOSPITAL_STAFF, Role.DOCTOR, Role.ADMIN) setBed(@Param('id', ParseUUIDPipe) id: string, @Body() dto: BedStatusDto) { return this.svc.setBedStatus(id, dto.status); }
  @Get('er') er(@CurrentUser() u: AuthUser) { return this.svc.er(u); }
  @Post('er') @Roles(Role.HOSPITAL_STAFF, Role.DOCTOR, Role.ADMIN) intake(@Body() dto: ErIntakeDto, @CurrentUser() u: AuthUser) { return this.svc.intake(dto, u); }
  @Patch('er/:id/status') @Roles(Role.HOSPITAL_STAFF, Role.DOCTOR, Role.ADMIN) setEr(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ErStatusDto) { return this.svc.setErStatus(id, dto.status); }
  @Post('er/:id/admit') @Roles(Role.HOSPITAL_STAFF, Role.DOCTOR, Role.ADMIN) admit(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AdmitDto) { return this.svc.admit(id, dto.bedId); }
}

import { BloodBankController, BloodBankService } from './blood-bank.service';
import { OrController, OrService } from './or.service';
import { HospitalComplianceController, HospitalComplianceService } from './compliance.service';

@Module({ 
  imports: [NotificationsModule],
  controllers: [HospitalController, BloodBankController, OrController, HospitalComplianceController], 
  providers: [HospitalService, BloodBankService, OrService, HospitalComplianceService] 
})
export class HospitalModule {}
