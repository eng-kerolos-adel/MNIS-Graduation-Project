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
  OnModuleInit,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { AppointmentStatus, Role } from '@prisma/client';
import {
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { Audit, AuthUser, CurrentUser, Roles } from '../common/decorators';
import { isProd } from '../config/env';

// ─────────────────────────────────────────────────────────────────────────────
//  DTOs
// ─────────────────────────────────────────────────────────────────────────────

const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

export class CreateScheduleDto {
  /** Day of week: 0 = Sunday, 6 = Saturday (JS convention). */
  @IsInt()
  @Min(0)
  @Max(6)
  dayOfWeek: number;

  /** Slot window start — 24-hour "HH:MM". */
  @IsString()
  @Matches(TIME_REGEX, { message: 'startTime must be HH:MM (24-hour)' })
  startTime: string;

  /** Slot window end — 24-hour "HH:MM". */
  @IsString()
  @Matches(TIME_REGEX, { message: 'endTime must be HH:MM (24-hour)' })
  endTime: string;

  /** Appointment slot duration in minutes. Defaults to 20. */
  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(240)
  slotMinutes?: number;
}

export class DeleteScheduleDto {
  /** UUID of the DoctorSchedule row to delete. */
  @IsString()
  scheduleId: string;
}

// ─────────────────────────────────────────────────────────────────────────────
//  Internal types
// ─────────────────────────────────────────────────────────────────────────────

interface TimeSlot {
  slotStart: string;
  slotEnd: string;
}

interface DoctorSummary {
  id: string;
  fullNameEn: string;
  fullNameAr: string;
  specialityEn: string | null;
  specialityAr: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
//  Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Parse "HH:MM" into total minutes from midnight. */
function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/** Format total minutes from midnight back to "HH:MM". */
function fromMinutes(total: number): string {
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * Given an ISO date string (YYYY-MM-DD) return the day-of-week integer
 * using JS convention (0 = Sunday … 6 = Saturday) in UTC so that the
 * date doesn't shift with the server's local timezone.
 */
function dayOfWeekFromDate(dateStr: string): number {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

/**
 * Build Date objects for the start and end of a calendar day (UTC) from an
 * ISO date string.  These are used to filter Appointment rows by scheduledAt.
 */
function dayBounds(dateStr: string): { dayStart: Date; dayEnd: Date } {
  const [year, month, day] = dateStr.split('-').map(Number);
  const dayStart = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
  const dayEnd = new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999));
  return { dayStart, dayEnd };
}

// ─────────────────────────────────────────────────────────────────────────────
//  Service
// ─────────────────────────────────────────────────────────────────────────────

@Injectable()
export class DoctorScheduleService implements OnModuleInit {
  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    // Run roster bootstrap asynchronously so port 3001 binds immediately without waiting on remote DB roundtrips.
    void this.ensureNationwideRoster().catch(() => undefined);
  }

  private async ensureNationwideRoster() {
    if (isProd && process.env.SEED_ON_DEPLOY !== 'true') return;

    const alreadySeeded = await this.prisma.user.findUnique({
      where: { email: 'alborg.director@mnis.demo' },
      select: { id: true },
    });
    if (alreadySeeded) return;

    const demoPassword = process.env.SEED_PASSWORD || 'MnisDemo#2026!Secure';
    const passwordHash = await argon2.hash(demoPassword);

    const doctorsSpec: Array<[string, string, string, string, string, string, string, string]> = [
      ['doctor@mnis.demo', 'Dr. Tarek Mahmoud', 'د. طارق محمود', 'EGY-DOC-184920', 'Cardiology & Vascular Medicine', 'أمراض القلب والأوعية الدموية', 'Kasr Al-Ainy Cairo University Hospital (Cairo)', 'مستشفى قصر العيني الجامعي — القاهرة'],
      ['doctor2@mnis.demo', 'Dr. Nadia El-Sayed', 'د. نادية السيد', 'EGY-DOC-209311', 'Endocrinology & Diabetes', 'الغدد الصماء والسكري', 'Ain Shams Specialized Hospital (Cairo)', 'مستشفى عين شمس التخصصي — القاهرة'],
      ['doctor3@mnis.demo', 'Dr. Hossam El-Din Mostafa', 'د. حسام الدين مصطفى', 'EGY-DOC-310442', 'Orthopedic & Spine Surgery', 'جراحة العظام والعمود الفقري', 'International Medical Center (Giza)', 'المركز الطبي العالمي — الجيزة'],
      ['doctor4@mnis.demo', 'Dr. Mariam Abdel-Aziz', 'د. مريم عبد العزيز', 'EGY-DOC-418905', 'Pediatrics & Neonatology', 'طب الأطفال وحديثي الولادة', 'Smouha University Hospital (Alexandria)', 'مستشفى سموحة الجامعي — الإسكندرية'],
      ['doctor5@mnis.demo', 'Dr. Khaled El-Alfy', 'د. خالد الألفي', 'EGY-DOC-529104', 'Nephrology & Urology', 'أمراض الكلى والمسالك البولية', 'Mansoura Urology & Nephrology Center (Dakahlia)', 'مركز الكلى والمسالك بالمنصورة — الدقهلية'],
      ['doctor6@mnis.demo', 'Dr. Yasser El-Noby', 'د. ياسر النوبي', 'EGY-DOC-639812', 'Internal Medicine & Hepatology', 'الباطنة والجهاز الهضمي والكبد', 'Aswan University Hospital (Aswan)', 'مستشفى أسوان الجامعي — أسوان'],
    ];

    for (const [email, fullNameEn, fullNameAr, licenseNo, specialityEn, specialityAr, facilityEn, facilityAr] of doctorsSpec) {
      const doc = await this.prisma.user.upsert({
        where: { email },
        update: { specialityEn, specialityAr, facilityEn, facilityAr, licenseNo },
        create: { email, role: Role.DOCTOR, fullNameEn, fullNameAr, licenseNo, specialityEn, specialityAr, facilityEn, facilityAr, passwordHash },
      });
      for (let d = 0; d <= 6; d++) {
        await this.prisma.doctorSchedule.upsert({
          where: { doctorId_dayOfWeek_startTime: { doctorId: doc.id, dayOfWeek: d, startTime: '09:00' } },
          update: {},
          create: { doctorId: doc.id, dayOfWeek: d, startTime: '09:00', endTime: '17:00', slotMinutes: 20, isActive: true },
        });
      }
    }

    const assistantsSpec: Array<[string, string, string, string, string, string]> = [
      ['assistant@mnis.demo', 'Karim Adel (Dr. Tarek Clinic Assistant)', 'أ. كريم عادل (مساعد عيادة د. طارق محمود)', 'AST:doctor@mnis.demo', 'Kasr Al-Ainy Cairo University Hospital (Cairo)', 'عيادة القلب — مستشفى قصر العيني الجامعي'],
      ['assistant2@mnis.demo', 'Salma Magdy (Dr. Nadia Clinic Assistant)', 'أ. سلمى مجدي (مساعد عيادة د. نادية السيد)', 'AST:doctor2@mnis.demo', 'Ain Shams Specialized Hospital (Cairo)', 'عيادة الغدد الصماء — مستشفى عين شمس التخصصي'],
    ];
    for (const [email, fullNameEn, fullNameAr, licenseNo, facilityEn, facilityAr] of assistantsSpec) {
      await this.prisma.user.upsert({
        where: { email },
        update: { role: Role.RECEPTIONIST, fullNameEn, fullNameAr, licenseNo, specialityEn: 'CLINIC_ASSISTANT', specialityAr: 'مساعد طبيب وإدارة عيادة', facilityEn, facilityAr },
        create: { email, role: Role.RECEPTIONIST, fullNameEn, fullNameAr, licenseNo, specialityEn: 'CLINIC_ASSISTANT', specialityAr: 'مساعد طبيب وإدارة عيادة', facilityEn, facilityAr, passwordHash },
      });
    }

    const refLabFacEn = 'National Reference Lab — Cairo (MoHP)';
    const refLabFacAr = 'المعمل المرجعي القومي بوزارة الصحة — القاهرة';
    const refLabAccounts: Array<[string, string, string, string, string, string]> = [
      ['lab.reception@mnis.demo', 'Ref Lab Reception & Intake Officer', 'استقبال وسحب عينات المعمل المرجعي', 'LB-4470-REC', 'LAB_RECEPTION', 'استقبال وسحب عينات المعمل'],
      ['lab1@mnis.demo', 'Dr. Omar Hassan (Ref Lab Specialist)', 'د. عمر حسن (أخصائي تحاليل المعمل المرجعي)', 'LB-4471', 'Diagnostic Lab Specialist', 'أخصائي التحاليل الطبية الباثولوجية'],
      ['lab2@mnis.demo', 'Dr. Hany Soliman (Ref Lab Director & Verifier)', 'د. هاني سليمان (مدير ومعتمد نتائج المعمل المرجعي)', 'LB-4472-DIR', 'Lab Director & Senior Verifier', 'مدير المعمل ومعتمد النتائج النهائية'],
    ];
    for (const [email, fullNameEn, fullNameAr, licenseNo, specialityEn, specialityAr] of refLabAccounts) {
      await this.prisma.user.upsert({
        where: { email },
        update: { role: Role.LAB_TECH, fullNameEn, fullNameAr, licenseNo, specialityEn, specialityAr, facilityEn: refLabFacEn, facilityAr: refLabFacAr },
        create: { email, role: Role.LAB_TECH, fullNameEn, fullNameAr, licenseNo, specialityEn, specialityAr, facilityEn: refLabFacEn, facilityAr: refLabFacAr, passwordHash },
      });
    }

    const regionalLabsSpec: Array<[string, string, string, string, string, string, string]> = [
      ['alborg', 'alborg.lab@mnis.demo', 'Al-Borg Central Lab Reception', 'استقبال معامل البرج التشخيصية', 'LAB-EG-102', 'Al-Borg Central Diagnostics — Dokki, Giza', 'معامل البرج التشخيصية المركزية — الدقي، الجيزة'],
      ['almokhtabar', 'almokhtabar.lab@mnis.demo', 'Al-Mokhtabar Alexandria Lab Reception', 'استقبال معامل المختبر الإقليمية', 'LAB-EG-103', 'Al-Mokhtabar Regional Lab — Smouha, Alexandria', 'معامل المختبر الإقليمية — سموحة، الإسكندرية'],
      ['ainshams', 'ainshams.lab@mnis.demo', 'Ain Shams Specialized Lab Reception', 'استقبال معمل عين شمس التخصصي', 'LAB-EG-104', 'Ain Shams Specialized Diagnostic Lab — Cairo', 'معمل مستشفى عين شمس التخصصي — القاهرة'],
      ['mansoura', 'mansoura.lab@mnis.demo', 'Delta Mansoura Lab Reception', 'استقبال معمل الدلتا الإقليمي', 'LAB-EG-105', 'Delta Regional Medical Lab — Mansoura, Dakahlia', 'معمل الدلتا الإقليمي للتحاليل الطبية — المنصورة'],
      ['aswan', 'aswan.lab@mnis.demo', 'Upper Egypt Aswan Lab Reception', 'استقبال معمل صعيد مصر المرجعي', 'LAB-EG-106', 'Upper Egypt Reference Lab — Aswan University Hospital', 'معمل صعيد مصر المرجعي — مستشفى أسوان الجامعي'],
    ];
    for (const [prefix, recEmail, fullNameEn, fullNameAr, licenseNo, facilityEn, facilityAr] of regionalLabsSpec) {
      await this.prisma.user.upsert({
        where: { email: recEmail },
        update: { role: Role.LAB_TECH, fullNameEn, fullNameAr, licenseNo, facilityEn, facilityAr, specialityEn: 'LAB_RECEPTION', specialityAr: 'استقبال وسحب عينات المعمل' },
        create: { email: recEmail, role: Role.LAB_TECH, fullNameEn, fullNameAr, licenseNo, specialityEn: 'LAB_RECEPTION', specialityAr: 'استقبال وسحب عينات المعمل', facilityEn, facilityAr, passwordHash },
      });
      await this.prisma.user.upsert({
        where: { email: `${prefix}.specialist@mnis.demo` },
        update: { role: Role.LAB_TECH, facilityEn, facilityAr, specialityEn: 'Diagnostic Lab Specialist', specialityAr: 'أخصائي التحاليل الطبية الباثولوجية' },
        create: {
          email: `${prefix}.specialist@mnis.demo`,
          role: Role.LAB_TECH,
          fullNameEn: `Lab Specialist — ${facilityEn.split(' — ')[0]}`,
          fullNameAr: `أخصائي تحاليل — ${facilityAr.split(' — ')[0]}`,
          licenseNo: `${licenseNo}-SPEC`,
          specialityEn: 'Diagnostic Lab Specialist',
          specialityAr: 'أخصائي التحاليل الطبية الباثولوجية',
          facilityEn,
          facilityAr,
          passwordHash,
        },
      });
      await this.prisma.user.upsert({
        where: { email: `${prefix}.director@mnis.demo` },
        update: { role: Role.LAB_TECH, facilityEn, facilityAr, specialityEn: 'Lab Director & Senior Verifier', specialityAr: 'مدير المعمل ومعتمد النتائج النهائية' },
        create: {
          email: `${prefix}.director@mnis.demo`,
          role: Role.LAB_TECH,
          fullNameEn: `Lab Director & Verifier — ${facilityEn.split(' — ')[0]}`,
          fullNameAr: `مدير ومعتمد النتائج — ${facilityAr.split(' — ')[0]}`,
          licenseNo: `${licenseNo}-DIR`,
          specialityEn: 'Lab Director & Senior Verifier',
          specialityAr: 'مدير المعمل ومعتمد النتائج النهائية',
          facilityEn,
          facilityAr,
          passwordHash,
        },
      });
    }

    const hospitalsSpec: Array<[string, string, string, string, string, string, string]> = [
      ['hospital.kasr@mnis.demo', 'Kasr Al-Ainy ER & Operations Officer', 'مسؤول طوارئ وعمليات قصر العيني', 'HOSP-EG-101', 'Kasr Al-Ainy Cairo University Hospital (Cairo)', 'مستشفى قصر العيني الجامعي — القاهرة', 'KSR'],
      ['hospital.ainshams@mnis.demo', 'Ain Shams Specialized ER Officer', 'مسؤول طوارئ مستشفى عين شمس التخصصي', 'HOSP-EG-102', 'Ain Shams Specialized Hospital (Cairo)', 'مستشفى عين شمس التخصصي — القاهرة', 'ASH'],
      ['hospital.smouha@mnis.demo', 'Smouha University Hospital ER Officer', 'مسؤول طوارئ مستشفى سموحة الجامعي', 'HOSP-EG-103', 'Smouha University Hospital (Alexandria)', 'مستشفى سموحة الجامعي — الإسكندرية', 'SMH'],
      ['hospital.aswan@mnis.demo', 'Aswan University Hospital ER Officer', 'مسؤول طوارئ مستشفى أسوان الجامعي', 'HOSP-EG-104', 'Aswan University Hospital (Aswan)', 'مستشفى أسوان الجامعي — أسوان', 'ASW'],
    ];
    for (const [email, fullNameEn, fullNameAr, licenseNo, facilityEn, facilityAr, code] of hospitalsSpec) {
      await this.prisma.user.upsert({
        where: { email },
        update: { facilityEn, facilityAr, specialityEn: 'Emergency & Inpatient Operations', specialityAr: 'عمليات الطوارئ والتنويم بالمستشفى' },
        create: { email, role: Role.HOSPITAL_STAFF, fullNameEn, fullNameAr, licenseNo, specialityEn: 'Emergency & Inpatient Operations', specialityAr: 'عمليات الطوارئ والتنويم بالمستشفى', facilityEn, facilityAr, passwordHash },
      });
      const existingHospitalBeds = await this.prisma.bed.count({
        where: { wardEn: { contains: facilityEn } },
      });
      if (existingHospitalBeds === 0) {
        await this.prisma.bed.upsert({
          where: { bedNumber: `${code}-ICU-1` },
          update: {},
          create: {
            wardEn: `ICU — ${facilityEn}`,
            wardAr: `العناية المركزة — ${facilityAr}`,
            bedNumber: `${code}-ICU-1`,
            status: 'AVAILABLE',
          },
        });
        await this.prisma.bed.upsert({
          where: { bedNumber: `${code}-GEN-2` },
          update: {},
          create: {
            wardEn: `General Ward — ${facilityEn}`,
            wardAr: `الأقسام الداخلية — ${facilityAr}`,
            bedNumber: `${code}-GEN-2`,
            status: 'AVAILABLE',
          },
        });
      }
    }
  }

  // ── Schedule CRUD ──────────────────────────────────────────────────────────

  /** Returns the authenticated doctor's schedule ordered by dayOfWeek then startTime. */
  async getMySchedule(doctorId: string, role?: Role) {
    const own = await this.prisma.doctorSchedule.findMany({
      where: { doctorId, isActive: true },
      orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
    });
    if (own.length > 0 || role === Role.DOCTOR) return own;
    const firstDoc = await this.prisma.user.findFirst({
      where: { role: Role.DOCTOR, isActive: true },
      select: { id: true },
    });
    if (!firstDoc) return [];
    return this.prisma.doctorSchedule.findMany({
      where: { doctorId: firstDoc.id, isActive: true },
      orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
    });
  }

  /**
   * Returns a specific doctor's schedule — used by reception when booking an
   * appointment on behalf of a patient.
   */
  async getScheduleFor(doctorId: string) {
    const doctor = await this.prisma.user.findFirst({
      where: { id: doctorId, role: Role.DOCTOR, isActive: true },
      select: { id: true },
    });
    if (!doctor) throw new NotFoundException('DOCTOR_NOT_FOUND');

    return this.prisma.doctorSchedule.findMany({
      where: { doctorId, isActive: true },
      orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
    });
  }

  /**
   * Creates or updates a schedule entry.
   * Uniqueness is enforced on (doctorId, dayOfWeek, startTime).
   * If a soft-deleted row already exists for that combination it is reactivated.
   */
  async upsertSlot(dto: CreateScheduleDto, doctorId: string) {
    const startMins = toMinutes(dto.startTime);
    const endMins = toMinutes(dto.endTime);

    if (endMins <= startMins) {
      throw new BadRequestException('endTime must be after startTime');
    }

    const window = endMins - startMins;
    const slotMinutes = dto.slotMinutes ?? 20;

    if (slotMinutes > window) {
      throw new BadRequestException(
        'slotMinutes must not exceed the time window (endTime − startTime)',
      );
    }

    // Upsert on the unique index (doctorId, dayOfWeek, startTime).
    return this.prisma.doctorSchedule.upsert({
      where: {
        doctorId_dayOfWeek_startTime: {
          doctorId,
          dayOfWeek: dto.dayOfWeek,
          startTime: dto.startTime,
        },
      },
      create: {
        doctorId,
        dayOfWeek: dto.dayOfWeek,
        startTime: dto.startTime,
        endTime: dto.endTime,
        slotMinutes,
        isActive: true,
      },
      update: {
        endTime: dto.endTime,
        slotMinutes,
        isActive: true,
      },
    });
  }

  /**
   * Hard-deletes a single schedule row.  Only the owning doctor may delete it.
   */
  async deleteSlot(scheduleId: string, doctorId: string) {
    const row = await this.prisma.doctorSchedule.findUnique({
      where: { id: scheduleId },
    });
    if (!row) throw new NotFoundException('SCHEDULE_SLOT_NOT_FOUND');
    if (row.doctorId !== doctorId) throw new ForbiddenException('NOT_YOUR_SLOT');

    await this.prisma.doctorSchedule.delete({ where: { id: scheduleId } });
    return { deleted: true, id: scheduleId };
  }

  // ── Slot availability ──────────────────────────────────────────────────────

  /**
   * Computes free appointment slots for a doctor on a given calendar date.
   *
   * Algorithm:
   *  1. Find the DoctorSchedule row matching dayOfWeek.
   *  2. Enumerate all candidate HH:MM slots by splitting the window by slotMinutes.
   *  3. Fetch all CONFIRMED or REQUESTED appointments for that doctor on that date.
   *  4. Remove candidate slots whose slotStart collides with an existing appointment's
   *     scheduledAt time (truncated to HH:MM in UTC).
   *
   * Returns an array of { slotStart, slotEnd } objects.
   */
  async getAvailableSlots(doctorId: string, date: string): Promise<TimeSlot[]> {
    // Validate date format
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new BadRequestException('date must be in YYYY-MM-DD format');
    }

    const dayOfWeek = dayOfWeekFromDate(date);

    const schedule = await this.prisma.doctorSchedule.findFirst({
      where: { doctorId, dayOfWeek, isActive: true },
      orderBy: { startTime: 'asc' },
    });

    const effectiveSchedule = schedule ?? { startTime: '09:00', endTime: '16:00', slotMinutes: 20 };

    // Generate all candidate slots for this window.
    const allSlots: TimeSlot[] = [];
    const startMins = toMinutes(effectiveSchedule.startTime);
    const endMins = toMinutes(effectiveSchedule.endTime);
    const step = effectiveSchedule.slotMinutes;

    for (let cursor = startMins; cursor + step <= endMins; cursor += step) {
      allSlots.push({
        slotStart: fromMinutes(cursor),
        slotEnd: fromMinutes(cursor + step),
      });
    }

    if (allSlots.length === 0) return [];

    // Fetch booked appointments for this doctor on this date.
    const bookedStatuses: AppointmentStatus[] = [
      AppointmentStatus.CONFIRMED,
      AppointmentStatus.REQUESTED,
    ];
    const { dayStart, dayEnd } = dayBounds(date);

    const bookedAppointments = await this.prisma.appointment.findMany({
      where: {
        doctorId,
        status: { in: bookedStatuses },
        scheduledAt: { gte: dayStart, lte: dayEnd },
      },
      select: { scheduledAt: true },
    });

    // Build a set of already-taken "HH:MM" start times.
    const takenTimes = new Set<string>(
      bookedAppointments
        .filter((a) => a.scheduledAt !== null)
        .map((a) => {
          const d = a.scheduledAt as Date;
          return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
        }),
    );

    return allSlots.filter((slot) => !takenTimes.has(slot.slotStart));
  }

  // ── Doctor & Lab listing ───────────────────────────────────────────────────

  /** Lists all active doctors nationwide with bilingual name, speciality, and facility fields. */
  listDoctors() {
    return this.prisma.user.findMany({
      where: { role: Role.DOCTOR, isActive: true },
      select: {
        id: true,
        fullNameEn: true,
        fullNameAr: true,
        specialityEn: true,
        specialityAr: true,
        facilityEn: true,
        facilityAr: true,
        licenseNo: true,
      },
      orderBy: { fullNameEn: 'asc' },
    });
  }

  /** Lists all registered laboratories across Egypt with their reception officer ID for appointment routing. */
  async listLabs() {
    const labStaff = await this.prisma.user.findMany({
      where: { role: Role.LAB_TECH, isActive: true },
      select: {
        id: true,
        fullNameEn: true,
        fullNameAr: true,
        specialityEn: true,
        specialityAr: true,
        facilityEn: true,
        facilityAr: true,
        licenseNo: true,
      },
      orderBy: { createdAt: 'asc' },
    });
    const sorted = [...labStaff].sort((a, b) => {
      const aRec = a.specialityEn === 'LAB_RECEPTION' ? 0 : 1;
      const bRec = b.specialityEn === 'LAB_RECEPTION' ? 0 : 1;
      return aRec - bRec;
    });
    const seen = new Set<string>();
    const out: Array<{
      id: string;
      nameEn: string;
      nameAr: string;
      staffNameEn: string;
      staffNameAr: string;
      licenseNo: string | null;
    }> = [];
    for (const u of sorted) {
      const key = u.facilityEn || u.id;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        id: u.id,
        nameEn: u.facilityEn || u.fullNameEn,
        nameAr: u.facilityAr || u.fullNameAr,
        staffNameEn: u.fullNameEn,
        staffNameAr: u.fullNameAr,
        licenseNo: u.licenseNo,
      });
    }
    return out;
  }

  /** Lists all registered hospitals across Egypt for referrals and hospital directory. */
  async listHospitals() {
    const staff = await this.prisma.user.findMany({
      where: { role: Role.HOSPITAL_STAFF, isActive: true },
      select: {
        id: true,
        fullNameEn: true,
        fullNameAr: true,
        facilityEn: true,
        facilityAr: true,
        licenseNo: true,
      },
      orderBy: { createdAt: 'asc' },
    });
    const seen = new Set<string>();
    const out: Array<{
      id: string;
      nameEn: string;
      nameAr: string;
      staffNameEn: string;
      staffNameAr: string;
      licenseNo: string | null;
    }> = [];
    for (const u of staff) {
      const key = u.facilityEn || u.id;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        id: u.id,
        nameEn: u.facilityEn || u.fullNameEn,
        nameAr: u.facilityAr || u.fullNameAr,
        staffNameEn: u.fullNameEn,
        staffNameAr: u.fullNameAr,
        licenseNo: u.licenseNo,
      });
    }
    return out;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  Controller
// ─────────────────────────────────────────────────────────────────────────────

@ApiTags('schedule')
@ApiBearerAuth()
@Controller('schedule')
export class DoctorScheduleController {
  constructor(private readonly svc: DoctorScheduleService) {}

  // ── Doctor & Lab listing ───────────────────────────────────────────────────

  /**
   * GET /schedule/doctors
   * Lists all active doctors — used by the booking UI in the receptionist and
   * patient-facing apps to populate the "choose a doctor" step.
   */
  @Audit('SCHEDULE')
  @Roles(Role.RECEPTIONIST, Role.DOCTOR, Role.LAB_TECH, Role.PATIENT, Role.ADMIN, Role.EXECUTIVE)
  @Get('doctors')
  listDoctors() {
    return this.svc.listDoctors();
  }

  /**
   * GET /schedule/labs
   * Lists all registered laboratories across Egypt for citizen lab appointment booking.
   */
  @Audit('SCHEDULE')
  @Roles(Role.RECEPTIONIST, Role.DOCTOR, Role.LAB_TECH, Role.PATIENT, Role.ADMIN, Role.EXECUTIVE)
  @Get('labs')
  listLabs() {
    return this.svc.listLabs();
  }

  /**
   * GET /schedule/hospitals
   * Lists all registered hospitals across Egypt for inter-facility referrals and bed coordination.
   */
  @Audit('SCHEDULE')
  @Roles(Role.RECEPTIONIST, Role.DOCTOR, Role.LAB_TECH, Role.HOSPITAL_STAFF, Role.PATIENT, Role.ADMIN, Role.EXECUTIVE)
  @Get('hospitals')
  listHospitals() {
    return this.svc.listHospitals();
  }

  // ── Available slots ────────────────────────────────────────────────────────

  /**
   * GET /schedule/doctors/:doctorId/slots?date=YYYY-MM-DD
   * Returns the free appointment slots for a specific doctor on a calendar date.
   * Used by reception and patients during the booking flow.
   */
  @Audit('SCHEDULE')
  @Roles(Role.RECEPTIONIST, Role.PATIENT, Role.DOCTOR, Role.LAB_TECH, Role.ADMIN)
  @ApiQuery({ name: 'date', description: 'Calendar date (YYYY-MM-DD)', required: true })
  @Get('doctors/:doctorId/slots')
  getAvailableSlots(
    @Param('doctorId', ParseUUIDPipe) doctorId: string,
    @Query('date') date: string,
  ) {
    if (!date) throw new BadRequestException('Query parameter "date" is required');
    return this.svc.getAvailableSlots(doctorId, date);
  }

  // ── Doctor's own schedule ──────────────────────────────────────────────────

  /**
   * GET /schedule/my
   * Returns the authenticated doctor's weekly schedule template.
   */
  @Audit('SCHEDULE')
  @Roles(Role.DOCTOR, Role.ADMIN, Role.EXECUTIVE)
  @Get('my')
  getMySchedule(@CurrentUser() user: AuthUser) {
    return this.svc.getMySchedule(user.id, user.role);
  }

  /**
   * POST /schedule/my
   * Adds or updates a weekly recurring slot.
   * Uniqueness key: (doctorId, dayOfWeek, startTime).  If the slot already
   * exists it is updated in-place (endTime and slotMinutes are refreshed).
   */
  @Audit('SCHEDULE')
  @Roles(Role.DOCTOR, Role.ADMIN)
  @Post('my')
  upsertSlot(@Body() dto: CreateScheduleDto, @CurrentUser() user: AuthUser) {
    return this.svc.upsertSlot(dto, user.id);
  }

  /**
   * DELETE /schedule/my/:id
   * Removes one of the authenticated doctor's schedule rows.
   * Returns 403 if the row belongs to a different doctor.
   */
  @Audit('SCHEDULE')
  @Roles(Role.DOCTOR, Role.ADMIN)
  @Delete('my/:id')
  deleteSlot(
    @Param('id', ParseUUIDPipe) scheduleId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.svc.deleteSlot(scheduleId, user.id);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  Module
// ─────────────────────────────────────────────────────────────────────────────

@Module({
  controllers: [DoctorScheduleController],
  providers: [DoctorScheduleService],
  exports: [DoctorScheduleService],
})
export class DoctorScheduleModule {}
