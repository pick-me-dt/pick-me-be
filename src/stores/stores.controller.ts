import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { RequireRole } from '../auth/auth.decorators';
import { SearchStoresDto } from './stores.dto';
import { StoresService } from './stores.service';

@Controller('stores')
@RequireRole('driver')
export class StoresController {
  constructor(private readonly stores: StoresService) {}

  @Post('search')
  @HttpCode(200)
  async search(@Body() dto: SearchStoresDto) {
    const candidates = await this.stores.search(dto);
    return candidates.map(({ store, distanceM }) => ({
      id: store.id,
      name: store.name,
      lat: store.lat,
      lng: store.lng,
      distanceM,
    }));
  }

  @Get(':id/menu')
  menu(@Param('id', ParseUUIDPipe) id: string) {
    return this.stores.menu(id);
  }
}
