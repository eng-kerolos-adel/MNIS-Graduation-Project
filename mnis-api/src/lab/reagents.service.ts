import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  ParseUUIDPipe,
  Body,
  Injectable,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { IsNumber, IsString, IsOptional, IsDateString } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { Audit, Roles } from '../common/decorators';

// --- DTOs ---
export class CreateReagentDto {
  @IsString()
  nameEn: string;
  @IsString()
  nameAr: string;
  @IsOptional()
  @IsString()
  catalogNo?: string;
  @IsOptional()
  @IsString()
  code?: string;
  @IsNumber()
  quantity: number;
  @IsString()
  unit: string;
  @IsNumber()
  @IsOptional()
  lowStockAt?: number;
  @IsOptional()
  @IsString()
  expiryDate?: string;
  @IsOptional()
  @IsString()
  expiresAt?: string;
  @IsOptional()
  @IsString()
  supplierEn?: string;
  @IsOptional()
  @IsString()
  supplierAr?: string;
}

export class UpdateReagentDto {
  @IsOptional()
  @IsNumber()
  quantity?: number;
  @IsOptional()
  @IsNumber()
  lowStockAt?: number;
}

// --- Service ---
@Injectable()
export class ReagentsService {
  constructor(private prisma: PrismaService) {}

  async list() {
    const rows = await this.prisma.reagent.findMany({
      orderBy: { quantity: 'asc' }
    });
    return rows.map((r) => ({
      ...r,
      code: r.catalogNo || 'RGT-01',
      expiresAt: r.expiryDate,
    }));
  }

  async listAlerts() {
    const all = await this.list();
    return all.filter((r) => r.quantity <= r.lowStockAt);
  }

  async create(dto: CreateReagentDto) {
    const { code, expiresAt, expiryDate, catalogNo, ...rest } = dto;
    const expStr = expiryDate || expiresAt;
    const created = await this.prisma.reagent.create({
      data: {
        ...rest,
        catalogNo: catalogNo || code || `RGT-${Date.now().toString().slice(-4)}`,
        expiryDate: expStr ? new Date(expStr) : null
      }
    });
    return {
      ...created,
      code: created.catalogNo || 'RGT-01',
      expiresAt: created.expiryDate,
    };
  }

  async update(id: string, dto: UpdateReagentDto) {
    return this.prisma.reagent.update({
      where: { id },
      data: dto
    });
  }

  async remove(id: string) {
    return this.prisma.reagent.delete({
      where: { id }
    });
  }
}

// --- Controller ---
@ApiTags('lab-reagents')
@ApiBearerAuth()
@Audit('LAB_REAGENT')
@Roles(Role.LAB_TECH, Role.ADMIN, Role.EXECUTIVE)
@Controller('lab/reagents')
export class ReagentsController {
  constructor(private svc: ReagentsService) {}

  @Get()
  list() { return this.svc.list(); }

  @Get('alerts')
  listAlerts() { return this.svc.listAlerts(); }

  @Post()
  @Roles(Role.LAB_TECH, Role.ADMIN)
  create(@Body() dto: CreateReagentDto) { return this.svc.create(dto); }

  @Patch(':id')
  @Roles(Role.LAB_TECH, Role.ADMIN)
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateReagentDto) { return this.svc.update(id, dto); }

  @Delete(':id')
  @Roles(Role.LAB_TECH, Role.ADMIN)
  remove(@Param('id', ParseUUIDPipe) id: string) { return this.svc.remove(id); }
}
