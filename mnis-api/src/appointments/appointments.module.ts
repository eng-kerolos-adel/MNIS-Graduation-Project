import { BadRequestException, Body, Controller, ForbiddenException, Get, Injectable, Module, NotFoundException, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { NotifType, Role } from '@prisma/client';
import { IsDateString, IsOptional, IsString, IsUUID, Length, MaxLength } from 'class-validator';
import { randomBytes } from 'crypto';
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

  private async resolveStaffScope(u: AuthUser) {
    const staff = await this.prisma.user.findUnique({
      where: { id: u.id },
      select: { id: true, email: true, role: true, specialityEn: true, licenseNo: true, facilityEn: true, facilityAr: true },
    });
    if (!staff) return { kind: 'GLOBAL' as const, doctorId: null as string | null, labUserIds: [] as string[], facilityEn: null as string | null };

    if (staff.role === Role.RECEPTIONIST && (staff.specialityEn === 'CLINIC_ASSISTANT' || staff.licenseNo?.startsWith('AST:'))) {
      const docEmail = staff.licenseNo?.startsWith('AST:') ? staff.licenseNo.slice(4).trim().toLowerCase() : null;
      const doc = await this.prisma.user.findFirst({
        where: {
          role: Role.DOCTOR,
          isActive: true,
          ...(docEmail ? { email: docEmail } : staff.facilityEn ? { facilityEn: staff.facilityEn } : {}),
        },
        select: { id: true },
      });
      return { kind: 'CLINIC_ASSISTANT' as const, doctorId: doc?.id ?? null, labUserIds: [] as string[], facilityEn: staff.facilityEn };
    }

    if (staff.role === Role.DOCTOR) {
      return { kind: 'DOCTOR' as const, doctorId: staff.id, labUserIds: [] as string[], facilityEn: staff.facilityEn };
    }

    if (staff.role === Role.LAB_TECH) {
      const labPeers = await this.prisma.user.findMany({
        where: { role: Role.LAB_TECH, isActive: true, ...(staff.facilityEn ? { facilityEn: staff.facilityEn } : { id: staff.id }) },
        select: { id: true },
      });
      return { kind: 'LAB' as const, doctorId: null as string | null, labUserIds: labPeers.map((l) => l.id), facilityEn: staff.facilityEn };
    }

    return { kind: 'GLOBAL' as const, doctorId: null as string | null, labUserIds: [] as string[], facilityEn: staff.facilityEn };
  }

  private async assertAppointmentInScope(appt: { type: string; doctorId: string | null }, u: AuthUser) {
    const scope = await this.resolveStaffScope(u);
    if (scope.kind === 'GLOBAL') return scope;
    if (scope.kind === 'DOCTOR') {
      if (appt.type !== 'CLINIC' || (appt.doctorId && appt.doctorId !== u.id)) {
        throw new ForbiddenException('OUT_OF_FACILITY_SCOPE');
      }
      return scope;
    }
    if (scope.kind === 'CLINIC_ASSISTANT') {
      if (appt.type !== 'CLINIC' || (scope.doctorId && appt.doctorId && appt.doctorId !== scope.doctorId)) {
        throw new ForbiddenException('OUT_OF_FACILITY_SCOPE');
      }
      return scope;
    }
    if (scope.kind === 'LAB') {
      if (appt.type !== 'LAB' || (appt.doctorId && !scope.labUserIds.includes(appt.doctorId))) {
        throw new ForbiddenException('OUT_OF_FACILITY_SCOPE');
      }
      return scope;
    }
    return scope;
  }

  // ---- appointments (Clinic Assistant handles only their Doctor's CLINIC; Lab Reception handles only their Lab's LAB) ----
  async listAppointments(u: AuthUser) {
    const scope = await this.resolveStaffScope(u);
    const where =
      scope.kind === 'LAB'
        ? { type: 'LAB' as const, ...(scope.labUserIds.length ? { doctorId: { in: scope.labUserIds } } : {}) }
        : scope.kind === 'DOCTOR'
          ? { type: 'CLINIC' as const, doctorId: u.id }
          : scope.kind === 'CLINIC_ASSISTANT'
            ? { type: 'CLINIC' as const, ...(scope.doctorId ? { doctorId: scope.doctorId } : {}) }
            : {};

    const rows = await this.prisma.appointment.findMany({
      where,
      include: patientInc,
      orderBy: [{ status: 'asc' }, { preferredDate: 'asc' }],
      take: 200,
    });
    const docIds = Array.from(new Set(rows.map((r) => r.doctorId).filter((x): x is string => !!x)));
    const docs = docIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: docIds } },
          select: { id: true, fullNameEn: true, fullNameAr: true, specialityEn: true, specialityAr: true, facilityEn: true, facilityAr: true },
        })
      : [];
    const docMap = new Map(docs.map((d) => [d.id, d]));
    return rows.map((r) => ({ ...r, doctor: r.doctorId ? (docMap.get(r.doctorId) ?? null) : null }));
  }

  async confirm(id: string, dto: ConfirmDto, u: AuthUser) {
    const existing = await this.prisma.appointment.findUnique({ where: { id }, include: patientInc });
    if (!existing || existing.status !== 'REQUESTED') {
      throw new BadRequestException('INVALID_STATE_TRANSITION');
    }
    const scope = await this.assertAppointmentInScope(existing, u);

    const targetProviderId = dto.doctorId || existing.doctorId || scope.doctorId || u.id;
    const provider = await this.prisma.user.findUnique({
      where: { id: targetProviderId },
      select: { id: true, role: true, fullNameEn: true, fullNameAr: true, specialityEn: true, specialityAr: true, facilityEn: true, facilityAr: true },
    });
    if (!provider) throw new BadRequestException('DOCTOR_NOT_FOUND');
    if (existing.type === 'CLINIC' && provider.role !== Role.DOCTOR) {
      throw new BadRequestException('DOCTOR_NOT_FOUND');
    }
    if (existing.type === 'LAB' && provider.role !== Role.LAB_TECH) {
      throw new BadRequestException('LAB_NOT_FOUND');
    }

    const r = await this.prisma.appointment.updateMany({
      where: { id, status: 'REQUESTED' },
      data: { status: 'CONFIRMED', scheduledAt: new Date(dto.scheduledAt), doctorId: targetProviderId, note: dto.note, decidedById: u.id, decidedAt: new Date() },
    });
    if (r.count === 0) throw new BadRequestException('INVALID_STATE_TRANSITION');

    const appt = await this.prisma.appointment.findUnique({ where: { id }, include: patientInc });
    if (appt) {
      const citizenUser = await this.prisma.user.findUnique({ where: { patientId: appt.patientId } });
      if (appt.type === 'CLINIC') {
        if (citizenUser) {
          await this.notifs.sendToUser(
            citizenUser.id,
            NotifType.APPOINTMENT_CONFIRMED,
            'Clinic Appointment Confirmed',
            'تم تأكيد موعد العيادة — بانتظار حضورك',
            `Your appointment with ${provider.fullNameEn} (${provider.facilityEn ?? 'Clinic'}) is confirmed. Please check in with the clinic assistant upon arrival.`,
            `تم تأكيد حجز موعدك مع ${provider.fullNameAr} (${provider.facilityAr ?? 'العيادة'}). يرجى الحضور وتسجيل الدخول لدى مساعد الطبيب عند الوصول.`,
            { appointmentId: appt.id, scheduledAt: dto.scheduledAt },
          );
        }
      } else {
        const panel = appt.testPanel || appt.reason;
        const sampleTypeEn = provider.facilityEn
          ? `Venous Blood / Lab Specimen @ ${provider.facilityEn}`
          : 'Venous Blood / Lab Specimen';
        const sampleTypeAr = (provider.facilityAr || provider.facilityEn)
          ? `عينة معملية @ ${provider.facilityAr || provider.facilityEn}`
          : 'عينة معملية';
        const sample = await this.prisma.labSample.create({
          data: {
            barcode: `EG${randomBytes(4).toString('hex').toUpperCase()}`,
            patientId: appt.patientId,
            panelEn: panel,
            panelAr: panel,
            sampleTypeEn,
            sampleTypeAr,
            orderedById: targetProviderId,
            priority: 'ROUTINE',
            status: 'AWAITING_COLLECTION',
          },
        });
        if (citizenUser) {
          await this.notifs.sendToUser(
            citizenUser.id,
            NotifType.APPOINTMENT_CONFIRMED,
            'Lab Appointment Confirmed & Barcode Issued',
            'تم تأكيد حجز المعمل وإصدار باركود العينة',
            `Your lab booking at ${provider.facilityEn ?? provider.fullNameEn} for (${panel}) is confirmed. Barcode: ${sample.barcode}`,
            `تم تأكيد حجزك في (${provider.facilityAr ?? provider.fullNameAr}) لإجراء (${panel}). باركود العينة: ${sample.barcode}`,
            { appointmentId: appt.id, sampleId: sample.id, barcode: sample.barcode, scheduledAt: dto.scheduledAt },
          );
        }
      }
    }

    return { ...appt, doctor: provider };
  }

  async checkIn(id: string, u: AuthUser) {
    const appt = await this.prisma.appointment.findUnique({ where: { id }, include: patientInc });
    if (!appt || appt.type !== 'CLINIC' || appt.status !== 'CONFIRMED') {
      throw new BadRequestException('APPOINTMENT_NOT_CONFIRMED_FOR_CHECKIN');
    }

    const scope = await this.assertAppointmentInScope(appt, u);
    const doctorId = appt.doctorId || scope.doctorId;

    const existingVisit = await this.prisma.visit.findFirst({
      where: {
        patientId: appt.patientId,
        ...(doctorId ? { doctorId } : {}),
        status: { in: ['WAITING', 'IN_CONSULTATION'] },
      },
      orderBy: { arrivedAt: 'desc' },
    });
    if (existingVisit) {
      return { appointment: appt, visit: existingVisit };
    }

    const count = await this.prisma.visit.count({
      where: { arrivedAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } },
    });
    const ticketNo = `A-${count + 1}`;
    const visit = await this.prisma.visit.create({
      data: {
        patientId: appt.patientId,
        doctorId: doctorId ?? null,
        reasonEn: appt.reason,
        reasonAr: appt.reason,
        ticketNo,
        status: 'WAITING',
      },
    });

    const citizenUser = await this.prisma.user.findUnique({
      where: { patientId: appt.patientId },
      select: { id: true },
    });
    if (citizenUser) {
      await this.notifs.sendToUser(
        citizenUser.id,
        NotifType.APPOINTMENT_CONFIRMED,
        'Checked In — Clinic Queue Ticket Issued',
        'تم تسجيل حضورك بالعيادة وإدراجك في طابور الدخول',
        `You are checked in and added to the clinic queue. Your ticket number is ${ticketNo}.`,
        `تم تسجيل حضورك في العيادة وإدراجك بطابور الانتظار بنجاح. رقم التذكرة: ${ticketNo}`,
        { appointmentId: appt.id, visitId: visit.id, ticketNo },
      );
    }

    return { appointment: appt, visit };
  }

  async rejectAppointment(id: string, dto: DecideDto, u: AuthUser) {
    const existing = await this.prisma.appointment.findUnique({ where: { id }, select: { type: true, doctorId: true, status: true } });
    if (!existing || existing.status !== 'REQUESTED') throw new BadRequestException('INVALID_STATE_TRANSITION');
    await this.assertAppointmentInScope(existing, u);

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
      select: { id: true, fullNameEn: true, fullNameAr: true, specialityEn: true, specialityAr: true, facilityEn: true, facilityAr: true, licenseNo: true },
      orderBy: { fullNameEn: 'asc' },
    });
  }

  // ---- prescription renewals (doctor decides) ----
  listRenewals(u: AuthUser) {
    return this.prisma.renewalRequest.findMany({
      where: {
        status: 'PENDING',
        ...(u.role === Role.DOCTOR ? { prescription: { physicianId: u.id } } : {}),
      },
      include: {
        patient: { select: PATIENT_PUBLIC_SELECT },
        prescription: { include: { items: true } },
      },
      orderBy: { createdAt: 'asc' },
      take: 200,
    });
  }

  /** Approval clones the old prescription, computes its canonical HMAC-SHA256 seal, signs it directly into the Pharmacy queue, and notifies the citizen. */
  async approveRenewal(id: string, u: AuthUser) {
    const result = await this.prisma.$transaction(async (tx) => {
      const req = await tx.renewalRequest.findUnique({
        where: { id },
        include: { prescription: { include: { items: true } } },
      });
      if (!req) throw new NotFoundException('RENEWAL_NOT_FOUND');
      if (u.role === Role.DOCTOR && req.prescription.physicianId !== u.id) {
        throw new ForbiddenException('NOT_YOUR_PRESCRIPTION');
      }
      const claimed = await tx.renewalRequest.updateMany({ where: { id, status: 'PENDING' }, data: { status: 'APPROVED', decidedById: u.id, decidedAt: new Date() } });
      if (claimed.count === 0) throw new BadRequestException('INVALID_STATE_TRANSITION');
      const old = req.prescription;
      if (!old) throw new NotFoundException('ORIGINAL_PRESCRIPTION_NOT_FOUND');
      const created = await tx.prescription.create({
        data: {
          code: `RX-${this.crypto.sha256(id + Date.now()).slice(0, 10).toUpperCase()}`,
          patientId: old.patientId, physicianId: u.id, diagnosisEn: old.diagnosisEn, diagnosisAr: old.diagnosisAr, icd10: old.icd10,
          isChronic: old.isChronic,
          items: { create: old.items.map(({ id: _i, prescriptionId: _p, ...item }) => item) },
        },
        include: { items: true },
      });
      const canonical = JSON.stringify({
        id: created.id,
        patientId: created.patientId,
        physicianId: created.physicianId,
        dx: created.diagnosisEn,
        items: created.items.map((i) => [i.nameEn, i.dose, i.quantity, i.durationDays]),
      });
      const signed = await tx.prescription.update({
        where: { id: created.id },
        data: { status: 'SIGNED', signedAt: new Date(), signatureHash: this.crypto.hmacSign(canonical) },
        include: { items: true },
      });

      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth() + 1;
      const resetAt = new Date(year, month, 1);
      for (const item of signed.items) {
        if (signed.isChronic || item.durationDays >= 30 || item.monthlyAllowance) {
          const limit = item.monthlyAllowance ?? item.quantity;
          await tx.chronicAllowance.upsert({
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

      await tx.renewalRequest.update({ where: { id }, data: { newPrescriptionId: signed.id } });
      return { renewalId: id, draftPrescriptionId: signed.id, code: signed.code, patientId: old.patientId };
    });

    const citizenUser = await this.prisma.user.findUnique({ where: { patientId: result.patientId }, select: { id: true } });
    if (citizenUser) {
      await this.notifs.sendToUser(
        citizenUser.id,
        NotifType.RENEWAL_DECIDED,
        'Prescription Renewal Approved',
        'تمت الموافقة على تجديد الروشتة وإرسالها للصيدلية',
        `Your prescription renewal (#${result.code}) has been approved, digitally signed, and sent to the pharmacy.`,
        `تم اعتماد وتوقيع تجديد روشتتك رقم (#${result.code}) وإرسالها للصيدلية للصرف.`,
        { renewalId: id, prescriptionId: result.draftPrescriptionId, code: result.code },
      );
    }
    return { renewalId: result.renewalId, draftPrescriptionId: result.draftPrescriptionId, code: result.code };
  }

  async rejectRenewal(id: string, dto: DecideDto, u: AuthUser) {
    const existing = await this.prisma.renewalRequest.findUnique({
      where: { id },
      include: { prescription: { select: { physicianId: true } } },
    });
    if (!existing) throw new NotFoundException('RENEWAL_NOT_FOUND');
    if (u.role === Role.DOCTOR && existing.prescription.physicianId !== u.id) {
      throw new ForbiddenException('NOT_YOUR_PRESCRIPTION');
    }
    const r = await this.prisma.renewalRequest.updateMany({ where: { id, status: 'PENDING' }, data: { status: 'REJECTED', note: dto.note, decidedById: u.id, decidedAt: new Date() } });
    if (r.count === 0) throw new BadRequestException('INVALID_STATE_TRANSITION');
    const updated = await this.prisma.renewalRequest.findUnique({ where: { id } });
    if (updated) {
      const citizenUser = await this.prisma.user.findUnique({ where: { patientId: updated.patientId }, select: { id: true } });
      if (citizenUser) {
        await this.notifs.sendToUser(
          citizenUser.id,
          NotifType.RENEWAL_DECIDED,
          'Prescription Renewal Rejected',
          'تحديث بخصوص طلب تجديد الروشتة',
          dto.note || 'Your prescription renewal request could not be approved. Please book a clinic follow-up.',
          dto.note || 'تعذر تجديد الروشتة تلقائياً، يرجى حجز موعد متابعة بالعيادة لمراجعة الحالة.',
          { renewalId: id },
        );
      }
    }
    return updated;
  }

  // ---- QR share redemption (doctor) ----
  async redeem(code: string, u: AuthUser) {
    const tokenHash = this.crypto.sha256(code.toUpperCase());
    const claimed = await this.prisma.shareToken.updateMany({ where: { tokenHash, usedAt: null, expiresAt: { gt: new Date() } }, data: { usedAt: new Date(), usedById: u.id } });
    if (claimed.count === 0) throw new NotFoundException('INVALID_OR_EXPIRED_CODE');
    const token = await this.prisma.shareToken.findUniqueOrThrow({ where: { tokenHash } });
    const [patient, prescriptions, labs, visits, doctor, citizenUser] = await Promise.all([
      this.prisma.patient.findUniqueOrThrow({ where: { id: token.patientId }, select: PATIENT_PUBLIC_SELECT }),
      this.prisma.prescription.findMany({ where: { patientId: token.patientId, status: { not: 'DRAFT' } }, include: { items: true }, orderBy: { createdAt: 'desc' }, take: 20 }),
      this.prisma.labSample.findMany({ where: { patientId: token.patientId, status: 'VERIFIED' }, include: { results: true }, orderBy: { verifiedAt: 'desc' }, take: 20 }),
      this.prisma.visit.findMany({ where: { patientId: token.patientId }, orderBy: { arrivedAt: 'desc' }, take: 20 }),
      this.prisma.user.findUnique({ where: { id: u.id }, select: { fullNameEn: true, fullNameAr: true } }),
      this.prisma.user.findUnique({ where: { patientId: token.patientId }, select: { id: true } }),
    ]);
    if (citizenUser) {
      await this.notifs.sendToUser(
        citizenUser.id,
        NotifType.GENERAL,
        'Medical Record Share Code Used',
        'تم استخدام كود مشاركة ملفك الطبي المؤقت',
        `${doctor?.fullNameEn ?? 'A physician'} accessed your shared medical summary using your 10-character code.`,
        `قام ${doctor?.fullNameAr ?? 'الطبيب المعالج'} بالاطلاع على ملفك الطبي عبر كود المشاركة المؤقت.`,
        { doctorId: u.id },
      );
    }
    return { patient, prescriptions, labs, visits };
  }
}

@ApiTags('appointments') @ApiBearerAuth()
@Controller()
export class AppointmentsController {
  constructor(private svc: AppointmentsService) {}

  @Audit('APPOINTMENT') @Roles(Role.RECEPTIONIST, Role.DOCTOR, Role.LAB_TECH, Role.ADMIN, Role.EXECUTIVE) @Get('appointments')
  list(@CurrentUser() u: AuthUser) { return this.svc.listAppointments(u); }
  @Audit('APPOINTMENT') @Roles(Role.RECEPTIONIST, Role.DOCTOR, Role.LAB_TECH, Role.ADMIN) @Post('appointments/:id/confirm')
  confirm(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ConfirmDto, @CurrentUser() u: AuthUser) { return this.svc.confirm(id, dto, u); }
  @Audit('APPOINTMENT') @Roles(Role.RECEPTIONIST, Role.DOCTOR, Role.ADMIN) @Post('appointments/:id/check-in')
  checkIn(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() u: AuthUser) { return this.svc.checkIn(id, u); }
  @Audit('APPOINTMENT') @Roles(Role.RECEPTIONIST, Role.DOCTOR, Role.LAB_TECH, Role.ADMIN) @Post('appointments/:id/reject')
  reject(@Param('id', ParseUUIDPipe) id: string, @Body() dto: DecideDto, @CurrentUser() u: AuthUser) { return this.svc.rejectAppointment(id, dto, u); }
  @Roles(Role.RECEPTIONIST, Role.PATIENT, Role.DOCTOR, Role.HOSPITAL_STAFF, Role.ADMIN, Role.EXECUTIVE) @Get('doctors')
  doctors() { return this.svc.doctors(); }

  @Audit('RENEWAL') @Roles(Role.DOCTOR, Role.ADMIN, Role.EXECUTIVE) @Get('renewals')
  renewals(@CurrentUser() u: AuthUser) { return this.svc.listRenewals(u); }
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
