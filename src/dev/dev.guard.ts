import { CanActivate, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/** ENABLE_DEV_ROUTES=true일 때만 /v1/dev/*를 연다. 꺼져 있으면 없는 경로처럼 404 */
@Injectable()
export class DevRoutesGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(): boolean {
    if (this.config.get('ENABLE_DEV_ROUTES') !== 'true') throw new NotFoundException();
    return true;
  }
}
