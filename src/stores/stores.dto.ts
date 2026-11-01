import { Type } from 'class-transformer';
import { ArrayMaxSize, IsInt, IsLatitude, IsLongitude, IsNumber, IsOptional, Max, Min, ValidateNested } from 'class-validator';

export class LatLngDto {
  @IsLatitude()
  lat: number;

  @IsLongitude()
  lng: number;
}

export class SearchStoresDto extends LatLngDto {
  /** 진행 방향(도). 주면 진행 방향 ±60도 안의 매장만 돌려준다. */
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(360)
  headingDeg?: number;

  @IsOptional()
  @IsInt()
  @Min(100)
  @Max(50_000)
  radiusM?: number;

  /** 내비 경로 좌표. 주면 경로에서 500m 안의 매장만 돌려준다. */
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => LatLngDto)
  @ArrayMaxSize(500)
  routePoints?: LatLngDto[];
}
