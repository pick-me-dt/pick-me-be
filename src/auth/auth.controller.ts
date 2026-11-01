import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { RegisterDeviceDto, StaffLoginDto } from './auth.dto';
import { AuthService } from './auth.service';

@Controller()
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('auth/device')
  @HttpCode(200)
  registerDevice(@Body() dto: RegisterDeviceDto) {
    return this.auth.registerDevice(dto);
  }

  @Post('store-auth/login')
  @HttpCode(200)
  staffLogin(@Body() dto: StaffLoginDto) {
    return this.auth.staffLogin(dto);
  }
}
