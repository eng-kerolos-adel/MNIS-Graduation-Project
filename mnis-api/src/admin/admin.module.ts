import { BadRequestException, Body, Controller, Get, Injectable, Module, NotFoundException, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import * as argon2 from 'argon2';
import { IsBoolean, IsEmail, IsIn, IsOptional, IsString, Length, MaxLength, ValidateIf } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { Audit, AuthUser, CurrentUser, Roles } from '../common/decorators';
import { generateTempPassword } from '../common/password.util';

const STAFF_ROLES = ['DOCTOR', 'PHARMACIST', 'LAB_TECH', 'HOSPITAL_STAFF', 'EXECUTIVE', 'RECEPTIONIST', 'ADMIN'] as const;

export class CreateStaffDto {
  @IsEmail() @MaxLength(254) email: string;
  @IsIn(STAFF_ROLES as unknown as string[]) role: (typeof STAFF_ROLES)[number];
  @IsString() @Length(2, 120) fullNameEn: string;
  @IsString() @Length(2, 120) fullNameAr: string;
  @IsOptional() @IsString() @MaxLength(60) licenseNo?: string;
  @IsOptional() @IsString() @MaxLength(120) specialityEn?: string;
  @IsOptional() @IsString() @MaxLength(120) specialityAr?: string;
  @IsOptional() @IsString() @MaxLength(160) facilityEn?: string;
  @IsOptional() @IsString() @MaxLength(160) facilityAr?: string;
}
export class ActiveDto { @IsBoolean() isActive: boolean; }

export class CreateFacilityBundleDto {
  @IsIn(['CLINIC', 'LAB', 'HOSPITAL'])
  facilityType: 'CLINIC' | 'LAB' | 'HOSPITAL';

  @IsString() @Length(2, 160)
  facilityEn: string;

  @IsString() @Length(2, 160)
  facilityAr: string;

  @IsEmail() @MaxLength(254)
  primaryEmail: string;

  @IsString() @Length(2, 120)
  primaryNameEn: string;

  @IsString() @Length(2, 120)
  primaryNameAr: string;

  @IsOptional()
  @ValidateIf((_, v) => typeof v === 'string' && v.trim().length > 0)
  @IsEmail()
  @MaxLength(254)
  secondaryEmail?: string;

  @IsOptional() @IsString() @MaxLength(120)
  secondaryNameEn?: string;

  @IsOptional() @IsString() @MaxLength(120)
  secondaryNameAr?: string;

  @IsOptional() @IsString() @MaxLength(120)
  specialityEn?: string;

  @IsOptional() @IsString() @MaxLength(120)
  specialityAr?: string;

  @IsOptional() @IsString() @MaxLength(60)
  licenseNo?: string;
}

const SELECT = {
  id: true, email: true, role: true, fullNameEn: true, fullNameAr: true, licenseNo: true,
  specialityEn: true, specialityAr: true, facilityEn: true, facilityAr: true,
  isActive: true, mustChangePassword: true, createdAt: true,
} as const;

@Injectable()
export class AdminService {
  constructor(private prisma: PrismaService) {}

  list() { return this.prisma.user.findMany({ where: { role: { not: Role.PATIENT } }, select: SELECT, orderBy: { createdAt: 'desc' }, take: 200 }); }

  async create(dto: CreateStaffDto) {
    const temp = generateTempPassword();
    const user = await this.prisma.user.create({
      data: { ...dto, email: dto.email.toLowerCase(), passwordHash: await argon2.hash(temp), mustChangePassword: true },
      select: SELECT,
    });
    // The temporary password is shown exactly once and never stored in clear.
    return { user, temporaryPassword: temp };
  }

  async setActive(id: string, isActive: boolean, actorId?: string) {
    if (actorId && id === actorId && !isActive) {
      throw new BadRequestException('CANNOT_DEACTIVATE_SELF');
    }
    const u = await this.prisma.user.findUnique({ where: { id } });
    if (!u || u.role === Role.PATIENT) throw new NotFoundException();
    const [user] = await this.prisma.$transaction([
      this.prisma.user.update({ where: { id }, data: { isActive }, select: SELECT }),
      ...(isActive ? [] : [this.prisma.refreshToken.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } })]),
    ]);
    return user;
  }

  async resetPassword(id: string) {
    const u = await this.prisma.user.findUnique({ where: { id } });
    if (!u || u.role === Role.PATIENT) throw new NotFoundException();
    const temp = generateTempPassword();
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id }, data: { passwordHash: await argon2.hash(temp), mustChangePassword: true, failedLogins: 0, lockedUntil: null } }),
      this.prisma.refreshToken.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } }),
    ]);
    return { temporaryPassword: temp };
  }

  async getAuditLogs() {
    const logs = await this.prisma.auditLog.findMany({
      orderBy: { at: 'desc' },
      take: 100,
    });
    const userIds = Array.from(new Set(logs.map((l) => l.userId).filter((x): x is string => !!x)));
    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, email: true, fullNameEn: true, fullNameAr: true, role: true },
    });
    const userMap = new Map(users.map((u) => [u.id, u]));
    return logs.map((l) => ({
      ...l,
      createdAt: l.at,
      actor: l.userId ? userMap.get(l.userId) ?? null : null,
    }));
  }

  async getSecurityPosture() {
    const [
      totalAuditLogs,
      failedRequests,
      activeSessions,
      lockedAccounts,
      activeNfcCards,
      revokedNfcCards,
      signedPrescriptions,
      totalPatients,
    ] = await Promise.all([
      this.prisma.auditLog.count(),
      this.prisma.auditLog.count({ where: { statusCode: { gte: 400 } } }),
      this.prisma.refreshToken.count({ where: { revokedAt: null, expiresAt: { gt: new Date() } } }),
      this.prisma.user.count({ where: { lockedUntil: { gt: new Date() } } }),
      this.prisma.nfcCard.count({ where: { status: 'ACTIVE' } }),
      this.prisma.nfcCard.count({ where: { status: { not: 'ACTIVE' } } }),
      this.prisma.prescription.count({ where: { signatureHash: { not: null } } }),
      this.prisma.patient.count(),
    ]);

    return {
      encryptionStandard: 'AES-256-GCM (Authenticated Field-Level Encryption)',
      blindIndexStandard: 'HMAC-SHA256 (O(1) Constant-Time National ID Lookup)',
      passwordStandard: 'Argon2id + 5-Strike Brute-Force Lockout',
      rxSignatureStandard: 'HMAC-SHA256 Canonical Digital Seal',
      nationalScaleCapacity: 120_000_000,
      governorateShards: 27,
      totalAuditLogs,
      failedRequests,
      activeSessions,
      lockedAccounts,
      activeNfcCards,
      revokedNfcCards,
      signedPrescriptions,
      totalPatients,
      checkedAt: new Date().toISOString(),
    };
  }

  async listFacilities() {
    const staff = await this.prisma.user.findMany({
      where: { role: { not: Role.PATIENT } },
      select: SELECT,
      orderBy: { createdAt: 'asc' },
    });

    const groups = new Map<
      string,
      {
        key: string;
        facilityEn: string;
        facilityAr: string;
        staff: typeof staff;
      }
    >();

    for (const u of staff) {
      const en = u.facilityEn?.trim() || 'National Health Command';
      const ar = u.facilityAr?.trim() || 'المركز القومي للمنظومة الصحية';
      const key = en.toLowerCase();
      const existing = groups.get(key);
      if (existing) {
        existing.staff.push(u);
      } else {
        groups.set(key, { key, facilityEn: en, facilityAr: ar, staff: [u] });
      }
    }

    return Array.from(groups.values()).map((g) => {
      const roles = new Set(g.staff.map((s) => s.role));
      const hasAssistant = g.staff.some((s) => s.specialityEn === 'CLINIC_ASSISTANT');
      let facilityType: 'CLINIC' | 'LAB' | 'HOSPITAL' | 'PHARMACY' | 'COMMAND' = 'COMMAND';
      if (roles.has(Role.HOSPITAL_STAFF)) {
        facilityType = 'HOSPITAL';
      } else if (roles.has(Role.LAB_TECH)) {
        facilityType = 'LAB';
      } else if (hasAssistant || roles.has(Role.DOCTOR)) {
        facilityType = 'CLINIC';
      } else if (roles.has(Role.PHARMACIST)) {
        facilityType = 'PHARMACY';
      }
      return {
        key: g.key,
        facilityType,
        facilityEn: g.facilityEn,
        facilityAr: g.facilityAr,
        staffCount: g.staff.length,
        staff: g.staff,
      };
    });
  }

  private async ensureUniqueEmail(candidateEmail: string, rolePrefix: string, excludeEmail?: string): Promise<string> {
    let email = candidateEmail.trim().toLowerCase();
    const [rawLocal, rawDomain] = email.split('@');
    const local = rawLocal || 'staff';
    const domain = rawDomain || 'mnis.eg';

    if (excludeEmail && email === excludeEmail.toLowerCase()) {
      email = `${rolePrefix}.${local}@${domain}`;
    }

    for (let attempt = 0; attempt < 8; attempt++) {
      if (!excludeEmail || email !== excludeEmail.toLowerCase()) {
        const exists = await this.prisma.user.findUnique({ where: { email }, select: { id: true } });
        if (!exists) return email;
      }
      const suffix = Math.floor(100 + Math.random() * 900);
      const baseLocal = attempt === 0 && excludeEmail ? `${rolePrefix}.${local}` : local;
      email = `${baseLocal}.${suffix}@${domain}`;
    }
    return `${rolePrefix}.${local}.${Date.now()}@${domain}`;
  }

  async createFacilityBundle(dto: CreateFacilityBundleDto) {
    const primaryEmail = await this.ensureUniqueEmail(dto.primaryEmail, 'primary');
    const rolePrefix =
      dto.facilityType === 'CLINIC'
        ? 'assistant'
        : dto.facilityType === 'LAB'
          ? 'specialist'
          : 'doctor';
    const rawSecondary = dto.secondaryEmail?.trim().toLowerCase() || '';
    const [pLocal, pDomain] = primaryEmail.split('@');
    const secondaryCandidate =
      rawSecondary && rawSecondary !== primaryEmail
        ? rawSecondary
        : `${rolePrefix}.${pLocal || 'staff'}@${pDomain || 'mnis.eg'}`;
    const secondaryEmail = await this.ensureUniqueEmail(secondaryCandidate, rolePrefix, primaryEmail);
    const directorEmail =
      dto.facilityType === 'LAB'
        ? await this.ensureUniqueEmail(`director.${pLocal || 'lab'}@${pDomain || 'mnis.eg'}`, 'director', secondaryEmail)
        : null;

    const temp1 = generateTempPassword();
    const hash1 = await argon2.hash(temp1);
    const temp2 = generateTempPassword();
    const hash2 = await argon2.hash(temp2);
    const temp3 = directorEmail ? generateTempPassword() : null;
    const hash3 = temp3 ? await argon2.hash(temp3) : null;

    const facilityEn = dto.facilityEn.trim();
    const facilityAr = dto.facilityAr.trim();

    const accounts: Array<{
      user: Record<string, unknown>;
      temporaryPassword: string;
      roleLabelEn: string;
      roleLabelAr: string;
    }> = [];

    await this.prisma.$transaction(async (tx) => {
      if (dto.facilityType === 'CLINIC') {
        const doc = await tx.user.create({
          data: {
            email: primaryEmail,
            passwordHash: hash1,
            role: Role.DOCTOR,
            fullNameEn: dto.primaryNameEn.trim(),
            fullNameAr: dto.primaryNameAr.trim(),
            licenseNo: dto.licenseNo?.trim() || `EGY-DOC-${Math.floor(100000 + Math.random() * 900000)}`,
            specialityEn: dto.specialityEn?.trim() || 'General & Internal Medicine',
            specialityAr: dto.specialityAr?.trim() || 'الباطنة والطب العام',
            facilityEn,
            facilityAr,
            mustChangePassword: false,
          },
          select: SELECT,
        });
        for (let d = 0; d <= 6; d++) {
          await tx.doctorSchedule.create({
            data: {
              doctorId: doc.id,
              dayOfWeek: d,
              startTime: '09:00',
              endTime: '17:00',
              slotMinutes: 20,
              isActive: true,
            },
          });
        }
        accounts.push({
          user: doc,
          temporaryPassword: temp1,
          roleLabelEn: 'Clinic Physician (Doctor)',
          roleLabelAr: 'طبيب العيادة',
        });

        if (secondaryEmail && hash2 && temp2) {
          const ast = await tx.user.create({
            data: {
              email: secondaryEmail,
              passwordHash: hash2,
              role: Role.RECEPTIONIST,
              fullNameEn: dto.secondaryNameEn?.trim() || `Assistant — ${dto.primaryNameEn.trim()}`,
              fullNameAr: dto.secondaryNameAr?.trim() || `مساعد عيادة ${dto.primaryNameAr.trim()}`,
              licenseNo: `AST:${primaryEmail}`,
              specialityEn: 'CLINIC_ASSISTANT',
              specialityAr: 'مساعد طبيب وإدارة عيادة',
              facilityEn,
              facilityAr,
              mustChangePassword: false,
            },
            select: SELECT,
          });
          accounts.push({
            user: ast,
            temporaryPassword: temp2,
            roleLabelEn: 'Doctor Clinic Assistant',
            roleLabelAr: 'الموظف المساعد للطبيب',
          });
        }
      } else if (dto.facilityType === 'LAB') {
        const baseLic = dto.licenseNo?.trim() || `LAB-EG-${Math.floor(1000 + Math.random() * 9000)}`;
        const labRec = await tx.user.create({
          data: {
            email: primaryEmail,
            passwordHash: hash1,
            role: Role.LAB_TECH,
            fullNameEn: dto.primaryNameEn.trim(),
            fullNameAr: dto.primaryNameAr.trim(),
            licenseNo: baseLic,
            specialityEn: 'LAB_RECEPTION',
            specialityAr: 'استقبال وسحب عينات المعمل',
            facilityEn,
            facilityAr,
            mustChangePassword: false,
          },
          select: SELECT,
        });
        accounts.push({
          user: labRec,
          temporaryPassword: temp1,
          roleLabelEn: 'Lab Receptionist & Intake Officer',
          roleLabelAr: 'موظف استقبال المعمل',
        });

        if (secondaryEmail && hash2 && temp2) {
          const labSpec = await tx.user.create({
            data: {
              email: secondaryEmail,
              passwordHash: hash2,
              role: Role.LAB_TECH,
              fullNameEn: dto.secondaryNameEn?.trim() || `${facilityEn} Specialist`,
              fullNameAr: dto.secondaryNameAr?.trim() || `أخصائي تحاليل — ${facilityAr}`,
              licenseNo: `${baseLic}-SPEC`,
              specialityEn: dto.specialityEn?.trim() || 'Diagnostic Lab Specialist',
              specialityAr: dto.specialityAr?.trim() || 'أخصائي تحاليل طبية معتمد',
              facilityEn,
              facilityAr,
              mustChangePassword: false,
            },
            select: SELECT,
          });
          accounts.push({
            user: labSpec,
            temporaryPassword: temp2,
            roleLabelEn: 'Diagnostic Lab Specialist',
            roleLabelAr: 'أخصائي التحاليل الطبية',
          });
        }

        if (directorEmail && hash3 && temp3) {
          const labDirector = await tx.user.create({
            data: {
              email: directorEmail,
              passwordHash: hash3,
              role: Role.LAB_TECH,
              fullNameEn: `${facilityEn} Director & Verifier`,
              fullNameAr: `مدير ومعتمد النتائج — ${facilityAr}`,
              licenseNo: `${baseLic}-DIR`,
              specialityEn: 'Lab Director & Senior Verifier',
              specialityAr: 'مدير المعمل ومعتمد النتائج النهائية',
              facilityEn,
              facilityAr,
              mustChangePassword: false,
            },
            select: SELECT,
          });
          accounts.push({
            user: labDirector,
            temporaryPassword: temp3,
            roleLabelEn: 'Lab Director & Senior Verifier (Dual Sign-Off)',
            roleLabelAr: 'مدير المعمل ومعتمد النتائج النهائية (التوقيع المزدوج)',
          });
        }
      } else {
        const baseLic = dto.licenseNo?.trim() || `HOSP-EG-${Math.floor(1000 + Math.random() * 9000)}`;
        const hospOfficer = await tx.user.create({
          data: {
            email: primaryEmail,
            passwordHash: hash1,
            role: Role.HOSPITAL_STAFF,
            fullNameEn: dto.primaryNameEn.trim(),
            fullNameAr: dto.primaryNameAr.trim(),
            licenseNo: baseLic,
            specialityEn: 'Emergency & Inpatient Operations',
            specialityAr: 'عمليات الطوارئ والتنويم بالمستشفى',
            facilityEn,
            facilityAr,
            mustChangePassword: false,
          },
          select: SELECT,
        });
        accounts.push({
          user: hospOfficer,
          temporaryPassword: temp1,
          roleLabelEn: 'Hospital & ER Officer',
          roleLabelAr: 'مسؤول الطوارئ وعمليات المستشفى',
        });

        if (secondaryEmail && hash2 && temp2) {
          const hospDoc = await tx.user.create({
            data: {
              email: secondaryEmail,
              passwordHash: hash2,
              role: Role.DOCTOR,
              fullNameEn: dto.secondaryNameEn?.trim() || `Specialist — ${facilityEn}`,
              fullNameAr: dto.secondaryNameAr?.trim() || `طبيب — ${facilityAr}`,
              licenseNo: `EGY-DOC-${Math.floor(100000 + Math.random() * 900000)}`,
              specialityEn: dto.specialityEn?.trim() || 'Emergency & Critical Care',
              specialityAr: dto.specialityAr?.trim() || 'طب الطوارئ والرعاية الحرجة',
              facilityEn,
              facilityAr,
              mustChangePassword: false,
            },
            select: SELECT,
          });
          for (let d = 0; d <= 6; d++) {
            await tx.doctorSchedule.create({
              data: {
                doctorId: hospDoc.id,
                dayOfWeek: d,
                startTime: '09:00',
                endTime: '17:00',
                slotMinutes: 20,
                isActive: true,
              },
            });
          }
          accounts.push({
            user: hospDoc,
            temporaryPassword: temp2,
            roleLabelEn: 'Hospital Specialist Physician',
            roleLabelAr: 'طبيب أخصائي بالمستشفى',
          });
        }

        const codeSuffix = Math.floor(1000 + Math.random() * 9000);
        await tx.bed.createMany({
          data: [
            {
              wardEn: `${facilityEn} — ICU & Acute Care`,
              wardAr: `${facilityAr} — الرعاية المركزة والحرجة`,
              bedNumber: `H-${codeSuffix}-1`,
              status: 'AVAILABLE',
            },
            {
              wardEn: `${facilityEn} — General Inpatient`,
              wardAr: `${facilityAr} — التنويم الداخلي العام`,
              bedNumber: `H-${codeSuffix}-2`,
              status: 'AVAILABLE',
            },
          ],
        });
      }
    });

    return {
      facilityType: dto.facilityType,
      facilityEn,
      facilityAr,
      accounts,
    };
  }
}

@ApiTags('admin') @ApiBearerAuth() @Audit('USER')
@Roles(Role.ADMIN, Role.EXECUTIVE)
@Controller('admin/users')
export class AdminController {
  constructor(private svc: AdminService) {}
  @Get() list() { return this.svc.list(); }
  @Get('facilities')
  @Roles(Role.ADMIN, Role.EXECUTIVE, Role.DOCTOR, Role.LAB_TECH, Role.HOSPITAL_STAFF, Role.PHARMACIST, Role.RECEPTIONIST)
  listFacilities() { return this.svc.listFacilities(); }
  @Post('facilities')
  @Roles(Role.ADMIN)
  createFacilityBundle(@Body() dto: CreateFacilityBundleDto) { return this.svc.createFacilityBundle(dto); }
  @Get('audit-logs') auditLogs() { return this.svc.getAuditLogs(); }
  @Get('security-posture') securityPosture() { return this.svc.getSecurityPosture(); }
  @Post() @Roles(Role.ADMIN) create(@Body() dto: CreateStaffDto) { return this.svc.create(dto); }
  @Patch(':id/active') @Roles(Role.ADMIN) setActive(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ActiveDto, @CurrentUser() u: AuthUser) { return this.svc.setActive(id, dto.isActive, u.id); }
  @Post(':id/reset-password') @Roles(Role.ADMIN) reset(@Param('id', ParseUUIDPipe) id: string) { return this.svc.resetPassword(id); }
}

@Module({ controllers: [AdminController], providers: [AdminService] })
export class AdminModule {}
