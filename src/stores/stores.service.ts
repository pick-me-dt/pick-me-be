import { Injectable, NotFoundException } from '@nestjs/common';
import { Store } from '@prisma/client';
import { angleDiffDeg, bearingDeg, haversineM, LatLng } from '../common/geo';
import { PrismaService } from '../prisma/prisma.service';
import { SearchStoresDto } from './stores.dto';

const DEFAULT_RADIUS_M = 5_000;
const HEADING_TOLERANCE_DEG = 60;
const ROUTE_CORRIDOR_M = 500;

export interface StoreCandidate {
  store: Store;
  distanceM: number;
}

@Injectable()
export class StoresService {
  constructor(private readonly prisma: PrismaService) {}

  /** 경로상 매장 후보. 가까운 순. */
  async search(dto: SearchStoresDto): Promise<StoreCandidate[]> {
    const origin: LatLng = { lat: dto.lat, lng: dto.lng };
    const radiusM = dto.radiusM ?? DEFAULT_RADIUS_M;
    const stores = await this.prisma.store.findMany({ where: { isOpen: true } });

    return stores
      .map((store) => ({ store, distanceM: Math.round(haversineM(origin, store)) }))
      .filter(({ store, distanceM }) => {
        if (distanceM > radiusM) return false;
        if (dto.routePoints?.length) {
          return dto.routePoints.some((p) => haversineM(p, store) <= ROUTE_CORRIDOR_M);
        }
        if (dto.headingDeg !== undefined && distanceM > ROUTE_CORRIDOR_M) {
          return angleDiffDeg(dto.headingDeg, bearingDeg(origin, store)) <= HEADING_TOLERANCE_DEG;
        }
        return true;
      })
      .sort((a, b) => a.distanceM - b.distanceM);
  }

  async menu(storeId: string) {
    const store = await this.prisma.store.findUnique({
      where: { id: storeId },
      include: { brand: { include: { menuItems: { orderBy: { name: 'asc' } } } } },
    });
    if (!store) throw new NotFoundException('매장을 찾을 수 없습니다');
    return {
      storeId: store.id,
      storeName: store.name,
      items: store.brand.menuItems.map(({ id, name, price, prepSec, options }) => ({ id, name, price, prepSec, options })),
    };
  }
}
