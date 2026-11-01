import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLE_KEY } from './auth.decorators';
import { Role } from './auth.types';
import { TokenService } from './token.service';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokenService,
  ) {}

  canActivate(ctx: ExecutionContext): boolean {
    const role = this.reflector.getAllAndOverride<Role | undefined>(ROLE_KEY, [ctx.getHandler(), ctx.getClass()]);
    if (!role) return true;

    const req = ctx.switchToHttp().getRequest();
    const header: string | undefined = req.headers.authorization;
    const principal = this.tokens.verify(header?.startsWith('Bearer ') ? header.slice(7) : undefined);
    if (!principal) throw new UnauthorizedException();
    if (principal.role !== role) throw new ForbiddenException();
    req.principal = principal;
    return true;
  }
}
