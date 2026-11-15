import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { PrismaService } from '../prisma/prisma.service';
import { Public } from '../common/decorators';

@Controller('health')
export class HealthController {
  constructor(private prisma: PrismaService) {}

  @Public() @SkipThrottle() @Get()
  async check() {
    try { await this.prisma.$queryRaw`SELECT 1`; } catch { throw new ServiceUnavailableException('DB_DOWN'); }
    return { status: 'ok' };
  }
}
