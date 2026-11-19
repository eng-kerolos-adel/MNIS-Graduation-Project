import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { randomBytes, randomUUID } from 'crypto';
import { env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';
import { CryptoService } from '../common/crypto.service';

const MAX_FAILS = 5;
const LOCK_MINUTES = 15;

export interface ClientMeta { ip?: string; userAgent?: string }

@Injectable()
export class AuthService {
  constructor(private prisma: PrismaService, private jwt: JwtService, private crypto: CryptoService) {}

  async login(identifier: string, password: string, meta: ClientMeta) {
    const id = identifier.trim();
    const user = /^\d{14}$/.test(id)
      ? await this.prisma.user.findFirst({ where: { patient: { nationalIdIdx: this.crypto.blindIndex(id) } } })
      : await this.prisma.user.findUnique({ where: { email: id.toLowerCase() } });
    // Same error for every failure mode: no user enumeration.
    const fail = () => new UnauthorizedException('INVALID_CREDENTIALS');
    if (!user || !user.isActive) { await argon2.hash(password).catch(() => undefined); throw fail(); }
    if (user.lockedUntil && user.lockedUntil > new Date()) throw fail();

    const ok = await argon2.verify(user.passwordHash, password).catch(() => false);
    if (!ok) {
      const fails = user.failedLogins + 1;
      await this.prisma.user.update({
        where: { id: user.id },
        data: fails >= MAX_FAILS
          ? { failedLogins: 0, lockedUntil: new Date(Date.now() + LOCK_MINUTES * 60_000) }
          : { failedLogins: fails },
      });
      throw fail();
    }
    if (user.failedLogins || user.lockedUntil) {
      await this.prisma.user.update({ where: { id: user.id }, data: { failedLogins: 0, lockedUntil: null } });
    }
    const tokens = await this.issue(user.id, user.role, randomUUID(), meta);
    return {
      ...tokens,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        fullNameEn: user.fullNameEn,
        fullNameAr: user.fullNameAr,
        licenseNo: user.licenseNo,
        specialityEn: user.specialityEn,
        specialityAr: user.specialityAr,
        facilityEn: user.facilityEn,
        facilityAr: user.facilityAr,
        patientId: user.patientId,
        mustChangePassword: user.mustChangePassword,
      },
    };
  }

  async refresh(rawToken: string | undefined, meta: ClientMeta) {
    if (!rawToken) throw new UnauthorizedException();
    const row = await this.prisma.refreshToken.findUnique({ where: { tokenHash: this.crypto.sha256(rawToken) }, include: { user: true } });
    if (!row) throw new UnauthorizedException();
    if (row.revokedAt) {
      const elapsedMs = Date.now() - row.revokedAt.getTime();
      // Only allow the 10s grace window if the session family still has an active unrevoked token
      // (i.e. concurrent rotation in progress, NOT explicitly logged out / revoked).
      if (elapsedMs <= 10_000 && row.expiresAt >= new Date() && row.user.isActive) {
        const activeSibling = await this.prisma.refreshToken.findFirst({
          where: { familyId: row.familyId, revokedAt: null },
          select: { id: true },
        });
        if (activeSibling) {
          return this.issue(row.userId, row.user.role, row.familyId, meta);
        }
      }
      // A rotated or logged-out token was presented again => kill the whole family.
      await this.prisma.refreshToken.updateMany({ where: { familyId: row.familyId, revokedAt: null }, data: { revokedAt: new Date() } });
      throw new UnauthorizedException();
    }
    if (row.expiresAt < new Date() || !row.user.isActive) throw new UnauthorizedException();
    return this.issue(row.userId, row.user.role, row.familyId, meta, row.id);
  }

  async logout(rawToken: string | undefined) {
    if (!rawToken) return;
    const row = await this.prisma.refreshToken.findUnique({ where: { tokenHash: this.crypto.sha256(rawToken) } });
    if (row) await this.prisma.refreshToken.updateMany({ where: { familyId: row.familyId, revokedAt: null }, data: { revokedAt: new Date() } });
  }

  me(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true, email: true, role: true, fullNameEn: true, fullNameAr: true,
        licenseNo: true, specialityEn: true, specialityAr: true, facilityEn: true, facilityAr: true,
        patientId: true, mustChangePassword: true,
      },
    });
  }

  listSessions(userId: string) {
    return this.prisma.refreshToken.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
      select: { id: true, ip: true, userAgent: true, createdAt: true, expiresAt: true },
    });
  }

  async revokeAllSessions(userId: string) {
    const res = await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return { revoked: res.count };
  }

  async changePassword(userId: string, current: string, next: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !(await argon2.verify(user.passwordHash, current).catch(() => false))) throw new UnauthorizedException('INVALID_CREDENTIALS');
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: userId }, data: { passwordHash: await argon2.hash(next), mustChangePassword: false, failedLogins: 0, lockedUntil: null } }),
      // Every existing session is signed out; the client must log in again with the new password.
      this.prisma.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } }),
    ]);
    return { ok: true, reloginRequired: true };
  }

  private async issue(userId: string, role: string, familyId: string, meta: ClientMeta, revokeId?: string) {
    const accessToken = await this.jwt.signAsync({ sub: userId, role }, { secret: env.JWT_ACCESS_SECRET, expiresIn: env.ACCESS_TTL_SECONDS, algorithm: 'HS256' });
    const refreshToken = randomBytes(48).toString('base64url');
    const createOp = this.prisma.refreshToken.create({
      data: {
        userId, familyId,
        tokenHash: this.crypto.sha256(refreshToken),
        expiresAt: new Date(Date.now() + env.REFRESH_TTL_DAYS * 86_400_000),
        ip: meta.ip?.slice(0, 64), userAgent: meta.userAgent?.slice(0, 200),
      },
    });
    if (revokeId) {
      await this.prisma.$transaction([
        this.prisma.refreshToken.update({ where: { id: revokeId }, data: { revokedAt: new Date() } }),
        createOp,
      ]);
    } else {
      await createOp;
    }
    return { accessToken, refreshToken, expiresIn: env.ACCESS_TTL_SECONDS };
  }
}
