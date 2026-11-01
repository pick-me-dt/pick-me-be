import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequireRole } from '../auth/auth.decorators';
import { QueueService } from '../queue/queue.service';
import { SearchStoresDto } from './stores.dto';
import { MenuResponse, StoreCandidateResponse } from './stores.response.dto';
import { StoresService } from './stores.service';

@ApiTags('stores')
@ApiBearerAuth('driver')
@Controller('stores')
@RequireRole('driver')
export class StoresController {
  constructor(
    private readonly stores: StoresService,
    private readonly queue: QueueService,
  ) {}

  @Post('search')
  @HttpCode(200)
  @ApiOperation({
    summary: '경로상 매장 후보',
    description: '반경 안의 매장을 가까운 순으로 돌려준다. headingDeg를 주면 진행 방향 ±60도, routePoints를 주면 경로 500m 이내만.',
  })
  @ApiOkResponse({ type: StoreCandidateResponse, isArray: true })
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
  @ApiOperation({ summary: '매장 메뉴' })
  @ApiOkResponse({ type: MenuResponse })
  menu(@Param('id', ParseUUIDPipe) id: string) {
    return this.stores.menu(id);
  }
}
