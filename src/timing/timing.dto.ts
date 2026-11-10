import { IsInt, IsLatitude, IsLongitude, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

export class TelemetryDto {
  /** NaviHelper가 준 매장 입구까지 남은 시간(초). 30초마다 보낸다 */
  @IsInt()
  @Min(0)
  @Max(6 * 60 * 60)
  etaSec: number;

  /** 선택. 기록용 */
  @IsOptional()
  @IsLatitude()
  lat?: number;

  /** 선택. 기록용 */
  @IsOptional()
  @IsLongitude()
  lng?: number;

  /** 선택. 기록용 */
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(300)
  speedKmh?: number;

  /** 선택. Vehicle SDK 기어 상태 (P, R, N, D) */
  @IsOptional()
  @IsString()
  gear?: string;
}
