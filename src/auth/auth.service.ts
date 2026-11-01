import { Injectable, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDeviceDto, StaffLoginDto } from './auth.dto';
import { TokenService } from './token.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
  ) {}

  /** 기기를 등록하고 운전자 토큰을 발급한다. 이미 등록된 기기면 차량번호만 갱신한다. */
  async registerDevice(dto: RegisterDeviceDto) {
    const existing = await this.prisma.vehicle.findUnique({ where: { deviceId: dto.deviceId } });
    const vehicle = existing
      ? await this.prisma.vehicle.update({
          where: { id: existing.id },
          data: { plateNumber: dto.plateNumber, model: dto.model ?? existing.model },
        })
      : await this.prisma.vehicle.create({
          data: {
            deviceId: dto.deviceId,
            plateNumber: dto.plateNumber,
            model: dto.model,
            user: { create: { name: dto.name ?? '픽미 사용자' } },
          },
        });

    const accessToken = this.tokens.sign({ role: 'driver', userId: vehicle.userId, vehicleId: vehicle.id });
    return { accessToken, userId: vehicle.userId, vehicleId: vehicle.id };
  }

  async staffLogin(dto: StaffLoginDto) {
    const staff = await this.prisma.storeStaff.findUnique({ where: { loginId: dto.loginId } });
    if (!staff || !(await bcrypt.compare(dto.password, staff.passwordHash))) {
      throw new UnauthorizedException('아이디 또는 비밀번호가 올바르지 않습니다');
    }
    const accessToken = this.tokens.sign({ role: 'staff', staffId: staff.id, storeId: staff.storeId });
    return { accessToken, storeId: staff.storeId };
  }
}
