import { ApiProperty } from '@nestjs/swagger';
import { OrderSource } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
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
  /** SCREEN: 주차 중 화면에서 '이 메뉴로 예약'. VOICE는 후속 범위 */
  @ApiProperty({ enum: OrderSource, enumName: 'OrderSource', required: false, default: 'SCREEN' })
  @IsOptional()
  @IsEnum(OrderSource)
  source?: OrderSource;

  /** 견적에서 사용자가 확인한 총액(원). 다르면 409 PRICE_CHANGED로 새 조건을 돌려준다 */
  @IsOptional()
  @IsInt()
  @Min(0)
  expectedTotal?: number;
}

export class CancelOrderDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  reason?: string;
}

export const REJECT_REASONS = ['SOLD_OUT', 'BUSY', 'CLOSED', 'OTHER'] as const;
export type RejectReason = (typeof REJECT_REASONS)[number];

export const STORE_CANCEL_REASONS = ['NO_SHOW', 'STORE'] as const;
export type StoreCancelReason = (typeof STORE_CANCEL_REASONS)[number];

export class RejectOrderDto {
  /** SOLD_OUT 품절 · BUSY 주문 폭주 · CLOSED 영업 종료 · OTHER 기타 */
  @ApiProperty({ enum: REJECT_REASONS })
  @IsIn(REJECT_REASONS)
  reason: RejectReason;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string;
}

export class StoreCancelDto {
  /** NO_SHOW 미수령 · STORE 매장 사정 */
  @ApiProperty({ enum: STORE_CANCEL_REASONS })
  @IsIn(STORE_CANCEL_REASONS)
  reason: StoreCancelReason;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string;
}

export class CancelDecisionDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string;
}
