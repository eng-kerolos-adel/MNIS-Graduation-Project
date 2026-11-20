import { Injectable, NotFoundException } from '@nestjs/common';
import { NotifType, Prisma, Role, Sex } from '@prisma/client';
import { randomBytes } from 'crypto';
import { IsBoolean, IsDateString, IsEnum, IsOptional, IsString, Length, Matches, MaxLength } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { CryptoService } from '../common/crypto.service';
import { PATIENT_PUBLIC_SELECT } from './patient.select';
import { NotificationsService } from '../notifications/notifications.module';

export class CreatePatientDto {
  @Matches(/^\d{14}$/, { message: 'nationalId must be 14 digits' }) nationalId: string;
  @IsString() @Length(2, 120) fullNameEn: string;
  @IsString() @Length(2, 120) fullNameAr: string;
  @IsEnum(Sex) sex: Sex;
  @IsDateString() birthDate: string;
  @IsOptional() @IsString() @MaxLength(4) bloodType?: string;
  @IsOptional() @IsString() @MaxLength(200) addressEn?: string;
  @IsOptional() @IsString() @MaxLength(200) addressAr?: string;
  @IsOptional() @IsBoolean() insuranceActive?: boolean;
  @IsOptional() @IsString() governorate?: string;
  @IsOptional() @IsString() district?: string;
  @IsOptional() chronicConditions?: any[];
  @IsOptional() allergies?: any[];
}

@Injectable()
export class PatientsService {
  constructor(
    private prisma: PrismaService,
    private crypto: CryptoService,
    private notifs: NotificationsService,
  ) {}

  async search(q?: string, role?: Role) {
    const term = q?.trim();
    if (!term) {
      return this.prisma.patient.findMany({
        take: 50,
        orderBy: { createdAt: 'desc' },
        select: PATIENT_PUBLIC_SELECT,
      });
    }

    const where: Prisma.PatientWhereInput = {
      OR: [
        { fullNameEn: { contains: term, mode: 'insensitive' } },
        { fullNameAr: { contains: term } },
        { mti: { contains: term, mode: 'insensitive' } },
        { governorate: { contains: term, mode: 'insensitive' } },
        { nationalIdIdx: this.crypto.blindIndex(term) },
      ],
    };

    const direct = await this.prisma.patient.findMany({
      where,
      take: 30,
      orderBy: { createdAt: 'desc' },
      select: PATIENT_PUBLIC_SELECT,
    });

    if (direct.length > 0 || !/\d{2,}/.test(term)) {
      return direct;
    }

    // Fallback for partial National ID search (restricted roles can only search the visible last 4 digits)
    const restricted = role === Role.LAB_TECH || role === Role.PHARMACIST;
    const allRecent = await this.prisma.patient.findMany({
      take: 200,
      orderBy: { createdAt: 'desc' },
      select: PATIENT_PUBLIC_SELECT,
    });
    return allRecent.filter((p) => {
      try {
        const nid = this.crypto.decrypt(p.nationalIdEnc);
        const nidMatch = restricted ? nid.slice(-4).includes(term) : nid.includes(term);
        return nidMatch || p.mti.toLowerCase().includes(term.toLowerCase());
      } catch {
        return false;
      }
    });
  }

  async get(id: string, _role: Role) {
    const p = await this.prisma.patient.findUnique({ where: { id } });
    if (!p) throw new NotFoundException('PATIENT_NOT_FOUND');
    const nid = this.crypto.decrypt(p.nationalIdEnc);
    const { nationalIdEnc, nationalIdIdx, ...rest } = p;
    return { ...rest, nationalId: nid };
  }

  async create(dto: CreatePatientDto) {
    const { nationalId, birthDate, ...rest } = dto;
    return this.prisma.patient.create({
      data: {
        ...rest,
        birthDate: new Date(birthDate),
        nationalIdEnc: this.crypto.encrypt(nationalId),
        nationalIdIdx: this.crypto.blindIndex(nationalId),
        mti: `MTI-${randomBytes(6).toString('hex').toUpperCase()}`,
      },
      select: PATIENT_PUBLIC_SELECT,
    });
  }

  listDocuments(patientId: string) {
    return this.prisma.document.findMany({
      where: { patientId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        patientId: true,
        label: true,
        mimeType: true,
        fileSizeBytes: true,
        status: true,
        reviewedById: true,
        reviewedAt: true,
        createdAt: true,
      },
    });
  }

  async getDocumentFile(docId: string) {
    const doc = await this.prisma.document.findUnique({ where: { id: docId } });
    if (!doc) throw new NotFoundException('DOCUMENT_NOT_FOUND');
    return {
      id: doc.id,
      patientId: doc.patientId,
      label: doc.label,
      mimeType: doc.mimeType,
      fileSizeBytes: doc.fileSizeBytes,
      status: doc.status,
      fileBase64: doc.fileBase64,
      createdAt: doc.createdAt,
      reviewedAt: doc.reviewedAt,
    };
  }

  async reviewDocument(docId: string, reviewerId: string) {
    const doc = await this.prisma.document.findUnique({ where: { id: docId } });
    if (!doc) throw new NotFoundException('DOCUMENT_NOT_FOUND');
    const updated = await this.prisma.document.update({
      where: { id: docId },
      data: { status: 'REVIEWED', reviewedById: reviewerId, reviewedAt: new Date() },
      select: {
        id: true,
        patientId: true,
        label: true,
        mimeType: true,
        fileSizeBytes: true,
        status: true,
        reviewedById: true,
        reviewedAt: true,
        createdAt: true,
      },
    });
    const citizenUser = await this.prisma.user.findUnique({
      where: { patientId: doc.patientId },
      select: { id: true },
    });
    if (citizenUser) {
      await this.notifs.sendToUser(
        citizenUser.id,
        NotifType.GENERAL,
        'Medical Document Reviewed',
        'تمت مراجعة واعتماد وثيقتك الطبية',
        `Your uploaded document "${doc.label}" has been reviewed and approved by your physician.`,
        `قام الطبيب المعالج بمراجعة واعتماد الوثيقة المرفوعة (${doc.label}) وإرفاقها بسجلك الإكلينيكي.`,
        { documentId: doc.id },
      );
    }
    return updated;
  }
}
