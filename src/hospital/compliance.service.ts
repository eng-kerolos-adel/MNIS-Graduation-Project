import {
  Controller,
  Get,
  Injectable,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { Audit, Roles } from '../common/decorators';

@Injectable()
export class HospitalComplianceService {
  constructor(private prisma: PrismaService) {}

  async getComplianceMetrics() {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    // ER Wait Times (arrivedAt to calledAt) for COMPLETED visits
    const completedVisits = await this.prisma.visit.findMany({
      where: { status: 'COMPLETED', arrivedAt: { gte: startOfMonth } },
      select: { arrivedAt: true, calledAt: true }
    });

    let sumWaitMs = 0;
    let waitCount = 0;
    for (const v of completedVisits) {
      if (v.calledAt) {
        sumWaitMs += (v.calledAt.getTime() - v.arrivedAt.getTime());
        waitCount++;
      }
    }
    const avgWaitMinutes = waitCount > 0 ? Math.round((sumWaitMs / waitCount) / 60000) : 0;

    // Bed Occupancy
    const totalBeds = await this.prisma.bed.count();
    const occupiedBeds = await this.prisma.bed.count({ where: { status: 'OCCUPIED' } });
    const bedOccupancyPct = totalBeds > 0 ? (occupiedBeds / totalBeds) * 100 : 0;

    // Er Rejection Rate (approximated by Discharged cases)
    const erCasesThisMonth = await this.prisma.erCase.count({ where: { arrivedAt: { gte: startOfMonth } } });
    const dischargedCases = await this.prisma.erCase.count({ where: { status: 'DISCHARGED', arrivedAt: { gte: startOfMonth } } });
    const erRejectionRate = erCasesThisMonth > 0 ? (dischargedCases / erCasesThisMonth) * 100 : 0;

    // Average ER Acuity
    const erCases = await this.prisma.erCase.findMany({
      where: { arrivedAt: { gte: startOfMonth } },
      select: { acuity: true }
    });
    const avgErAcuity = erCases.length > 0 ? erCases.reduce((sum, c) => sum + c.acuity, 0) / erCases.length : 0;

    // OR Stats
    const [orCasesThisMonth, orCasesCompleted] = await Promise.all([
      this.prisma.orCase.count({ where: { scheduledStart: { gte: startOfMonth } } }),
      this.prisma.orCase.count({ where: { status: 'COMPLETED', scheduledStart: { gte: startOfMonth } } })
    ]);
    const orCompletionRate = orCasesThisMonth > 0 ? (orCasesCompleted / orCasesThisMonth) * 100 : 0;

    return {
      avgWaitMinutes,
      bedOccupancyPct,
      erRejectionRate,
      totalAdmissionsThisMonth: erCasesThisMonth,
      avgErAcuity,
      orCasesThisMonth,
      orCompletionRate
    };
  }
}

@ApiTags('hospital-compliance')
@ApiBearerAuth()
@Audit('HOSPITAL_COMPLIANCE')
@Roles(Role.HOSPITAL_STAFF, Role.EXECUTIVE, Role.ADMIN)
@Controller('hospital/compliance')
export class HospitalComplianceController {
  constructor(private svc: HospitalComplianceService) {}

  @Get()
  getMetrics() {
    return this.svc.getComplianceMetrics();
  }
}
