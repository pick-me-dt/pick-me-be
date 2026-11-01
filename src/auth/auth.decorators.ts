import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import { DriverPrincipal, Role, StaffPrincipal } from './auth.types';

export const ROLE_KEY = 'auth:role';

/** 해당 역할의 토큰이 있어야 호출할 수 있다. */
export const RequireRole = (role: Role) => SetMetadata(ROLE_KEY, role);

export const CurrentDriver = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): DriverPrincipal => ctx.switchToHttp().getRequest().principal,
);

export const CurrentStaff = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): StaffPrincipal => ctx.switchToHttp().getRequest().principal,
);
