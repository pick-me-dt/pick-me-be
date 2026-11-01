import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Principal } from './auth.types';

@Injectable()
export class TokenService {
  constructor(private readonly jwt: JwtService) {}

  sign(principal: Principal): string {
    return this.jwt.sign(principal);
  }

  /** 유효하지 않으면 null. HTTP 가드와 WebSocket 게이트웨이가 함께 쓴다. */
  verify(token: string | undefined): Principal | null {
    if (!token) return null;
    try {
      const { role, userId, vehicleId, staffId, storeId } = this.jwt.verify(token);
      if (role === 'driver') return { role, userId, vehicleId };
      if (role === 'staff') return { role, staffId, storeId };
      return null;
    } catch {
      return null;
    }
  }
}
