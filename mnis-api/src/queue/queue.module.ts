import { Body, Controller, Get, Injectable, NotFoundException, Param, ParseUUIDPipe, Patch, Post, ConflictException, Module } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role, VisitStatus } from '@prisma/client';
import { IsBoolean, IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { Audit, AuthUser, CurrentUser, Roles } from '../common/decorators';
import { PATIENT_PUBLIC_SELECT } from '../patients/patient.select';

export class CreateTicketDto {
  @IsUUID() patientId: string;
  @IsString() @MaxLength(200) reasonEn: string;
  @IsString() @MaxLength(200) reasonAr: string;
  @IsOptional() @IsBoolean() isEmergency?: boolean;
  @IsOptional() @IsUUID() doctorId?: string;
}
export class UpdateVisitStatusDto {
  @IsEnum(VisitStatus) status: VisitStatus;
  @IsOptional() @IsString() @MaxLength(300) vitalsSummary?: string;
}

const include = { patient: { select: PATIENT_PUBLIC_SELECT } };

@Injectable()
export class QueueService {
  constructor(private prisma: PrismaService) {}

  private async hydrateVisits<T extends { doctorId: string | null }>(visits: T[]) {
    const ids = Array.from(new Set(visits.map((v) => v.doctorId).filter((x): x is string => !!x)));
    const doctors = ids.length
      ? await this.prisma.user.findMany({
          where: { id: { in: ids } },
          select: { id: true, fullNameEn: true, fullNameAr: true, licenseNo: true, specialityEn: true, specialityAr: true, facilityEn: true, facilityAr: true },
        })
      : [];
    const doctorMap = new Map(doctors.map((d) => [d.id, d]));
    return visits.map((v) => ({
      ...v,
      doctor: v.doctorId ? (doctorMap.get(v.doctorId) ?? null) : null,
    }));
  }

  private async resolveClinicDoctorId(u: AuthUser, explicitDoctorId?: string): Promise<string | null> {
    if (explicitDoctorId) return explicitDoctorId;
    if (u.role === Role.DOCTOR) return u.id;
    if (u.role === Role.RECEPTIONIST) {
      const staff = await this.prisma.user.findUnique({
        where: { id: u.id },
        select: { specialityEn: true, licenseNo: true, facilityEn: true },
      });
      if (!staff) return null;
      const docEmail = staff.licenseNo?.startsWith('AST:') ? staff.licenseNo.slice(4).trim().toLowerCase() : null;
      const doc = await this.prisma.user.findFirst({
        where: {
          role: Role.DOCTOR,
          isActive: true,
          ...(docEmail ? { email: docEmail } : staff.facilityEn ? { facilityEn: staff.facilityEn } : {}),
        },
        select: { id: true },
      });
      return doc?.id ?? null;
    }
    return null;
  }

  async list(u: AuthUser) {
    const scopedDoctorId = await this.resolveClinicDoctorId(u);
    const rows = await this.prisma.visit.findMany({
      where: scopedDoctorId ? { doctorId: scopedDoctorId } : undefined,
      include,
      orderBy: [{ isEmergency: 'desc' }, { arrivedAt: 'asc' }],
      take: 200,
    });
    return this.hydrateVisits(rows);
  }

  async create(dto: CreateTicketDto, u: AuthUser) {
    const resolvedDocId = await this.resolveClinicDoctorId(u, dto.doctorId);
    const count = await this.prisma.visit.count({ where: { arrivedAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } } });
    const created = await this.prisma.visit.create({
      data: {
        patientId: dto.patientId,
        reasonEn: dto.reasonEn,
        reasonAr: dto.reasonAr,
        isEmergency: dto.isEmergency ?? false,
        doctorId: resolvedDocId ?? null,
        ticketNo: `A-${count + 1}`,
      },
      include,
    });
    const [hydrated] = await this.hydrateVisits([created]);
    return hydrated;
  }

  /** Emergencies first, then FIFO, preferring visits assigned to this doctor or unassigned. Conditional updateMany prevents double-call. */
  async callNext(u: AuthUser, explicitDoctorId?: string) {
    const doctorId = (await this.resolveClinicDoctorId(u, explicitDoctorId)) || (u.role === Role.DOCTOR ? u.id : null);
    for (let i = 0; i < 3; i++) {
      let next = doctorId
        ? await this.prisma.visit.findFirst({
            where: { status: 'WAITING', OR: [{ doctorId }, { doctorId: null }] },
            orderBy: [{ isEmergency: 'desc' }, { arrivedAt: 'asc' }],
          })
        : null;
      if (!next && (u.role === Role.ADMIN || u.role === Role.EXECUTIVE)) {
        next = await this.prisma.visit.findFirst({ where: { status: 'WAITING' }, orderBy: [{ isEmergency: 'desc' }, { arrivedAt: 'asc' }] });
      }
      if (!next) throw new NotFoundException('NO_PATIENTS_WAITING');
      const targetDocId = next.doctorId ?? doctorId;
      if (targetDocId) {
        await this.prisma.visit.updateMany({
          where: { doctorId: targetDocId, status: 'IN_CONSULTATION', id: { not: next.id } },
          data: { status: 'COMPLETED', completedAt: new Date() },
        });
      }
      const r = await this.prisma.visit.updateMany({
        where: { id: next.id, status: 'WAITING' },
        data: { status: 'IN_CONSULTATION', doctorId: targetDocId, calledAt: new Date() },
      });
      if (r.count === 1) {
        const updated = await this.prisma.visit.findUnique({ where: { id: next.id }, include });
        if (!updated) throw new NotFoundException();
        const [hydrated] = await this.hydrateVisits([updated]);
        return hydrated;
      }
    }
    throw new ConflictException('QUEUE_BUSY_RETRY');
  }

  async setStatus(id: string, dto: UpdateVisitStatusDto, u: AuthUser) {
    const v = await this.prisma.visit.findUnique({ where: { id } });
    if (!v) throw new NotFoundException();
    const resolvedDocId = v.doctorId ?? (await this.resolveClinicDoctorId(u)) ?? (u.role === Role.DOCTOR ? u.id : null);
    if (dto.status === VisitStatus.IN_CONSULTATION && resolvedDocId) {
      await this.prisma.visit.updateMany({
        where: { doctorId: resolvedDocId, status: 'IN_CONSULTATION', id: { not: id } },
        data: { status: 'COMPLETED', completedAt: new Date() },
      });
    }
    const vitalsTag = dto.vitalsSummary?.trim();
    const nextReasonEn = vitalsTag && !v.reasonEn.includes('[Vitals:') ? `${v.reasonEn} [Vitals: ${vitalsTag}]` : undefined;
    const nextReasonAr = vitalsTag && !v.reasonAr.includes('[Vitals:') ? `${v.reasonAr} [Vitals: ${vitalsTag}]` : undefined;

    const updated = await this.prisma.visit.update({
      where: { id },
      data: {
        status: dto.status,
        doctorId: resolvedDocId,
        calledAt: dto.status === VisitStatus.IN_CONSULTATION ? new Date() : undefined,
        completedAt: dto.status === 'COMPLETED' ? new Date() : undefined,
        ...(nextReasonEn ? { reasonEn: nextReasonEn } : {}),
        ...(nextReasonAr ? { reasonAr: nextReasonAr } : {}),
      },
      include,
    });

    if (dto.status === VisitStatus.COMPLETED) {
      const matchedAppt = await this.prisma.appointment.findFirst({
        where: {
          patientId: v.patientId,
          type: 'CLINIC',
          status: 'CONFIRMED',
          ...(resolvedDocId ? { doctorId: resolvedDocId } : {}),
        },
        orderBy: [{ scheduledAt: 'asc' }, { createdAt: 'asc' }],
      });
      if (matchedAppt) {
        await this.prisma.appointment.update({
          where: { id: matchedAppt.id },
          data: { status: 'COMPLETED' },
        });
      }
    }

    const [hydrated] = await this.hydrateVisits([updated]);
    return hydrated;
  }
}

@ApiTags('queue') @ApiBearerAuth() @Audit('VISIT')
@Controller('queue')
export class QueueController {
  constructor(private svc: QueueService) {}
  @Get() @Roles(Role.DOCTOR, Role.HOSPITAL_STAFF, Role.RECEPTIONIST, Role.ADMIN, Role.EXECUTIVE)
  list(@CurrentUser() u: AuthUser) { return this.svc.list(u); }
  @Post() @Roles(Role.DOCTOR, Role.HOSPITAL_STAFF, Role.RECEPTIONIST, Role.ADMIN)
  create(@Body() dto: CreateTicketDto, @CurrentUser() u: AuthUser) { return this.svc.create(dto, u); }
  @Post('call-next') @Roles(Role.DOCTOR, Role.RECEPTIONIST, Role.HOSPITAL_STAFF, Role.ADMIN)
  callNext(@CurrentUser() u: AuthUser, @Body() body?: { doctorId?: string }) {
    return this.svc.callNext(u, body?.doctorId);
  }
  @Patch(':id/status') @Roles(Role.DOCTOR, Role.HOSPITAL_STAFF, Role.RECEPTIONIST, Role.ADMIN)
  setStatus(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateVisitStatusDto, @CurrentUser() u: AuthUser) {
    return this.svc.setStatus(id, dto, u);
  }
}

@Module({ controllers: [QueueController], providers: [QueueService] })
export class QueueModule {}
