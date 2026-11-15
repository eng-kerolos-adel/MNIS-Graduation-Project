import { BadRequestException, Body, Controller, Get, Injectable, Module, NotFoundException, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { BedStatus, ErStatus, Role } from '@prisma/client';
import { IsEnum, IsInt, IsObject, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { Audit, Roles } from '../common/decorators';
import { PATIENT_PUBLIC_SELECT } from '../patients/patient.select';

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
  constructor(private prisma: PrismaService) {}

  beds() { return this.prisma.bed.findMany({ include: bedInclude, orderBy: [{ wardEn: 'asc' }, { bedNumber: 'asc' }] }); }

  async setBedStatus(id: string, status: BedStatus) {
    if (status === 'OCCUPIED') throw new BadRequestException('USE_ADMIT_ENDPOINT_TO_OCCUPY');
    const bed = await this.prisma.bed.findUnique({ where: { id } });
    if (!bed) throw new NotFoundException();
    // Releasing a bed also releases its patient link.
    return this.prisma.bed.update({ where: { id }, data: { status, patientId: null, acuity: null, admittedAt: null }, include: bedInclude });
  }

  er() { return this.prisma.erCase.findMany({ include: erInclude, orderBy: [{ acuity: 'asc' }, { arrivedAt: 'asc' }], take: 200 }); }

  intake(dto: ErIntakeDto) {
    const { vitals, ...rest } = dto;
    return this.prisma.erCase.create({ data: { ...rest, vitals: (vitals ?? {}) as object }, include: erInclude });
  }

  setErStatus(id: string, status: ErStatus) { return this.prisma.erCase.update({ where: { id }, data: { status }, include: erInclude }); }

  /** Atomic: the bed flip is conditional on AVAILABLE, so two nurses can never assign the same bed. */
  async admit(id: string, bedId: string) {
    return this.prisma.$transaction(async (tx) => {
      const c = await tx.erCase.findUnique({ where: { id } });
      if (!c) throw new NotFoundException('ER_CASE_NOT_FOUND');
      const claimed = await tx.bed.updateMany({ where: { id: bedId, status: 'AVAILABLE' }, data: { status: 'OCCUPIED', patientId: c.patientId, acuity: c.acuity, admittedAt: new Date() } });
      if (claimed.count === 0) throw new BadRequestException('BED_NOT_AVAILABLE');
      return tx.erCase.update({ where: { id }, data: { status: 'ADMITTED' }, include: erInclude });
    });
  }
}

@ApiTags('hospital') @ApiBearerAuth() @Audit('HOSPITAL')
@Roles(Role.HOSPITAL_STAFF, Role.DOCTOR, Role.ADMIN, Role.EXECUTIVE)
@Controller('hospital')
export class HospitalController {
  constructor(private svc: HospitalService) {}
  @Get('beds') beds() { return this.svc.beds(); }
  @Patch('beds/:id/status') setBed(@Param('id', ParseUUIDPipe) id: string, @Body() dto: BedStatusDto) { return this.svc.setBedStatus(id, dto.status); }
  @Get('er') er() { return this.svc.er(); }
  @Post('er') intake(@Body() dto: ErIntakeDto) { return this.svc.intake(dto); }
  @Patch('er/:id/status') setEr(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ErStatusDto) { return this.svc.setErStatus(id, dto.status); }
  @Post('er/:id/admit') admit(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AdmitDto) { return this.svc.admit(id, dto.bedId); }
}

import { BloodBankController, BloodBankService } from './blood-bank.service';
import { OrController, OrService } from './or.service';
import { HospitalComplianceController, HospitalComplianceService } from './compliance.service';

@Module({ 
  controllers: [HospitalController, BloodBankController, OrController, HospitalComplianceController], 
  providers: [HospitalService, BloodBankService, OrService, HospitalComplianceService] 
})
export class HospitalModule {}
