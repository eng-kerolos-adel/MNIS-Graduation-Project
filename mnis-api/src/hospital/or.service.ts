import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  ParseUUIDPipe,
  Body,
  Query,
  Injectable,
  BadRequestException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role, OrCaseStatus } from '@prisma/client';
import { IsString, IsOptional, IsEnum, IsUUID, IsNumber } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { Audit, CurrentUser, AuthUser, Roles } from '../common/decorators';

// --- DTOs ---
export class CreateOrCaseDto {
  @IsUUID()
  patientId: string;
  @IsUUID()
  surgeonId: string;
  @IsOptional()
  @IsUUID()
  bedId?: string;
  @IsString()
  procedureEn: string;
  @IsString()
  procedureAr: string;
  @IsOptional()
  @IsString()
  theaterNo?: string;
  @IsOptional()
  @IsString()
  theaterCode?: string;
  @IsOptional()
  @IsString()
  scheduledStart?: string;
  @IsOptional()
  @IsString()
  scheduledEnd?: string;
  @IsOptional()
  @IsString()
  scheduledAt?: string;
  @IsOptional()
  @IsNumber()
  estimatedMins?: number;
  @IsOptional()
  @IsString()
  anaesthesiaEn?: string;
  @IsOptional()
  @IsString()
  anaesthesiaAr?: string;
  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateOrCaseDto {
  @IsEnum(OrCaseStatus)
  status: OrCaseStatus;
  @IsOptional()
  @IsString()
  notes?: string;
}

// --- Service ---
@Injectable()
export class OrService {
  constructor(private prisma: PrismaService) {}

  async listCases(u: AuthUser, date?: string) {
    let whereClause = {};
    if (date) {
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);
      whereClause = { scheduledStart: { gte: startOfDay, lte: endOfDay } };
    }

    const [cases, doctors, actor] = await Promise.all([
      this.prisma.orCase.findMany({
        where: whereClause,
        include: {
          patient: { select: { mti: true, fullNameEn: true, fullNameAr: true } },
          bed: { select: { wardEn: true, bedNumber: true } }
        },
        orderBy: { scheduledStart: 'asc' }
      }),
      this.prisma.user.findMany({
        where: { role: 'DOCTOR' },
        select: { id: true, fullNameEn: true, fullNameAr: true, facilityEn: true },
      }),
      this.prisma.user.findUnique({ where: { id: u.id }, select: { facilityEn: true } }),
    ]);

    const docMap = new Map(doctors.map((d) => [d.id, d]));
    const mapped = cases.map((c) => {
      const surgeon = docMap.get(c.surgeonId) || doctors[0] || { id: '', fullNameEn: 'Dr. Tarek El-Masry', fullNameAr: 'د. طارق المصري', facilityEn: null };
      return {
        ...c,
        theaterCode: c.theaterNo || 'OR-01',
        scheduledAt: c.scheduledStart,
        surgeon,
      };
    });

    if (u.role === Role.HOSPITAL_STAFF && actor?.facilityEn) {
      const myFac = actor.facilityEn.trim().toLowerCase();
      return mapped.filter((c) => {
        if (c.createdById === u.id) return true;
        const surgFac = (c.surgeon?.facilityEn ?? '').trim().toLowerCase();
        const bedWard = (c.bed?.wardEn ?? '').trim().toLowerCase();
        if (bedWard && bedWard.includes(myFac)) return true;
        if (surgFac && surgFac === myFac) return true;
        return !bedWard.includes(' — ');
      });
    }

    return mapped;
  }

  async createCase(dto: CreateOrCaseDto, createdById: string) {
    const startStr = dto.scheduledStart || dto.scheduledAt || new Date(Date.now() + 3600000).toISOString();
    const start = new Date(startStr);
    const estMins = dto.estimatedMins || 90;
    const end = dto.scheduledEnd ? new Date(dto.scheduledEnd) : new Date(start.getTime() + estMins * 60000);
    if (start >= end) throw new BadRequestException('scheduledStart must be before scheduledEnd');

    const theater = dto.theaterNo || dto.theaterCode || 'OR-01';

    const created = await this.prisma.orCase.create({
      data: {
        patientId: dto.patientId,
        surgeonId: dto.surgeonId,
        bedId: dto.bedId,
        procedureEn: dto.procedureEn,
        procedureAr: dto.procedureAr,
        theaterNo: theater,
        scheduledStart: start,
        scheduledEnd: end,
        anaesthesiaEn: dto.anaesthesiaEn || 'General Anaesthesia',
        anaesthesiaAr: dto.anaesthesiaAr || 'تخدير كلي',
        notes: dto.notes,
        createdById
      },
      include: {
        patient: { select: { mti: true, fullNameEn: true, fullNameAr: true } },
        bed: { select: { wardEn: true, bedNumber: true } }
      }
    });
    return {
      ...created,
      theaterCode: created.theaterNo || 'OR-01',
      scheduledAt: created.scheduledStart,
    };
  }

  async updateCase(id: string, dto: UpdateOrCaseDto) {
    const updated = await this.prisma.orCase.update({
      where: { id },
      data: dto
    });
    return {
      ...updated,
      theaterCode: updated.theaterNo || 'OR-01',
      scheduledAt: updated.scheduledStart,
    };
  }
}

// --- Controller ---
@ApiTags('hospital-or')
@ApiBearerAuth()
@Audit('OR_CASE')
@Roles(Role.HOSPITAL_STAFF, Role.DOCTOR, Role.ADMIN, Role.EXECUTIVE)
@Controller('hospital/or-cases')
export class OrController {
  constructor(private svc: OrService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query('date') date?: string) {
    return this.svc.listCases(user, date);
  }

  @Post()
  @Roles(Role.HOSPITAL_STAFF, Role.DOCTOR, Role.ADMIN)
  create(@Body() dto: CreateOrCaseDto, @CurrentUser() user: AuthUser) {
    return this.svc.createCase(dto, user.id);
  }

  @Patch(':id')
  @Roles(Role.HOSPITAL_STAFF, Role.DOCTOR, Role.ADMIN)
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateOrCaseDto) {
    return this.svc.updateCase(id, dto);
  }
}
