import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { RequireRole } from '../auth/auth.decorators';
import { QueueService } from '../queue/queue.service';
import { SearchStoresDto } from './stores.dto';
import { StoresService } from './stores.service';

@Controller('stores')
@RequireRole('driver')
export class StoresController {
  constructor(
    private readonly stores: StoresService,
    private readonly queue: QueueService,
  ) {}

  @Post('search')
  @HttpCode(200)
  async search(@Body() dto: SearchStoresDto) {
    const candidates = await this.stores.search(dto);
    return Promise.all(
      candidates.map(async ({ store, distanceM }) => {
        const queue = await this.queue.forStore(store);
        return {
          id: store.id,
          name: store.name,
          lat: store.lat,
          lng: store.lng,
          distanceM,
          queueCars: queue.cars,
          queueWaitSec: queue.waitSec,
        };
      }),
    );
  }

  @Get(':id/menu')
  menu(@Param('id', ParseUUIDPipe) id: string) {
    return this.stores.menu(id);
  }
}
