import { IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString, Max, Min } from 'class-validator';

export class PickupDto {
  @IsString()
  @IsNotEmpty()
  plateNumber: string;
}

export class UpdateStoreSettingsDto {
  /** 준비 시간(초). 시작 추천 = 예상 수령 - 준비 시간 */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(3600)
  prepSec?: number;

  /** 입구 이후 시간(초). 예상 수령 = 입구 도착 예정 + 입구 이후 시간 */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(3600)
  afterEntrySec?: number;

  @IsOptional()
  @IsInt()
  @Min(10)
  @Max(600)
  serviceSecPerCar?: number;

  @IsOptional()
  @IsBoolean()
  isOpen?: boolean;
}

export class UpdateMenuAvailabilityDto {
  @IsBoolean()
  soldOut: boolean;
}
