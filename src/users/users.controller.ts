import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { CurrentDriver, RequireRole } from '../auth/auth.decorators';
import { DriverPrincipal } from '../auth/auth.types';
import { CreateFavoriteDto, UpdateSettingsDto } from './users.dto';
import { UsersService } from './users.service';

@Controller('me')
@RequireRole('driver')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  me(@CurrentDriver() driver: DriverPrincipal) {
    return this.users.me(driver.userId, driver.vehicleId);
  }

  @Patch('settings')
  updateSettings(@CurrentDriver() driver: DriverPrincipal, @Body() dto: UpdateSettingsDto) {
    return this.users.updateSettings(driver.userId, dto);
  }

  @Get('favorites')
  listFavorites(@CurrentDriver() driver: DriverPrincipal) {
    return this.users.listFavorites(driver.userId);
  }

  @Post('favorites')
  createFavorite(@CurrentDriver() driver: DriverPrincipal, @Body() dto: CreateFavoriteDto) {
    return this.users.createFavorite(driver.userId, dto);
  }

  @Delete('favorites/:id')
  @HttpCode(204)
  deleteFavorite(@CurrentDriver() driver: DriverPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.users.deleteFavorite(driver.userId, id);
  }
}
