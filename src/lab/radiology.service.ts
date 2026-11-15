import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  Query,
  Injectable,
  BadRequestException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { IsString, IsUUID, IsOptional, IsInt, Min, Max } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { Audit, CurrentUser, AuthUser, Roles } from '../common/decorators';

// --- DTOs ---
export class UploadRadiologyDto {
  @IsUUID()
  patientId: string;
  @IsOptional()
  @IsString()
  titleEn?: string;
  @IsOptional()
  @IsString()
  titleAr?: string;
  @IsOptional()
  @IsString()
  modality?: string;
  @IsOptional()
  @IsString()
  bodyPartEn?: string;
  @IsOptional()
  @IsString()
  bodyPartAr?: string;
  @IsOptional()
  @IsString()
  findingsEn?: string;
  @IsOptional()
  @IsString()
  findingsAr?: string;
  @IsString()
  mimeType: string;
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5000000)
  fileSizeBytes?: number;
  @IsString()
  fileBase64: string;
  @IsOptional()
  @IsString()
  notes?: string;
}

// --- Service ---
@Injectable()
export class RadiologyService {
  constructor(private prisma: PrismaService) {}

  private mapRow(r: any) {
    const partsEn = (r.titleEn || '').split(' — ');
    const modality = partsEn.length > 1 ? partsEn[0] : 'X-Ray';
    const bodyPartEn = partsEn.length > 1 ? partsEn.slice(1).join(' — ') : r.titleEn;
    const partsAr = (r.titleAr || '').split(' — ');
    const bodyPartAr = partsAr.length > 1 ? partsAr.slice(1).join(' — ') : r.titleAr;
    let findingsEn = r.notes || '';
    let findingsAr = r.notes || '';
    if (r.notes && r.notes.includes(' || ')) {
      const [en, ar] = r.notes.split(' || ');
      findingsEn = en || '';
      findingsAr = ar || en || '';
    }
    return {
      ...r,
      modality,
      bodyPartEn,
      bodyPartAr,
      findingsEn,
      findingsAr,
      uploadedAt: r.createdAt,
    };
  }

  async listForPatient(patientId: string) {
    const rows = await this.prisma.radiologyUpload.findMany({
      where: { patientId },
      select: { id: true, titleEn: true, titleAr: true, mimeType: true, fileSizeBytes: true, notes: true, createdAt: true, uploadedById: true },
      orderBy: { createdAt: 'desc' }
    });
    return rows.map((r) => this.mapRow(r));
  }

  async getOne(id: string) {
    const r = await this.prisma.radiologyUpload.findUnique({
      where: { id }
    });
    return r ? this.mapRow(r) : null;
  }

  async upload(dto: UploadRadiologyDto, uploaderId: string) {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    if (!allowed.includes(dto.mimeType)) throw new BadRequestException('Invalid file type');

    const computedBytes = dto.fileSizeBytes ?? Math.max(64, Math.ceil(dto.fileBase64.length * 0.75));
    if (computedBytes > 5500000) throw new BadRequestException('File too large (max 5MB)');

    const mod = dto.modality || 'X-Ray';
    const titleEn = dto.titleEn || `${mod} — ${dto.bodyPartEn || 'Chest PA'}`;
    const titleAr = dto.titleAr || `${mod} — ${dto.bodyPartAr || 'أشعة صدر أمامية'}`;
    const notes = dto.notes || (dto.findingsEn || dto.findingsAr ? `${dto.findingsEn || ''} || ${dto.findingsAr || ''}` : null);

    const created = await this.prisma.radiologyUpload.create({
      data: {
        patientId: dto.patientId,
        uploadedById: uploaderId,
        titleEn,
        titleAr,
        mimeType: dto.mimeType,
        fileSizeBytes: computedBytes,
        fileBase64: dto.fileBase64,
        notes
      }
    });
    return this.mapRow(created);
  }

  async delete(id: string) {
    return this.prisma.radiologyUpload.delete({ where: { id } });
  }
}

// --- Controller ---
@ApiTags('lab-radiology')
@ApiBearerAuth()
@Audit('LAB_RADIOLOGY')
@Roles(Role.LAB_TECH, Role.DOCTOR, Role.ADMIN, Role.EXECUTIVE)
@Controller('lab/radiology')
export class RadiologyController {
  constructor(private svc: RadiologyService) {}

  @Get()
  list(@Query('patientId') patientId: string) {
    if (!patientId) throw new BadRequestException('patientId is required');
    return this.svc.listForPatient(patientId);
  }

  @Post()
  @Roles(Role.LAB_TECH, Role.DOCTOR, Role.ADMIN)
  upload(@Body() dto: UploadRadiologyDto, @CurrentUser() user: AuthUser) {
    return this.svc.upload(dto, user.id);
  }

  @Get(':id')
  getOne(@Param('id') id: string) {
    return this.svc.getOne(id);
  }

  @Delete(':id')
  @Roles(Role.LAB_TECH, Role.ADMIN)
  remove(@Param('id') id: string) {
    return this.svc.delete(id);
  }
}
