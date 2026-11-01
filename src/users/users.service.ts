import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateFavoriteDto, UpdateSettingsDto } from './users.dto';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async me(userId: string, vehicleId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const vehicle = await this.prisma.vehicle.findUniqueOrThrow({ where: { id: vehicleId } });
    return {
      id: user.id,
      name: user.name,
      vehicle: { id: vehicle.id, plateNumber: vehicle.plateNumber, model: vehicle.model },
      settings: {
        voiceOrderEnabled: user.voiceOrderEnabled,
        voiceLimitPerOrder: user.voiceLimitPerOrder,
        voiceLimitDaily: user.voiceLimitDaily,
      },
    };
  }

  async updateSettings(userId: string, dto: UpdateSettingsDto) {
    const user = await this.prisma.user.update({ where: { id: userId }, data: dto });
    return {
      voiceOrderEnabled: user.voiceOrderEnabled,
      voiceLimitPerOrder: user.voiceLimitPerOrder,
      voiceLimitDaily: user.voiceLimitDaily,
    };
  }

  listFavorites(userId: string) {
    return this.prisma.favorite.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } });
  }

  async createFavorite(userId: string, dto: CreateFavoriteDto) {
    const ids = dto.items.map((i) => i.menuItemId);
    const found = await this.prisma.menuItem.count({ where: { id: { in: ids } } });
    if (found !== new Set(ids).size) throw new BadRequestException('존재하지 않는 메뉴가 있습니다');

    return this.prisma.favorite.create({
      data: {
        userId,
        alias: dto.alias,
        storeId: dto.storeId,
        items: dto.items.map((i) => ({ menuItemId: i.menuItemId, qty: i.qty })),
      },
    });
  }

  async deleteFavorite(userId: string, favoriteId: string) {
    const { count } = await this.prisma.favorite.deleteMany({ where: { id: favoriteId, userId } });
    if (count === 0) throw new NotFoundException();
  }
}
