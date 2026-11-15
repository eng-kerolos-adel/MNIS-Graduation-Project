import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import { Role } from '@prisma/client';

export const IS_PUBLIC = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC, true);

export const ROLES_KEY = 'roles';
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

export const AUDIT_RESOURCE = 'auditResource';
/** Tag a controller/route with the resource type recorded in the audit trail. */
export const Audit = (resourceType: string) => SetMetadata(AUDIT_RESOURCE, resourceType);

export const ALLOW_PW_CHANGE = 'allowPwChange';
/** Routes reachable while the account still has a temporary password (change-password, me, logout). */
export const AllowPasswordChange = () => SetMetadata(ALLOW_PW_CHANGE, true);

export interface AuthUser {
  id: string;
  role: Role;
  patientId: string | null;
  mustChangePassword: boolean;
}

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser => {
  return ctx.switchToHttp().getRequest().user;
});
