import { BadRequestException, Body, Controller, Get, Injectable, Module, NotFoundException, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import * as argon2 from 'argon2';
import { IsBoolean, IsEmail, IsIn, IsOptional, IsString, Length, MaxLength } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { Audit, Roles } from '../common/decorators';
import { generateTempPassword } from '../common/password.util';

const STAFF_ROLES = ['DOCTOR', 'PHARMACIST', 'LAB_TECH', 'HOSPITAL_STAFF', 'EXECUTIVE', 'RECEPTIONIST', 'ADMIN'] as const;

export class CreateStaffDto {
  @IsEmail() @MaxLength(254) email: string;
  @IsIn(STAFF_ROLES as unknown as string[]) role: (typeof STAFF_ROLES)[number];
  @IsString() @Length(2, 120) fullNameEn: string;
  @IsString() @Length(2, 120) fullNameAr: string;
  @IsOptional() @IsString() @MaxLength(60) licenseNo?: string;
}
export class ActiveDto { @IsBoolean() isActive: boolean; }

const SELECT = { id: true, email: true, role: true, fullNameEn: true, fullNameAr: true, licenseNo: true, isActive: true, mustChangePassword: true, createdAt: true } as const;

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

  async setActive(id: string, isActive: boolean) {
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
}

@ApiTags('admin') @ApiBearerAuth() @Audit('USER')
@Roles(Role.ADMIN, Role.EXECUTIVE)
@Controller('admin/users')
export class AdminController {
  constructor(private svc: AdminService) {}
  @Get() list() { return this.svc.list(); }
  @Get('audit-logs') auditLogs() { return this.svc.getAuditLogs(); }
  @Get('security-posture') securityPosture() { return this.svc.getSecurityPosture(); }
  @Post() @Roles(Role.ADMIN) create(@Body() dto: CreateStaffDto) { return this.svc.create(dto); }
  @Patch(':id/active') @Roles(Role.ADMIN) setActive(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ActiveDto) { return this.svc.setActive(id, dto.isActive); }
  @Post(':id/reset-password') @Roles(Role.ADMIN) reset(@Param('id', ParseUUIDPipe) id: string) { return this.svc.resetPassword(id); }
}

@Module({ controllers: [AdminController], providers: [AdminService] })
export class AdminModule {}
