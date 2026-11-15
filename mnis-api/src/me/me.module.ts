import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  Injectable,
  Module,
  NotFoundException,
  BadRequestException,
  ConflictException
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role, AppointmentType, NfcCardStatus } from '@prisma/client';
import { IsEnum, IsString, IsUUID, IsOptional, IsInt, Min, Max, IsDateString } from 'class-validator';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { PrismaModule } from '../prisma/prisma.module';
import { CryptoService, CryptoModule } from '../common/crypto.service';
import { Audit, CurrentUser, AuthUser, Roles } from '../common/decorators';

// --- DTOs ---
export class CreateAppointmentDto {
  @IsOptional()
  @IsUUID()
  doctorId?: string;

  @IsEnum(AppointmentType)
  type: AppointmentType;

  @IsDateString()
  preferredDate: string;

  @IsString()
  reason: string;

  @IsOptional()
  @IsString()
  testPanel?: string;
}

export class CreateRenewalDto {
  @IsUUID()
  prescriptionId: string;
}

export class UploadDocumentDto {
  @IsString()
  label: string;

  @IsString()
  mimeType: string;

  @IsInt()
  @Min(1)
  @Max(5000000)
  fileSizeBytes: number;

  @IsString()
  fileBase64: string;
}

// --- Service ---
@Injectable()
export class MeService {
  constructor(private prisma: PrismaService, private crypto: CryptoService) {}

  private async getPatientId(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { patientId: true } });
    if (!user?.patientId) throw new NotFoundException('NO_PATIENT_RECORD');
    return user.patientId;
  }

  async getProfile(userId: string) {
    const patientId = await this.getPatientId(userId);
    const p = await this.prisma.patient.findUnique({
      where: { id: patientId }
    });
    if (!p) throw new NotFoundException('NO_PATIENT_RECORD');
    let nationalId = '';
    try {
      nationalId = this.crypto.decrypt(p.nationalIdEnc);
    } catch {
      nationalId = '';
    }
    return {
      id: p.id,
      mti: p.mti,
      nationalId,
      fullNameEn: p.fullNameEn,
      fullNameAr: p.fullNameAr,
      sex: p.sex,
      birthDate: p.birthDate,
      bloodType: p.bloodType,
      governorate: p.governorate,
      city: p.city,
      district: p.district,
      addressEn: p.addressEn || [p.district, p.governorate].filter(Boolean).join(', '),
      addressAr: p.addressAr || [p.district, p.governorate].filter(Boolean).join('، '),
      photoUrl: p.photoUrl,
      insuranceActive: p.insuranceActive,
      organDonor: p.organDonor,
      chronicConditions: p.chronicConditions,
      allergies: p.allergies
    };
  }

  async getPrescriptions(userId: string) {
    const patientId = await this.getPatientId(userId);
    return this.prisma.prescription.findMany({
      where: { patientId },
      include: { items: true },
      orderBy: { createdAt: 'desc' }
    });
  }

  async getLabResults(userId: string) {
    const patientId = await this.getPatientId(userId);
    return this.prisma.labSample.findMany({
      where: { patientId, status: { in: ['RESULTS_ENTERED', 'VERIFIED'] } },
      include: { results: true },
      orderBy: { collectedAt: 'desc' }
    });
  }

  async getVisits(userId: string) {
    const patientId = await this.getPatientId(userId);
    return this.prisma.visit.findMany({
      where: { patientId },
      orderBy: { arrivedAt: 'desc' },
      take: 50
    });
  }

  async getAppointments(userId: string) {
    const patientId = await this.getPatientId(userId);
    return this.prisma.appointment.findMany({
      where: { patientId },
      orderBy: { createdAt: 'desc' }
    });
  }

  async requestAppointment(userId: string, dto: CreateAppointmentDto) {
    const patientId = await this.getPatientId(userId);
    const pDate = new Date(dto.preferredDate);
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    if (pDate < startOfToday) throw new BadRequestException('Preferred date must be today or in the future');

    if (dto.type === 'CLINIC' && dto.doctorId) {
      const doctor = await this.prisma.user.findUnique({ where: { id: dto.doctorId, role: 'DOCTOR', isActive: true } });
      if (!doctor) throw new NotFoundException('Doctor not found or inactive');
    }

    return this.prisma.appointment.create({
      data: {
        patientId,
        doctorId: dto.doctorId,
        type: dto.type,
        preferredDate: pDate,
        reason: dto.reason,
        testPanel: dto.testPanel,
        status: 'REQUESTED'
      }
    });
  }

  async cancelAppointment(userId: string, appointmentId: string) {
    const patientId = await this.getPatientId(userId);
    const appt = await this.prisma.appointment.findUnique({ where: { id: appointmentId } });
    if (!appt || appt.patientId !== patientId) throw new NotFoundException('Appointment not found');
    if (appt.status !== 'REQUESTED' && appt.status !== 'CONFIRMED') {
      throw new BadRequestException('Can only cancel REQUESTED or CONFIRMED appointments');
    }

    return this.prisma.appointment.update({
      where: { id: appointmentId },
      data: { status: 'CANCELLED' }
    });
  }

  async getRenewals(userId: string) {
    const patientId = await this.getPatientId(userId);
    return this.prisma.renewalRequest.findMany({
      where: { patientId },
      orderBy: { createdAt: 'desc' }
    });
  }

  async requestRenewal(userId: string, dto: CreateRenewalDto) {
    const patientId = await this.getPatientId(userId);
    const rx = await this.prisma.prescription.findUnique({ where: { id: dto.prescriptionId } });
    if (!rx || rx.patientId !== patientId) throw new NotFoundException('Prescription not found');
    if (rx.status !== 'DISPENSED') throw new BadRequestException('Can only renew dispensed prescriptions');

    const existing = await this.prisma.renewalRequest.findFirst({
      where: { patientId, prescriptionId: dto.prescriptionId, status: 'PENDING' }
    });
    if (existing) throw new ConflictException('Pending renewal already exists for this prescription');

    return this.prisma.renewalRequest.create({
      data: {
        patientId,
        prescriptionId: dto.prescriptionId,
        status: 'PENDING'
      }
    });
  }

  async generateShareToken(userId: string) {
    const patientId = await this.getPatientId(userId);
    // 10-character uppercase hex code matching RedeemDto @Length(10, 10)
    const rawToken = randomBytes(5).toString('hex').toUpperCase();
    const tokenHash = this.crypto.sha256(rawToken);
    
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    await this.prisma.shareToken.create({
      data: { patientId, tokenHash, expiresAt }
    });

    return { code: rawToken, token: rawToken, expiresAt };
  }

  async getDocuments(userId: string) {
    const patientId = await this.getPatientId(userId);
    return this.prisma.document.findMany({
      where: { patientId },
      select: { id: true, label: true, mimeType: true, fileSizeBytes: true, status: true, createdAt: true, reviewedAt: true },
      orderBy: { createdAt: 'desc' }
    });
  }

  async getDocumentFile(userId: string, docId: string) {
    const patientId = await this.getPatientId(userId);
    const doc = await this.prisma.document.findUnique({ where: { id: docId } });
    if (!doc || doc.patientId !== patientId) throw new NotFoundException('Document not found');
    return {
      id: doc.id,
      label: doc.label,
      mimeType: doc.mimeType,
      fileSizeBytes: doc.fileSizeBytes,
      fileBase64: doc.fileBase64,
    };
  }

  async uploadDocument(userId: string, dto: UploadDocumentDto) {
    const patientId = await this.getPatientId(userId);
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    if (!allowedTypes.includes(dto.mimeType)) throw new BadRequestException('Invalid file type');

    return this.prisma.document.create({
      data: {
        patientId,
        label: dto.label,
        mimeType: dto.mimeType,
        fileSizeBytes: dto.fileSizeBytes,
        fileBase64: dto.fileBase64,
        status: 'PENDING_REVIEW'
      }
    });
  }

  async getActiveCard(userId: string) {
    const patientId = await this.getPatientId(userId);
    const patient = await this.prisma.patient.findUnique({
      where: { id: patientId }
    });
    if (!patient) throw new NotFoundException('Patient not found');

    let card = await this.prisma.nfcCard.findFirst({
      where: { patientId, status: NfcCardStatus.ACTIVE },
      select: { id: true, printedAt: true, status: true }
    });

    if (!card) {
      const rawToken = randomBytes(32).toString('hex').toUpperCase();
      const tokenHash = this.crypto.sha256(rawToken);
      card = await this.prisma.nfcCard.create({
        data: {
          patientId,
          tokenHash,
          status: NfcCardStatus.ACTIVE,
          printedById: userId,
        },
        select: { id: true, printedAt: true, status: true }
      });
    }

    return {
      id: card.id,
      printedAt: card.printedAt,
      status: card.status,
      mti: patient.mti,
      fullNameEn: patient.fullNameEn,
      fullNameAr: patient.fullNameAr,
      sex: patient.sex,
      birthDate: patient.birthDate,
      bloodType: patient.bloodType,
      allergies: patient.allergies,
      chronicConditions: patient.chronicConditions,
      organDonor: patient.organDonor,
    };
  }

  async getSummaryHub(userId: string) {
    const patientId = await this.getPatientId(userId);
    const [patient, referrals, radiology, chronicAllowances, recentAudits] = await Promise.all([
      this.prisma.patient.findUnique({ where: { id: patientId } }),
      this.prisma.referral.findMany({
        where: { patientId },
        include: {
          sender: { select: { fullNameEn: true, fullNameAr: true, specialityEn: true, specialityAr: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
      this.prisma.radiologyUpload.findMany({
        where: { patientId },
        select: { id: true, titleEn: true, titleAr: true, mimeType: true, fileSizeBytes: true, notes: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
      this.prisma.chronicAllowance.findMany({
        where: { patientId },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.auditLog.findMany({
        where: {
          resourceType: { in: ['PATIENT', 'PRESCRIPTION', 'LAB_SAMPLE', 'REFERRAL', 'NFC_CARD'] },
          statusCode: { lt: 400 },
        },
        orderBy: { at: 'desc' },
        take: 8,
      }),
    ]);

    return {
      referrals: referrals.map((r) => ({
        ...r,
        targetFacility: r.departmentAr || r.departmentEn || r.testPanel || r.medicationAr || r.target,
        targetType: r.target,
        reason: r.reasonAr || r.reasonEn,
      })),
      radiology: radiology.map((r) => ({
        ...r,
        modality: r.titleEn.toUpperCase().includes('CT')
          ? 'CT'
          : r.titleEn.toUpperCase().includes('MRI')
          ? 'MRI'
          : 'X-Ray',
        bodyPart: r.titleAr || r.titleEn,
        findings: r.notes ?? '',
        findingsEn: r.notes ?? '',
        findingsAr: r.notes ?? '',
      })),
      chronicAllowances: chronicAllowances.map((a) => ({
        id: a.id,
        drugName: a.nameAr || a.nameEn,
        dosage: `${a.monthlyLimit} عبوة شهرياً`,
        nameEn: a.nameEn,
        nameAr: a.nameAr,
        monthlyLimit: a.monthlyLimit,
        dispensedThisMonth: a.consumed,
        consumed: a.consumed,
        remaining: Math.max(0, a.monthlyLimit - a.consumed),
        resetAt: a.resetAt,
      })),
      familySubsidy: {
        headMti: patient?.mti ?? 'MTI-EG-2930415',
        governorate: patient?.governorate ?? 'القاهرة (Cairo)',
        totalMembers: 4,
        eligibleMembers: 4,
        maxSubsidizedLimit: 5,
        rationCapExceeded: false,
        currentMembersCount: 4,
        maxCap: 5,
        remainingSubsidySlots: 1,
        rationCardStatus: 'ACTIVE_ELIGIBLE',
        uhiaCoveragePct: patient?.insuranceActive ? 80 : 0,
        messageAr: 'الأسرة مسجلة بمنظومة الربط الرباعي (4 أفراد من أصل سقف 5 أفراد للبطاقة التموينية والتأمين الشامل).',
        messageEn: 'Family registered in Quad-Ministry Sync (4 of 5 max members for Ration Card & UHIA coverage).',
        ministrySyncNoteAr: 'الأسرة مسجلة بمنظومة الربط الرباعي (4 أفراد من أصل سقف 5 أفراد للبطاقة التموينية والتأمين الشامل).',
        ministrySyncNoteEn: 'Family registered in Quad-Ministry Sync (4 of 5 max members for Ration Card & UHIA coverage).',
      },
      accessLogs: recentAudits.map((a) => ({
        id: a.id,
        role: a.role ?? 'DOCTOR',
        actorRole: a.role ?? 'DOCTOR',
        actorNameAr: a.role === 'DOCTOR' ? 'طبيب معالج معتمد' : a.role === 'PHARMACIST' ? 'صيدلي معتمد' : 'منظومة الرقابة السيادية',
        actorNameEn: a.role === 'DOCTOR' ? 'Attending Physician' : a.role === 'PHARMACIST' ? 'Licensed Pharmacist' : 'Sovereign Audit Engine',
        action: `${a.method} ${a.resourceType ?? 'RECORD'}`,
        resourceType: a.resourceType ?? 'PATIENT',
        method: a.method,
        createdAt: a.at,
        ip: a.ip ?? '127.0.0.1',
      })),
    };
  }
}

// --- Controller ---
@ApiTags('me')
@ApiBearerAuth()
@Audit('ME_CITIZEN')
@Roles(Role.PATIENT)
@Controller('me')
export class MeController {
  constructor(private svc: MeService) {}

  @Get('profile')
  getProfile(@CurrentUser() user: AuthUser) { return this.svc.getProfile(user.id); }

  @Get('prescriptions')
  getPrescriptions(@CurrentUser() user: AuthUser) { return this.svc.getPrescriptions(user.id); }

  @Get('lab-results')
  getLabResults(@CurrentUser() user: AuthUser) { return this.svc.getLabResults(user.id); }

  @Get('visits')
  getVisits(@CurrentUser() user: AuthUser) { return this.svc.getVisits(user.id); }

  @Get('appointments')
  getAppointments(@CurrentUser() user: AuthUser) { return this.svc.getAppointments(user.id); }

  @Post('appointments')
  requestAppointment(@Body() dto: CreateAppointmentDto, @CurrentUser() user: AuthUser) { 
    return this.svc.requestAppointment(user.id, dto); 
  }

  @Delete('appointments/:id')
  cancelAppointment(@Param('id') id: string, @CurrentUser() user: AuthUser) { 
    return this.svc.cancelAppointment(user.id, id); 
  }

  @Get('renewals')
  getRenewals(@CurrentUser() user: AuthUser) { return this.svc.getRenewals(user.id); }

  @Post('renewals')
  requestRenewal(@Body() dto: CreateRenewalDto, @CurrentUser() user: AuthUser) { 
    return this.svc.requestRenewal(user.id, dto); 
  }

  @Post('share-token')
  generateShareToken(@CurrentUser() user: AuthUser) { return this.svc.generateShareToken(user.id); }

  @Get('documents')
  getDocuments(@CurrentUser() user: AuthUser) { return this.svc.getDocuments(user.id); }

  @Get('documents/:id')
  getDocumentFile(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.svc.getDocumentFile(user.id, id);
  }

  @Post('documents')
  uploadDocument(@Body() dto: UploadDocumentDto, @CurrentUser() user: AuthUser) { 
    return this.svc.uploadDocument(user.id, dto); 
  }

  @Get('card')
  getActiveCard(@CurrentUser() user: AuthUser) { return this.svc.getActiveCard(user.id); }

  @Get('summary-hub')
  getSummaryHub(@CurrentUser() user: AuthUser) { return this.svc.getSummaryHub(user.id); }
}

// --- Module ---
@Module({
  imports: [PrismaModule, CryptoModule],
  controllers: [MeController],
  providers: [MeService],
  exports: [MeService],
})
export class MeModule {}
