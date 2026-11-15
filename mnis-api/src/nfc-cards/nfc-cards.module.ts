import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  NotFoundException,
  ConflictException,
  Injectable,
  Module,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role, NfcCardStatus } from '@prisma/client';
import { randomBytes } from 'crypto';
import { IsEnum, IsString, IsUUID } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { CryptoService } from '../common/crypto.service';
import { PrismaModule } from '../prisma/prisma.module';
import { CryptoModule } from '../common/crypto.service';
import { Audit, CurrentUser, AuthUser, Roles, Public } from '../common/decorators';

// --- DTOs ---
export class PrintCardDto {
  @IsUUID()
  patientId: string;
}

export class RevokeCardDto {
  @IsEnum(['LOST', 'STOLEN', 'DAMAGED', 'REPLACED'])
  revokeReason: string;
}

export class VerifyCardDto {
  @IsString()
  token: string;
}

// --- Service ---
@Injectable()
export class NfcCardsService {
  constructor(private prisma: PrismaService, private crypto: CryptoService) {}

  async print(patientId: string, receptionistId: string) {
    const activeCard = await this.prisma.nfcCard.findFirst({
      where: { patientId, status: NfcCardStatus.ACTIVE },
    });
    if (activeCard) {
      throw new ConflictException('CARD_ALREADY_ACTIVE');
    }

    const rawToken = randomBytes(32).toString('hex').toUpperCase();
    const tokenHash = this.crypto.sha256(rawToken);

    const card = await this.prisma.nfcCard.create({
      data: {
        patientId,
        tokenHash,
        status: NfcCardStatus.ACTIVE,
        printedById: receptionistId,
      },
    });

    return { cardId: card.id, token: rawToken };
  }

  async revoke(cardId: string, reason: string, userId: string) {
    const card = await this.prisma.nfcCard.findUnique({ where: { id: cardId } });
    if (!card) throw new NotFoundException('CARD_NOT_FOUND');
    if (card.status !== NfcCardStatus.ACTIVE) throw new ConflictException('CARD_NOT_ACTIVE');

    return this.prisma.nfcCard.update({
      where: { id: cardId },
      data: {
        status: NfcCardStatus.REVOKED,
        revokedById: userId,
        revokedAt: new Date(),
        revokeReason: reason,
      },
    });
  }

  async requestReplacement(patientId: string, userId: string) {
    const activeCard = await this.prisma.nfcCard.findFirst({
      where: { patientId, status: NfcCardStatus.ACTIVE },
    });

    return this.prisma.$transaction(async (tx) => {
      if (activeCard) {
        await tx.nfcCard.update({
          where: { id: activeCard.id },
          data: {
            status: NfcCardStatus.REPLACED,
            revokedById: userId,
            revokedAt: new Date(),
            revokeReason: 'REPLACED',
          },
        });
      }

      const rawToken = randomBytes(32).toString('hex').toUpperCase();
      const tokenHash = this.crypto.sha256(rawToken);

      const card = await tx.nfcCard.create({
        data: {
          patientId,
          tokenHash,
          status: NfcCardStatus.ACTIVE,
          printedById: userId,
        },
      });

      return { cardId: card.id, token: rawToken };
    });
  }

  async verify(token: string) {
    const clean = token.trim().replace(/^MNIS-MTI:/i, '');
    const tokenHash = this.crypto.sha256(clean);
    let card = await this.prisma.nfcCard.findUnique({
      where: { tokenHash },
      include: { patient: true },
    });

    if (!card && clean.toUpperCase().startsWith('MTI-')) {
      const patient = await this.prisma.patient.findUnique({
        where: { mti: clean.toUpperCase() },
      });
      if (patient) {
        card = await this.prisma.nfcCard.findFirst({
          where: { patientId: patient.id, status: NfcCardStatus.ACTIVE },
          include: { patient: true },
        });
      }
    }

    if (!card || card.status !== NfcCardStatus.ACTIVE) {
      throw new NotFoundException('CARD_INVALID_OR_REVOKED');
    }

    return {
      cardId: card.id,
      printedAt: card.printedAt,
      verifiedAt: new Date().toISOString(),
      mti: card.patient.mti,
      fullNameEn: card.patient.fullNameEn,
      fullNameAr: card.patient.fullNameAr,
      bloodType: card.patient.bloodType,
      governorate: card.patient.governorate,
      insuranceActive: card.patient.insuranceActive,
      allergies: card.patient.allergies,
      chronicConditions: card.patient.chronicConditions,
      organDonor: card.patient.organDonor,
    };
  }

  async listCards(patientId: string) {
    return this.prisma.nfcCard.findMany({
      where: { patientId },
      orderBy: { printedAt: 'desc' },
      select: { id: true, status: true, printedAt: true, revokedAt: true, revokeReason: true }
    });
  }
}

// --- Controller ---
@ApiTags('nfc-cards')
@ApiBearerAuth()
@Audit('NFC_CARD')
@Controller('nfc-cards')
export class NfcCardsController {
  constructor(private svc: NfcCardsService) {}

  @Post('print')
  @Roles(Role.RECEPTIONIST, Role.ADMIN, Role.DOCTOR)
  printCard(@Body() dto: PrintCardDto, @CurrentUser() user: AuthUser) {
    return this.svc.print(dto.patientId, user.id);
  }

  @Patch(':id/revoke')
  @Roles(Role.RECEPTIONIST, Role.ADMIN, Role.DOCTOR)
  revokeCard(@Param('id') id: string, @Body() dto: RevokeCardDto, @CurrentUser() user: AuthUser) {
    return this.svc.revoke(id, dto.revokeReason, user.id);
  }

  @Post('replace')
  @Roles(Role.RECEPTIONIST, Role.ADMIN, Role.DOCTOR)
  replaceCard(@Body() dto: PrintCardDto, @CurrentUser() user: AuthUser) {
    return this.svc.requestReplacement(dto.patientId, user.id);
  }

  @Public()
  @Post('verify')
  verifyCard(@Body() dto: VerifyCardDto) {
    return this.svc.verify(dto.token);
  }

  @Get('patient/:patientId')
  @Roles(Role.RECEPTIONIST, Role.ADMIN, Role.DOCTOR, Role.EXECUTIVE)
  listCards(@Param('patientId') patientId: string) {
    return this.svc.listCards(patientId);
  }
}

// --- Module ---
@Module({
  imports: [PrismaModule, CryptoModule],
  controllers: [NfcCardsController],
  providers: [NfcCardsService],
  exports: [NfcCardsService],
})
export class NfcCardsModule {}
