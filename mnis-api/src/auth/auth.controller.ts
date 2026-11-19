import { Body, Controller, Get, HttpCode, Post, Req, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { ChangePasswordDto, LoginDto, RefreshDto } from './dto/auth.dto';
import { AllowPasswordChange, CurrentUser, AuthUser, Public } from '../common/decorators';
import { env, isProd } from '../config/env';

const COOKIE = 'mnis_rt';

/**
 * Two client types share this API:
 *  - mobile (Flutter): default. Tokens travel in the JSON body; store them in flutter_secure_storage.
 *  - web (Next.js): send header `X-Client-Type: web`. The refresh token is set as an httpOnly cookie
 *    and never exposed to JavaScript. The custom header forces a CORS preflight, which (with the
 *    origin allowlist) blocks cross-site request forgery against /auth/refresh.
 */
@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService) {}

  private isWeb(req: Request) { return req.header('x-client-type') === 'web'; }
  private meta(req: Request) { return { ip: req.ip, userAgent: req.header('user-agent') }; }

  private setCookie(res: Response, token: string) {
    res.cookie(COOKIE, token, {
      httpOnly: true, secure: isProd, sameSite: isProd ? 'none' : 'lax',
      path: '/v1/auth', maxAge: env.REFRESH_TTL_DAYS * 86_400_000,
    });
  }

  @Public() @Throttle({ default: { limit: 60, ttl: 60_000 } }) @HttpCode(200) @Post('login')
  async login(@Body() dto: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const r = await this.auth.login(dto.identifier, dto.password, this.meta(req));
    // Set httpOnly cookie for legacy single-tab fallback, AND return refreshToken in body
    // so each browser tab can maintain its own isolated concurrent session in sessionStorage.
    if (this.isWeb(req)) { this.setCookie(res, r.refreshToken); }
    return r;
  }

  @Public() @Throttle({ default: { limit: 180, ttl: 60_000 } }) @HttpCode(200) @Post('refresh')
  async refresh(@Body() dto: RefreshDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const web = this.isWeb(req);
    const raw = dto.refreshToken || req.cookies?.[COOKIE];
    const r = await this.auth.refresh(raw, this.meta(req));
    if (web && !dto.refreshToken) { this.setCookie(res, r.refreshToken); }
    return r;
  }

  @Public() @HttpCode(204) @Post('logout')
  async logout(@Body() dto: RefreshDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const web = this.isWeb(req);
    await this.auth.logout(dto.refreshToken || req.cookies?.[COOKIE]);
    if (web && !dto.refreshToken) res.clearCookie(COOKIE, { path: '/v1/auth' });
  }

  @AllowPasswordChange() @Get('me')
  me(@CurrentUser() user: AuthUser) { return this.auth.me(user.id); }

  @Get('sessions')
  listSessions(@CurrentUser() user: AuthUser) { return this.auth.listSessions(user.id); }

  @HttpCode(200) @Post('sessions/revoke-all')
  revokeAllSessions(@CurrentUser() user: AuthUser) { return this.auth.revokeAllSessions(user.id); }

  @AllowPasswordChange() @Throttle({ default: { limit: 5, ttl: 60_000 } }) @HttpCode(200) @Post('change-password')
  changePassword(@CurrentUser() user: AuthUser, @Body() dto: ChangePasswordDto) {
    return this.auth.changePassword(user.id, dto.currentPassword, dto.newPassword);
  }
}
