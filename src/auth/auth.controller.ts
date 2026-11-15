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

  @Public() @Throttle({ default: { limit: 5, ttl: 60_000 } }) @HttpCode(200) @Post('login')
  async login(@Body() dto: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const r = await this.auth.login(dto.identifier, dto.password, this.meta(req));
    if (this.isWeb(req)) { this.setCookie(res, r.refreshToken); const { refreshToken, ...rest } = r; return rest; }
    return r;
  }

  @Public() @Throttle({ default: { limit: 20, ttl: 60_000 } }) @HttpCode(200) @Post('refresh')
  async refresh(@Body() dto: RefreshDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const web = this.isWeb(req);
    const raw = web ? req.cookies?.[COOKIE] : dto.refreshToken;
    const r = await this.auth.refresh(raw, this.meta(req));
    if (web) { this.setCookie(res, r.refreshToken); const { refreshToken, ...rest } = r; return rest; }
    return r;
  }

  @Public() @HttpCode(204) @Post('logout')
  async logout(@Body() dto: RefreshDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const web = this.isWeb(req);
    await this.auth.logout(web ? req.cookies?.[COOKIE] : dto.refreshToken);
    if (web) res.clearCookie(COOKIE, { path: '/v1/auth' });
  }

  @AllowPasswordChange() @Get('me')
  me(@CurrentUser() user: AuthUser) { return this.auth.me(user.id); }

  @AllowPasswordChange() @Throttle({ default: { limit: 5, ttl: 60_000 } }) @HttpCode(200) @Post('change-password')
  changePassword(@CurrentUser() user: AuthUser, @Body() dto: ChangePasswordDto) {
    return this.auth.changePassword(user.id, dto.currentPassword, dto.newPassword);
  }
}
