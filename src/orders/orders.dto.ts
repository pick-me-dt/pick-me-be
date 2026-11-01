import { ApiProperty } from '@nestjs/swagger';
import { OrderSource } from '@prisma/client';
import { Type } from 'class-transformer';
import { ArrayMinSize, IsEnum, IsOptional, IsString, IsUUID, MaxLength, ValidateIf, ValidateNested } from 'class-validator';
import { OrderLineDto } from '../users/users.dto';

export class OrderRequestDto {
  @IsUUID()
  storeId: string;

  /** 자주 주문 메뉴로 주문할 때. items와 둘 중 하나만 */
  @IsOptional()
  @IsUUID()
  favoriteId?: string;

  @ValidateIf((o: OrderRequestDto) => !o.favoriteId)
  @ValidateNested({ each: true })
  @Type(() => OrderLineDto)
  @ArrayMinSize(1)
  items?: OrderLineDto[];
}

export class ReserveOrderDto extends OrderRequestDto {
  /** VOICE: Gleo·STT 음성 주문, SCREEN: 정차 중 화면 주문 */
  @ApiProperty({ enum: OrderSource, enumName: 'OrderSource' })
  @IsEnum(OrderSource)
  source: OrderSource;
}

export class CancelOrderDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  reason?: string;
}

export class ChangeStoreDto {
  @IsUUID()
  storeId: string;
}
