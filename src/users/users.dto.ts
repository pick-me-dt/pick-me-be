import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class UpdateSettingsDto {
  @IsOptional()
  @IsBoolean()
  voiceOrderEnabled?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  voiceLimitPerOrder?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  voiceLimitDaily?: number;
}

export class OrderLineDto {
  @IsUUID()
  menuItemId: string;

  @IsInt()
  @Min(1)
  @Max(20)
  qty: number;
}

export class CreateFavoriteDto {
  /** 음성 호출 이름. 예: "평소 그거" */
  @IsString()
  @IsNotEmpty()
  alias: string;

  @IsOptional()
  @IsUUID()
  storeId?: string;

  @ValidateNested({ each: true })
  @Type(() => OrderLineDto)
  @ArrayMinSize(1)
  items: OrderLineDto[];
}
