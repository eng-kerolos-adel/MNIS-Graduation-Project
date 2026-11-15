import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { Role } from '@prisma/client';
import { ALLOW_PW_CHANGE, IS_PUBLIC, ROLES_KEY } from './decorators';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private reflector: Reflector) {
    super();
  }
  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [context.getHandler(), context.getClass()]);
    if (isPublic) return true;
    return super.canActivate(context);
  }
}

/** Deny-by-default RBAC: a route with no @Roles() is open to any authenticated user; otherwise the role must match. */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}
  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [context.getHandler(), context.getClass()]);
    if (isPublic) return true;
    const user = context.switchToHttp().getRequest().user;
    const allowPw = this.reflector.getAllAndOverride<boolean>(ALLOW_PW_CHANGE, [context.getHandler(), context.getClass()]);
    // A temporary password (issued by reception/admin) must be changed before anything else works.
    if (user?.mustChangePassword && !allowPw) throw new ForbiddenException('PASSWORD_CHANGE_REQUIRED');
    const roles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [context.getHandler(), context.getClass()]);
    if (!roles || roles.length === 0) return true;
    if (!user || !roles.includes(user.role)) throw new ForbiddenException('INSUFFICIENT_ROLE');
    return true;
  }
}
