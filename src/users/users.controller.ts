import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentDriver, RequireRole } from '../auth/auth.decorators';
import { DriverPrincipal } from '../auth/auth.types';
import { CreateFavoriteDto, UpdateSettingsDto } from './users.dto';
import { FavoriteResponse, MeResponse, VoiceSettingsResponse } from './users.response.dto';
import { UsersService } from './users.service';

@ApiTags('me')
@ApiBearerAuth('driver')
@Controller('me')
@RequireRole('driver')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @ApiOperation({ summary: '내 정보·차량·음성 결제 설정' })
  @ApiOkResponse({ type: MeResponse })
  me(@CurrentDriver() driver: DriverPrincipal) {
    return this.users.me(driver.userId, driver.vehicleId);
  }

  @Patch('settings')
  @ApiOperation({ summary: '음성 결제 설정 변경', description: '가족 동승 시 음성 결제를 끄거나 1회·1일 한도를 바꾼다.' })
  @ApiOkResponse({ type: VoiceSettingsResponse })
  updateSettings(@CurrentDriver() driver: DriverPrincipal, @Body() dto: UpdateSettingsDto) {
    return this.users.updateSettings(driver.userId, dto);
  }

  @Get('favorites')
  @ApiOperation({ summary: '자주 주문 메뉴 목록' })
  @ApiOkResponse({ type: FavoriteResponse, isArray: true })
  listFavorites(@CurrentDriver() driver: DriverPrincipal) {
    return this.users.listFavorites(driver.userId);
  }

  @Post('favorites')
  @ApiOperation({ summary: '자주 주문 메뉴 등록', description: '음성으로 바로 주문할 수 있는 메뉴는 여기 등록한 것뿐이다.' })
  @ApiCreatedResponse({ type: FavoriteResponse })
  createFavorite(@CurrentDriver() driver: DriverPrincipal, @Body() dto: CreateFavoriteDto) {
    return this.users.createFavorite(driver.userId, dto);
  }

  @Delete('favorites/:id')
  @HttpCode(204)
  @ApiOperation({ summary: '자주 주문 메뉴 삭제' })
  @ApiNoContentResponse()
  deleteFavorite(@CurrentDriver() driver: DriverPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.users.deleteFavorite(driver.userId, id);
  }
}
