import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { RegisterDeviceDto, StaffLoginDto } from './auth.dto';
import { DriverTokenResponse, StaffTokenResponse } from './auth.response.dto';
import { AuthService } from './auth.service';

@ApiTags('auth')
@Controller()
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('auth/device')
  @HttpCode(200)
  @ApiOperation({ summary: '기기 등록', description: '처음이면 사용자와 차량을 만들고, 이미 등록된 기기면 차량번호만 갱신한다.' })
  @ApiOkResponse({ type: DriverTokenResponse })
  registerDevice(@Body() dto: RegisterDeviceDto) {
    return this.auth.registerDevice(dto);
  }

  @Post('store-auth/login')
  @HttpCode(200)
  @ApiOperation({ summary: '매장 직원 로그인' })
  @ApiOkResponse({ type: StaffTokenResponse })
  @ApiUnauthorizedResponse({ description: '아이디 또는 비밀번호가 틀림' })
  staffLogin(@Body() dto: StaffLoginDto) {
    return this.auth.staffLogin(dto);
  }
}
