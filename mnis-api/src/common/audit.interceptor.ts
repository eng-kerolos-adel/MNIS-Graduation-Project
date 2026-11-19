import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, map, tap } from 'rxjs';
import { PrismaService } from '../prisma/prisma.service';
import { CryptoService } from './crypto.service';
import { AUDIT_RESOURCE } from './decorators';

/** Records who touched what (metadata only — never request/response bodies) for every authenticated call,
 *  and transparently decrypts `nationalIdEnc` -> `nationalId` on any patient object in the response. */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger('Audit');
  constructor(
    private prisma: PrismaService,
    private reflector: Reflector,
    private crypto: CryptoService,
  ) {}

  private maskIfRestricted(raw: string, role?: string): string {
    if (role === 'LAB_TECH' || role === 'PHARMACIST') {
      return raw.length >= 4 ? `**********${raw.slice(-4)}` : raw;
    }
    return raw;
  }

  private hydrateNationalId(val: unknown, role?: string, seen = new WeakSet<object>()): unknown {
    if (!val || typeof val !== 'object') return val;
    if (val instanceof Date || Buffer.isBuffer(val)) return val;
    if (seen.has(val as object)) return val;
    seen.add(val as object);

    if (Array.isArray(val)) {
      return val.map((item) => this.hydrateNationalId(item, role, seen));
    }

    const obj = val as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (k === 'nationalIdEnc' && typeof v === 'string') {
        if (!obj.nationalId) {
          try {
            out.nationalId = this.maskIfRestricted(this.crypto.decrypt(v), role);
          } catch {
            out.nationalId = '';
          }
        }
        continue;
      }
      if (k === 'nationalId' && typeof v === 'string') {
        out[k] = this.maskIfRestricted(v, role);
        continue;
      }
      if (k === 'nationalIdIdx') {
        continue;
      }
      out[k] = this.hydrateNationalId(v, role, seen);
    }
    return out;
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest();
    const res = context.switchToHttp().getResponse();
    const resourceType = this.reflector.getAllAndOverride<string>(AUDIT_RESOURCE, [context.getHandler(), context.getClass()]);
    const write = (status: number) => {
      if (!req.user) return;
      this.prisma.auditLog
        .create({
          data: {
            userId: req.user.id,
            role: req.user.role,
            method: req.method,
            path: String(req.originalUrl ?? req.url).split('?')[0].slice(0, 300),
            resourceType: resourceType ?? null,
            resourceId: req.params?.id ?? null,
            statusCode: status,
            ip: req.ip ?? null,
          },
        })
        .catch((e) => this.logger.error(`audit write failed: ${e?.message}`));
    };
    return next.handle().pipe(
      map((data) => this.hydrateNationalId(data, req.user?.role)),
      tap({
        next: () => write(res.statusCode),
        error: (e) => write(typeof e?.getStatus === 'function' ? e.getStatus() : 500),
      }),
    );
  }
}
