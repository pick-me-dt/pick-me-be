import { Type } from 'class-transformer';
import { IsDate, IsInt, IsLatitude, IsLongitude, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

export class TelemetryDto {
  /** NaviHelper가 준 매장까지 남은 시간(초). 없으면 서버가 위치·속도로 추정한다 */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(6 * 60 * 60)
  etaSec?: number;

  @IsLatitude()
  lat: number;

  @IsLongitude()
  lng: number;

  @IsNumber()
  @Min(0)
  @Max(300)
  speedKmh: number;

  /** Vehicle SDK 기어 상태 (P, R, N, D) */
  @IsOptional()
  @IsString()
  gear?: string;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  recordedAt?: Date;
}
