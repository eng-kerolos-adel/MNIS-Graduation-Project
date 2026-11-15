import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Injectable,
  Module,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { NotifType } from '@prisma/client';
import { IsString, IsEnum, IsOptional } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { PrismaModule } from '../prisma/prisma.module';
import { Audit, CurrentUser, AuthUser } from '../common/decorators';

// --- DTOs ---
export class RegisterTokenDto {
  @IsString()
  token: string;

  @IsString()
  platform: string; // 'android' | 'ios'
}

export class UnregisterTokenDto {
  @IsString()
  token: string;
}

// --- Service ---
@Injectable()
export class NotificationsService {
  constructor(private prisma: PrismaService) {}

  async registerToken(userId: string, token: string, platform: string) {
    return this.prisma.pushToken.upsert({
      where: { token },
      update: { userId, platform, updatedAt: new Date() },
      create: { userId, token, platform },
    });
  }

  async unregisterToken(userId: string, token: string) {
    return this.prisma.pushToken.deleteMany({
      where: { token, userId },
    });
  }

  async sendToUser(
    userId: string,
    type: NotifType,
    titleEn: string,
    titleAr: string,
    bodyEn: string,
    bodyAr: string,
    data: any = {}
  ) {
    // 1. Log to DB
    const notif = await this.prisma.pushNotification.create({
      data: {
        userId,
        type,
        titleEn,
        titleAr,
        bodyEn,
        bodyAr,
        data,
      },
    });

    // 2. Fetch user's tokens
    const tokens = await this.prisma.pushToken.findMany({
      where: { userId },
    });

    if (tokens.length === 0) return notif;

    // 3. Send via FCM (stub for free tier without google-auth-library)
    const serverKey = process.env.FCM_SERVER_KEY;
    if (serverKey) {
      const fetchPromises = tokens.map(t => 
        fetch('https://fcm.googleapis.com/fcm/send', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `key=${serverKey}`
          },
          body: JSON.stringify({
            to: t.token,
            notification: {
              title: titleEn, // Defaulting to EN for payload, localization handled by app usually, or send both in data
              body: bodyEn
            },
            data: {
              ...data,
              type,
              titleEn,
              titleAr,
              bodyEn,
              bodyAr
            }
          })
        }).catch(err => console.error('FCM send error:', err))
      );
      
      // Fire and forget
      Promise.all(fetchPromises);
    }

    return notif;
  }

  async getMyNotifications(userId: string) {
    return this.prisma.pushNotification.findMany({
      where: { userId },
      orderBy: { sentAt: 'desc' },
      take: 50,
    });
  }

  async markRead(userId: string, notifId: string) {
    return this.prisma.pushNotification.updateMany({
      where: { id: notifId, userId },
      data: { readAt: new Date() },
    });
  }
}

// --- Controller ---
@ApiTags('notifications')
@ApiBearerAuth()
@Audit('NOTIFICATION')
@Controller('notifications')
export class NotificationsController {
  constructor(private svc: NotificationsService) {}

  @Post('token')
  registerToken(@Body() dto: RegisterTokenDto, @CurrentUser() user: AuthUser) {
    return this.svc.registerToken(user.id, dto.token, dto.platform);
  }

  @Delete('token')
  unregisterToken(@Body() dto: UnregisterTokenDto, @CurrentUser() user: AuthUser) {
    return this.svc.unregisterToken(user.id, dto.token);
  }

  @Get()
  getMyNotifications(@CurrentUser() user: AuthUser) {
    return this.svc.getMyNotifications(user.id);
  }

  @Patch(':id/read')
  markRead(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.svc.markRead(user.id, id);
  }
}

// --- Module ---
@Module({
  imports: [PrismaModule],
  controllers: [NotificationsController],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
