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
}
export class UpdateVisitStatusDto { @IsEnum(VisitStatus) status: VisitStatus; }

const include = { patient: { select: PATIENT_PUBLIC_SELECT } };

@Injectable()
export class QueueService {
  constructor(private prisma: PrismaService) {}

  list() {
    return this.prisma.visit.findMany({ include, orderBy: [{ isEmergency: 'desc' }, { arrivedAt: 'asc' }], take: 200 });
  }

  async create(dto: CreateTicketDto) {
    const count = await this.prisma.visit.count({ where: { arrivedAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } } });
    return this.prisma.visit.create({ data: { ...dto, ticketNo: `A-${count + 1}` }, include });
  }

  /** Emergencies first, then FIFO. The conditional updateMany makes concurrent doctors safe (no double-call). */
  async callNext(doctorId: string) {
    for (let i = 0; i < 3; i++) {
      const next = await this.prisma.visit.findFirst({ where: { status: 'WAITING' }, orderBy: [{ isEmergency: 'desc' }, { arrivedAt: 'asc' }] });
      if (!next) throw new NotFoundException('NO_PATIENTS_WAITING');
      const r = await this.prisma.visit.updateMany({ where: { id: next.id, status: 'WAITING' }, data: { status: 'IN_CONSULTATION', doctorId, calledAt: new Date() } });
      if (r.count === 1) return this.prisma.visit.findUnique({ where: { id: next.id }, include });
    }
    throw new ConflictException('QUEUE_BUSY_RETRY');
  }

  async setStatus(id: string, status: VisitStatus, doctorId: string) {
    const v = await this.prisma.visit.findUnique({ where: { id } });
    if (!v) throw new NotFoundException();
    return this.prisma.visit.update({
      where: { id },
      data: { status, doctorId: v.doctorId ?? doctorId, completedAt: status === 'COMPLETED' ? new Date() : undefined },
      include,
    });
  }
}

@ApiTags('queue') @ApiBearerAuth() @Audit('VISIT')
@Controller('queue')
export class QueueController {
  constructor(private svc: QueueService) {}
  @Get() @Roles(Role.DOCTOR, Role.HOSPITAL_STAFF, Role.RECEPTIONIST, Role.ADMIN, Role.EXECUTIVE) list() { return this.svc.list(); }
  @Post() @Roles(Role.DOCTOR, Role.HOSPITAL_STAFF, Role.RECEPTIONIST, Role.ADMIN) create(@Body() dto: CreateTicketDto) { return this.svc.create(dto); }
  @Post('call-next') @Roles(Role.DOCTOR, Role.ADMIN) callNext(@CurrentUser() u: AuthUser) { return this.svc.callNext(u.id); }
  @Patch(':id/status') @Roles(Role.DOCTOR, Role.HOSPITAL_STAFF, Role.RECEPTIONIST, Role.ADMIN)
  setStatus(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateVisitStatusDto, @CurrentUser() u: AuthUser) {
    return this.svc.setStatus(id, dto.status, u.id);
  }
}

@Module({ controllers: [QueueController], providers: [QueueService] })
export class QueueModule {}
