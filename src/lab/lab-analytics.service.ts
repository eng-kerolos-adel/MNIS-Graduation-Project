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
export class LabAnalyticsService {
  constructor(private prisma: PrismaService) {}

  async getAnalytics() {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const totalSamplesThisMonth = await this.prisma.labSample.count({
      where: { collectedAt: { gte: startOfMonth } }
    });

    // Turnaround time logic
    const verifiedSamples = await this.prisma.labSample.findMany({
      where: { status: 'VERIFIED', collectedAt: { gte: startOfMonth } },
      select: { collectedAt: true, verifiedAt: true }
    });

    let sumTatMs = 0;
    for (const s of verifiedSamples) {
      if (s.verifiedAt) {
        sumTatMs += (s.verifiedAt.getTime() - s.collectedAt.getTime());
      }
    }
    const avgTurnaroundHours = verifiedSamples.length > 0 ? (sumTatMs / verifiedSamples.length) / 3600000 : 0;

    // Abnormal rate
    const resultsThisMonth = await this.prisma.labResult.count({
      where: { sample: { collectedAt: { gte: startOfMonth } } }
    });
    const abnormalResults = await this.prisma.labResult.count({
      where: { 
        sample: { collectedAt: { gte: startOfMonth } },
        flag: { in: ['LOW', 'HIGH', 'CRITICAL'] }
      }
    });

    const abnormalRate = resultsThisMonth > 0 ? (abnormalResults / resultsThisMonth) * 100 : 0;

    const statusGroup = await this.prisma.labSample.groupBy({
      by: ['status'],
      _count: { id: true },
      where: { collectedAt: { gte: startOfMonth } }
    });

    const topPanels = await this.prisma.labSample.groupBy({
      by: ['panelEn'],
      _count: { id: true },
      where: { collectedAt: { gte: startOfMonth } },
      orderBy: { _count: { id: 'desc' } },
      take: 5
    });

    return {
      totalSamplesThisMonth,
      avgTurnaroundHours,
      abnormalRate,
      samplesByStatus: statusGroup.map(g => ({ status: g.status, count: g._count.id })),
      topPanels: topPanels.map(p => ({ panelEn: p.panelEn, count: p._count.id }))
    };
  }
}

@ApiTags('lab-analytics')
@ApiBearerAuth()
@Audit('LAB_ANALYTICS')
@Roles(Role.LAB_TECH, Role.EXECUTIVE, Role.ADMIN)
@Controller('lab/analytics')
export class LabAnalyticsController {
  constructor(private svc: LabAnalyticsService) {}

  @Get()
  getAnalytics() {
    return this.svc.getAnalytics();
  }
}
