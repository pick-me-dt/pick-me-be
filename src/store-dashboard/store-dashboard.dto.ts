import { IsBoolean, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class UpdateStoreOrderDto {
  @IsIn(['PREPARING', 'READY', 'PICKED_UP', 'CANCELLED'])
  status: 'PREPARING' | 'READY' | 'PICKED_UP' | 'CANCELLED';

  @IsOptional()
  @IsString()
  @MaxLength(200)
  reason?: string;
}

export class PickupDto {
  @IsString()
  @IsNotEmpty()
  plateNumber: string;
}

export class UpdateStoreSettingsDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1800)
  basePrepSec?: number;

  @IsOptional()
  @IsInt()
  @Min(10)
  @Max(600)
  serviceSecPerCar?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(600)
  marginSec?: number;

  @IsOptional()
  @IsBoolean()
  isOpen?: boolean;
}
