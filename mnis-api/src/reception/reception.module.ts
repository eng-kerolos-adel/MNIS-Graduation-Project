import { ConflictException, Controller, Body, Injectable, Module, NotFoundException, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { NfcCardStatus, Role } from '@prisma/client';
import * as argon2 from 'argon2';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { CryptoService } from '../common/crypto.service';
import { Audit, CurrentUser, AuthUser, Roles } from '../common/decorators';
import { generateTempPassword } from '../common/password.util';
import { PatientsModule } from '../patients/patients.module';
import { CreatePatientDto, PatientsService } from '../patients/patients.service';

/** Citizens cannot self-register: reception opens the account on the first visit and hands over a one-time temporary password + NFC emergency token. */
@Injectable()
export class ReceptionService {
  constructor(private prisma: PrismaService, private crypto: CryptoService, private patients: PatientsService) {}

  async openAccount(dto: CreatePatientDto, receptionistId?: string) {
    const existing = await this.prisma.patient.findUnique({ where: { nationalIdIdx: this.crypto.blindIndex(dto.nationalId) } });
    const patient = existing ?? (await this.patients.create(dto));
    if (await this.prisma.user.findUnique({ where: { patientId: patient.id } })) throw new ConflictException('ACCOUNT_ALREADY_EXISTS');
    const temp = generateTempPassword();
    await this.prisma.user.create({
      data: { role: Role.PATIENT, patientId: patient.id, fullNameEn: patient.fullNameEn, fullNameAr: patient.fullNameAr, passwordHash: await argon2.hash(temp), mustChangePassword: true },
    });

    // Automatically issue an active NFC card for the citizen on account opening
    const rawNfcToken = randomBytes(32).toString('hex').toUpperCase();
    const tokenHash = this.crypto.sha256(rawNfcToken);
    const activeCard = await this.prisma.nfcCard.findFirst({ where: { patientId: patient.id, status: NfcCardStatus.ACTIVE } });
    if (!activeCard) {
      await this.prisma.nfcCard.create({
        data: {
          patientId: patient.id,
          tokenHash,
          status: NfcCardStatus.ACTIVE,
          printedById: receptionistId ?? null,
        },
      });
    }

    return {
      patientId: patient.id,
      mti: patient.mti,
      loginId: dto.nationalId,
      temporaryPassword: temp,
      nfcToken: activeCard ? undefined : rawNfcToken,
    };
  }

  async resetCitizenPassword(patientId: string) {
    const user = await this.prisma.user.findUnique({ where: { patientId } });
    if (!user) throw new NotFoundException('NO_ACCOUNT_FOR_PATIENT');
    const temp = generateTempPassword();
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: user.id }, data: { passwordHash: await argon2.hash(temp), mustChangePassword: true, failedLogins: 0, lockedUntil: null } }),
      this.prisma.refreshToken.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } }),
    ]);
    return { temporaryPassword: temp };
  }
}

@ApiTags('reception') @ApiBearerAuth() @Audit('CITIZEN_ACCOUNT')
@Roles(Role.RECEPTIONIST, Role.ADMIN)
@Controller('reception/citizens')
export class ReceptionController {
  constructor(private svc: ReceptionService) {}
  @Post() open(@Body() dto: CreatePatientDto, @CurrentUser() u: AuthUser) { return this.svc.openAccount(dto, u?.id); }
  @Post(':patientId/reset-password') reset(@Param('patientId', ParseUUIDPipe) id: string) { return this.svc.resetCitizenPassword(id); }
}

@Module({ imports: [PatientsModule], controllers: [ReceptionController], providers: [ReceptionService] })
export class ReceptionModule {}
