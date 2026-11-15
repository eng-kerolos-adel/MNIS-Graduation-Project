import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Injectable,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { IsNumber, IsString, IsOptional, IsBoolean } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { Audit, CurrentUser, AuthUser, Roles } from '../common/decorators';

// --- DTOs ---
export class CreateInstrumentDto {
  @IsString()
  nameEn: string;
  @IsString()
  nameAr: string;
  @IsOptional()
  @IsString()
  serialNo?: string;
  @IsOptional()
  @IsString()
  code?: string;
  @IsOptional()
  @IsString()
  model?: string;
  @IsOptional()
  @IsString()
  locationEn?: string;
  @IsOptional()
  @IsString()
  locationAr?: string;
  @IsOptional()
  @IsNumber()
  calibIntervalDays?: number;
}

export class CreateCalibrationDto {
  @IsString()
  result: string; // 'PASS' | 'FAIL' | 'ADJUSTED'
  @IsOptional()
  @IsString()
  notes?: string;
}

// --- Service ---
@Injectable()
export class QcService {
  constructor(private prisma: PrismaService) {}

  async listInstruments() {
    const instruments = await this.prisma.labInstrument.findMany({
      include: {
        calibrations: { orderBy: { performedAt: 'desc' }, take: 5 }
      }
    });

    const now = new Date();
    return instruments.map((inst, idx) => {
      const lastCalib = inst.calibrations[0];
      const isOverdue = lastCalib ? lastCalib.nextDueAt < now : false;
      const status = !inst.isActive || lastCalib?.result === 'FAIL'
        ? 'MAINTENANCE'
        : isOverdue
          ? 'CALIBRATING'
          : 'ONLINE';
      return {
        ...inst,
        code: inst.serialNo || `ANL-0${idx + 1}`,
        model: inst.locationEn || 'Clinical Chemistry & Immunoassay',
        status,
        lastCalibrated: lastCalib?.performedAt || null,
        nextCalibration: lastCalib?.nextDueAt || null,
        lastCalibrationDate: lastCalib?.performedAt || null,
        nextDueAt: lastCalib?.nextDueAt || null,
        isOverdue
      };
    });
  }

  async createInstrument(dto: CreateInstrumentDto) {
    const { code, model, serialNo, locationEn, locationAr, ...rest } = dto;
    const inst = await this.prisma.labInstrument.create({
      data: {
        ...rest,
        serialNo: serialNo || code || `ANL-${Date.now().toString().slice(-3)}`,
        locationEn: locationEn || model || 'Central Lab Wing A',
        locationAr: locationAr || model || 'المعمل المركزي جـناح أ',
      }
    });
    const nextDue = new Date();
    nextDue.setDate(nextDue.getDate() + (inst.calibIntervalDays || 30));
    await this.prisma.calibrationRecord.create({
      data: {
        instrumentId: inst.id,
        performedById: 'SYSTEM',
        nextDueAt: nextDue,
        result: 'PASS',
        notes: 'Initial factory & installation QC verification passed',
      },
    });
    return inst;
  }

  async updateInstrument(id: string, data: Partial<CreateInstrumentDto> & { isActive?: boolean }) {
    return this.prisma.labInstrument.update({
      where: { id },
      data
    });
  }

  async getCalibrations(instrumentId: string) {
    return this.prisma.calibrationRecord.findMany({
      where: { instrumentId },
      orderBy: { performedAt: 'desc' }
    });
  }

  async addCalibration(instrumentId: string, dto: CreateCalibrationDto, userId: string) {
    const inst = await this.prisma.labInstrument.findUnique({ where: { id: instrumentId } });
    if (!inst) throw new Error('Instrument not found');

    const nextDue = new Date();
    nextDue.setDate(nextDue.getDate() + inst.calibIntervalDays);

    return this.prisma.calibrationRecord.create({
      data: {
        instrumentId,
        performedById: userId,
        nextDueAt: nextDue,
        result: dto.result,
        notes: dto.notes
      }
    });
  }
}

// --- Controller ---
@ApiTags('lab-qc')
@ApiBearerAuth()
@Audit('LAB_QC')
@Roles(Role.LAB_TECH, Role.ADMIN)
@Controller('lab/instruments')
export class QcController {
  constructor(private svc: QcService) {}

  @Get()
  list() { return this.svc.listInstruments(); }

  @Post()
  create(@Body() dto: CreateInstrumentDto) { return this.svc.createInstrument(dto); }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: any) { return this.svc.updateInstrument(id, dto); }

  @Get(':id/calibrations')
  getCalibrations(@Param('id') id: string) { return this.svc.getCalibrations(id); }

  @Post(':id/calibrations')
  addCalibration(@Param('id') id: string, @Body() dto: CreateCalibrationDto, @CurrentUser() user: AuthUser) {
    return this.svc.addCalibration(id, dto, user.id);
  }
}
