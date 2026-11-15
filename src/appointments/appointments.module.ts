import { BadRequestException, Body, Controller, Get, Injectable, Module, NotFoundException, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { NotifType, Role } from '@prisma/client';
import { IsDateString, IsOptional, IsString, IsUUID, Length, MaxLength } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { CryptoService } from '../common/crypto.service';
import { Audit, AuthUser, CurrentUser, Roles } from '../common/decorators';
import { PATIENT_PUBLIC_SELECT } from '../patients/patient.select';
import { NotificationsModule, NotificationsService } from '../notifications/notifications.module';

export class ConfirmDto {
  @IsDateString() scheduledAt: string;
  @IsOptional() @IsUUID() doctorId?: string;
  @IsOptional() @IsString() @MaxLength(300) note?: string;
}
export class DecideDto { @IsOptional() @IsString() @MaxLength(300) note?: string; }
export class RedeemDto { @IsString() @Length(10, 10) code: string; }

const patientInc = { patient: { select: PATIENT_PUBLIC_SELECT } };

@Injectable()
export class AppointmentsService {
  constructor(
    private prisma: PrismaService,
    private crypto: CryptoService,
    private notifs: NotificationsService,
  ) {}

  // ---- appointments (reception confirms; doctors see their own) ----
  listAppointments(u: AuthUser) {
    return this.prisma.appointment.findMany({
      where: u.role === Role.DOCTOR ? { doctorId: u.id } : {},
      include: patientInc, orderBy: [{ status: 'asc' }, { preferredDate: 'asc' }], take: 200,
    });
  }

  async confirm(id: string, dto: ConfirmDto, u: AuthUser) {
    let doctorNameEn = 'Assigned Physician';
    let doctorNameAr = 'الطبيب المختص';
    if (dto.doctorId) {
      const d = await this.prisma.user.findFirst({ where: { id: dto.doctorId, role: Role.DOCTOR, isActive: true } });
      if (!d) throw new BadRequestException('DOCTOR_NOT_FOUND');
      doctorNameEn = d.fullNameEn;
      doctorNameAr = d.fullNameAr;
    }

    const r = await this.prisma.appointment.updateMany({
      where: { id, status: 'REQUESTED' },
      data: { status: 'CONFIRMED', scheduledAt: new Date(dto.scheduledAt), doctorId: dto.doctorId, note: dto.note, decidedById: u.id, decidedAt: new Date() },
    });
    if (r.count === 0) throw new BadRequestException('INVALID_STATE_TRANSITION');
    
    // Auto queue patient into Doctor's live waiting queue
    const appt = await this.prisma.appointment.findUnique({ where: { id }, include: patientInc });
    if (appt) {
      const count = await this.prisma.visit.count({ where: { arrivedAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } } });
      const ticketNo = `A-${count + 1}`;
      await this.prisma.visit.create({
        data: {
          patientId: appt.patientId,
          doctorId: appt.doctorId,
          reasonEn: appt.reason,
          reasonAr: appt.reason,
          ticketNo,
          status: 'WAITING'
        }
      });

      // Notify Citizen on Mobile App
      const citizenUser = await this.prisma.user.findUnique({ where: { patientId: appt.patientId } });
      if (citizenUser) {
        await this.notifs.sendToUser(
          citizenUser.id,
          NotifType.APPOINTMENT_CONFIRMED,
          'Appointment Confirmed & Queued',
          'تم تأكيد موعدك وإدراجك بطابور الطبيب',
          `Your appointment with ${doctorNameEn} is confirmed. Queue Ticket: ${ticketNo}`,
          `تم تأكيد موعدك مع ${doctorNameAr}. رقم تذكرة الطابور: ${ticketNo}`,
          { appointmentId: appt.id, ticketNo, scheduledAt: dto.scheduledAt }
        );
      }
    }
    
    return appt;
  }

  async rejectAppointment(id: string, dto: DecideDto, u: AuthUser) {
    const r = await this.prisma.appointment.updateMany({ where: { id, status: 'REQUESTED' }, data: { status: 'REJECTED', note: dto.note, decidedById: u.id, decidedAt: new Date() } });
    if (r.count === 0) throw new BadRequestException('INVALID_STATE_TRANSITION');
    const appt = await this.prisma.appointment.findUnique({ where: { id }, include: patientInc });
    if (appt) {
      const citizenUser = await this.prisma.user.findUnique({ where: { patientId: appt.patientId } });
      if (citizenUser) {
        await this.notifs.sendToUser(
          citizenUser.id,
          NotifType.APPOINTMENT_REJECTED,
          'Appointment Request Update',
          'تحديث بخصوص طلب الموعد',
          dto.note || 'Your requested appointment slot was unavailable. Please pick another date.',
          dto.note || 'الموعد المطلوب غير متاح حالياً، يرجى اختيار موعد آخر.',
          { appointmentId: appt.id }
        );
      }
    }
    return appt;
  }

  doctors() {
    return this.prisma.user.findMany({
      where: { role: Role.DOCTOR, isActive: true },
      select: { id: true, fullNameEn: true, fullNameAr: true, specialityEn: true, specialityAr: true }
    });
  }

  // ---- prescription renewals (doctor decides) ----
  listRenewals() {
    return this.prisma.renewalRequest.findMany({ where: { status: 'PENDING' }, include: patientInc, orderBy: { createdAt: 'asc' }, take: 200 });
  }

  /** Approval clones the old prescription as a fresh DRAFT owned by the approving doctor; they still review and sign it. */
  async approveRenewal(id: string, u: AuthUser) {
    return this.prisma.$transaction(async (tx) => {
      const claimed = await tx.renewalRequest.updateMany({ where: { id, status: 'PENDING' }, data: { status: 'APPROVED', decidedById: u.id, decidedAt: new Date() } });
      if (claimed.count === 0) throw new BadRequestException('INVALID_STATE_TRANSITION');
      const req = await tx.renewalRequest.findUniqueOrThrow({ where: { id } });
      const old = await tx.prescription.findUnique({ where: { id: req.prescriptionId }, include: { items: true } });
      if (!old) throw new NotFoundException('ORIGINAL_PRESCRIPTION_NOT_FOUND');
      const draft = await tx.prescription.create({
        data: {
          code: `RX-${this.crypto.sha256(id + Date.now()).slice(0, 10).toUpperCase()}`,
          patientId: old.patientId, physicianId: u.id, diagnosisEn: old.diagnosisEn, diagnosisAr: old.diagnosisAr, icd10: old.icd10,
          isChronic: old.isChronic,
          items: { create: old.items.map(({ id: _i, prescriptionId: _p, ...item }) => item) },
        },
      });
      await tx.renewalRequest.update({ where: { id }, data: { newPrescriptionId: draft.id } });
      return { renewalId: id, draftPrescriptionId: draft.id };
    });
  }

  async rejectRenewal(id: string, dto: DecideDto, u: AuthUser) {
    const r = await this.prisma.renewalRequest.updateMany({ where: { id, status: 'PENDING' }, data: { status: 'REJECTED', note: dto.note, decidedById: u.id, decidedAt: new Date() } });
    if (r.count === 0) throw new BadRequestException('INVALID_STATE_TRANSITION');
    return this.prisma.renewalRequest.findUnique({ where: { id } });
  }

  // ---- QR share redemption (doctor) ----
  async redeem(code: string, u: AuthUser) {
    const tokenHash = this.crypto.sha256(code.toUpperCase());
    const claimed = await this.prisma.shareToken.updateMany({ where: { tokenHash, usedAt: null, expiresAt: { gt: new Date() } }, data: { usedAt: new Date(), usedById: u.id } });
    if (claimed.count === 0) throw new NotFoundException('INVALID_OR_EXPIRED_CODE');
    const token = await this.prisma.shareToken.findUniqueOrThrow({ where: { tokenHash } });
    const [patient, prescriptions, labs, visits] = await Promise.all([
      this.prisma.patient.findUniqueOrThrow({ where: { id: token.patientId }, select: PATIENT_PUBLIC_SELECT }),
      this.prisma.prescription.findMany({ where: { patientId: token.patientId, status: { not: 'DRAFT' } }, include: { items: true }, orderBy: { createdAt: 'desc' }, take: 20 }),
      this.prisma.labSample.findMany({ where: { patientId: token.patientId, status: 'VERIFIED' }, include: { results: true }, orderBy: { verifiedAt: 'desc' }, take: 20 }),
      this.prisma.visit.findMany({ where: { patientId: token.patientId }, orderBy: { arrivedAt: 'desc' }, take: 20 }),
    ]);
    return { patient, prescriptions, labs, visits };
  }
}

@ApiTags('appointments') @ApiBearerAuth()
@Controller()
export class AppointmentsController {
  constructor(private svc: AppointmentsService) {}

  @Audit('APPOINTMENT') @Roles(Role.RECEPTIONIST, Role.DOCTOR, Role.ADMIN, Role.EXECUTIVE) @Get('appointments')
  list(@CurrentUser() u: AuthUser) { return this.svc.listAppointments(u); }
  @Audit('APPOINTMENT') @Roles(Role.RECEPTIONIST, Role.DOCTOR, Role.ADMIN) @Post('appointments/:id/confirm')
  confirm(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ConfirmDto, @CurrentUser() u: AuthUser) { return this.svc.confirm(id, dto, u); }
  @Audit('APPOINTMENT') @Roles(Role.RECEPTIONIST, Role.DOCTOR, Role.ADMIN) @Post('appointments/:id/reject')
  reject(@Param('id', ParseUUIDPipe) id: string, @Body() dto: DecideDto, @CurrentUser() u: AuthUser) { return this.svc.rejectAppointment(id, dto, u); }
  @Roles(Role.RECEPTIONIST, Role.PATIENT, Role.DOCTOR, Role.HOSPITAL_STAFF, Role.ADMIN, Role.EXECUTIVE) @Get('doctors')
  doctors() { return this.svc.doctors(); }

  @Audit('RENEWAL') @Roles(Role.DOCTOR, Role.ADMIN, Role.EXECUTIVE) @Get('renewals')
  renewals() { return this.svc.listRenewals(); }
  @Audit('RENEWAL') @Roles(Role.DOCTOR, Role.ADMIN) @Post('renewals/:id/approve')
  approve(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() u: AuthUser) { return this.svc.approveRenewal(id, u); }
  @Audit('RENEWAL') @Roles(Role.DOCTOR, Role.ADMIN) @Post('renewals/:id/reject')
  rejectRenewal(@Param('id', ParseUUIDPipe) id: string, @Body() dto: DecideDto, @CurrentUser() u: AuthUser) { return this.svc.rejectRenewal(id, dto, u); }

  /** Brute-force guard: 10 attempts / minute per client on a 50-bit, single-use, 10-minute code. */
  @Audit('SHARED_RECORD') @Roles(Role.DOCTOR, Role.ADMIN) @Throttle({ default: { limit: 10, ttl: 60_000 } }) @Post('shares/redeem')
  redeem(@Body() dto: RedeemDto, @CurrentUser() u: AuthUser) { return this.svc.redeem(dto.code, u); }
}

@Module({ imports: [NotificationsModule], controllers: [AppointmentsController], providers: [AppointmentsService] })
export class AppointmentsModule {}
