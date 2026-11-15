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
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
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
export class DoctorScheduleService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Schedule CRUD ──────────────────────────────────────────────────────────

  /** Returns the authenticated doctor's schedule ordered by dayOfWeek then startTime. */
  async getMySchedule(doctorId: string) {
    const own = await this.prisma.doctorSchedule.findMany({
      where: { doctorId, isActive: true },
      orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
    });
    if (own.length > 0) return own;
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

    if (!schedule) {
      // Doctor has no schedule on this day — return empty array.
      return [];
    }

    // Generate all candidate slots for this window.
    const allSlots: TimeSlot[] = [];
    const startMins = toMinutes(schedule.startTime);
    const endMins = toMinutes(schedule.endTime);
    const step = schedule.slotMinutes;

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

  // ── Doctor listing ─────────────────────────────────────────────────────────

  /** Lists all active doctors with bilingual name and speciality fields. */
  listDoctors(): Promise<DoctorSummary[]> {
    return this.prisma.user.findMany({
      where: { role: Role.DOCTOR, isActive: true },
      select: {
        id: true,
        fullNameEn: true,
        fullNameAr: true,
        specialityEn: true,
        specialityAr: true,
      },
      orderBy: { fullNameEn: 'asc' },
    });
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

  // ── Doctor listing ─────────────────────────────────────────────────────────

  /**
   * GET /schedule/doctors
   * Lists all active doctors — used by the booking UI in the receptionist and
   * patient-facing apps to populate the "choose a doctor" step.
   */
  @Audit('SCHEDULE')
  @Roles(Role.RECEPTIONIST, Role.DOCTOR, Role.PATIENT, Role.ADMIN, Role.EXECUTIVE)
  @Get('doctors')
  listDoctors() {
    return this.svc.listDoctors();
  }

  // ── Available slots ────────────────────────────────────────────────────────

  /**
   * GET /schedule/doctors/:doctorId/slots?date=YYYY-MM-DD
   * Returns the free appointment slots for a specific doctor on a calendar date.
   * Used by reception and patients during the booking flow.
   */
  @Audit('SCHEDULE')
  @Roles(Role.RECEPTIONIST, Role.PATIENT, Role.DOCTOR, Role.ADMIN)
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
    return this.svc.getMySchedule(user.id);
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
