import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from './prisma/prisma.module';
import { CryptoModule } from './common/crypto.service';
import { JwtAuthGuard, RolesGuard } from './common/guards';
import { AuditInterceptor } from './common/audit.interceptor';
import { AllExceptionsFilter } from './common/http-exception.filter';
import { AuthModule } from './auth/auth.module';
import { PatientsModule } from './patients/patients.module';
import { QueueModule } from './queue/queue.module';
import { PrescriptionsModule } from './prescriptions/prescriptions.module';
import { LabModule } from './lab/lab.module';
import { HospitalModule } from './hospital/hospital.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { AdminModule } from './admin/admin.module';
import { ReceptionModule } from './reception/reception.module';
import { MeModule } from './me/me.module';
import { AppointmentsModule } from './appointments/appointments.module';
import { ReferralsModule } from './referrals/referrals.module';
import { NfcCardsModule } from './nfc-cards/nfc-cards.module';
import { DoctorScheduleModule } from './doctor-schedule/doctor-schedule.module';
import { PharmacyModule } from './pharmacy/pharmacy.module';
import { NotificationsModule } from './notifications/notifications.module';
import { HealthController } from './health/health.controller';

@Module({
  imports: [
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    PrismaModule, CryptoModule, AuthModule, PatientsModule, QueueModule,
    PrescriptionsModule, LabModule, HospitalModule, AnalyticsModule,
    AdminModule, ReceptionModule, MeModule, AppointmentsModule,
    ReferralsModule, NfcCardsModule, DoctorScheduleModule, PharmacyModule,
    NotificationsModule
  ],
  controllers: [HealthController],
  providers: [
    // Order matters: throttle -> authenticate -> authorise.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
