import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  Injectable,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role, BloodUnitStatus } from '@prisma/client';
import { IsString, IsOptional, IsEnum, IsNumber } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { Audit, Roles } from '../common/decorators';

// --- DTOs ---
export class CreateBloodUnitDto {
  @IsString()
  bloodType: string;
  @IsOptional()
  @IsString()
  collectedAt?: string;
  @IsString()
  expiresAt: string;
  @IsOptional()
  @IsString()
  unitCode?: string;
  @IsOptional()
  @IsString()
  bagBarcode?: string;
  @IsOptional()
  @IsString()
  component?: string;
  @IsOptional()
  @IsNumber()
  volumeMl?: number;
  @IsOptional()
  @IsString()
  donorName?: string;
  @IsOptional()
  @IsString()
  donorNid?: string;
}

export class UpdateBloodUnitDto {
  @IsEnum(BloodUnitStatus)
  status: BloodUnitStatus;
  @IsOptional()
  @IsString()
  usedForId?: string;
  @IsOptional()
  @IsString()
  notes?: string;
}

// --- Service ---
@Injectable()
export class BloodBankService {
  constructor(private prisma: PrismaService) {}

  private mapUnit(u: any) {
    let component = 'PACKED_RBC';
    let volumeMl = 450;
    if (u.notes && u.notes.includes('|')) {
      const [comp, vol] = u.notes.split('|');
      if (comp) component = comp;
      if (vol && !isNaN(Number(vol))) volumeMl = Number(vol);
    }
    return {
      ...u,
      bagBarcode: u.unitCode,
      component,
      volumeMl,
    };
  }

  async autoExpire() {
    return this.prisma.bloodUnit.updateMany({
      where: {
        status: BloodUnitStatus.AVAILABLE,
        expiresAt: { lt: new Date() }
      },
      data: { status: BloodUnitStatus.EXPIRED }
    });
  }

  async list(bloodType?: string, status?: BloodUnitStatus) {
    await this.autoExpire(); // Ensure expired units are marked
    const rows = await this.prisma.bloodUnit.findMany({
      where: {
        ...(bloodType && { bloodType }),
        ...(status && { status })
      },
      orderBy: { expiresAt: 'asc' }
    });
    return rows.map((u) => this.mapUnit(u));
  }

  async getSummary() {
    await this.autoExpire();
    const grouped = await this.prisma.bloodUnit.groupBy({
      by: ['bloodType', 'status'],
      _count: { id: true }
    });

    return grouped.map(g => ({
      bloodType: g.bloodType,
      status: g.status,
      count: g._count.id
    }));
  }

  async create(dto: CreateBloodUnitDto) {
    const code = dto.unitCode || dto.bagBarcode || `BB-${Date.now().toString().slice(-6)}`;
    const comp = dto.component || 'PACKED_RBC';
    const vol = dto.volumeMl || 450;
    const created = await this.prisma.bloodUnit.create({
      data: {
        bloodType: dto.bloodType,
        unitCode: code,
        donorName: dto.donorName,
        donorNid: dto.donorNid,
        notes: `${comp}|${vol}`,
        collectedAt: dto.collectedAt ? new Date(dto.collectedAt) : new Date(),
        expiresAt: new Date(dto.expiresAt)
      }
    });
    return this.mapUnit(created);
  }

  async updateStatus(id: string, dto: UpdateBloodUnitDto) {
    const data: any = { status: dto.status };
    if (dto.notes) data.notes = dto.notes;
    if (dto.status === BloodUnitStatus.USED) {
      data.usedForId = dto.usedForId;
      data.usedAt = new Date();
    } else if (dto.status === BloodUnitStatus.DISCARDED) {
      data.disposedAt = new Date();
    }

    const updated = await this.prisma.bloodUnit.update({
      where: { id },
      data
    });
    return this.mapUnit(updated);
  }
}

// --- Controller ---
@ApiTags('hospital-blood-bank')
@ApiBearerAuth()
@Audit('BLOOD_BANK')
@Roles(Role.HOSPITAL_STAFF, Role.DOCTOR, Role.ADMIN, Role.EXECUTIVE)
@Controller('hospital/blood-bank')
export class BloodBankController {
  constructor(private svc: BloodBankService) {}

  @Get()
  list(@Query('bloodType') bloodType?: string, @Query('status') status?: BloodUnitStatus) {
    return this.svc.list(bloodType, status);
  }

  @Get('summary')
  getSummary() {
    return this.svc.getSummary();
  }

  @Post()
  create(@Body() dto: CreateBloodUnitDto) {
    return this.svc.create(dto);
  }

  @Patch(':id')
  updateStatus(@Param('id') id: string, @Body() dto: UpdateBloodUnitDto) {
    return this.svc.updateStatus(id, dto);
  }
}
