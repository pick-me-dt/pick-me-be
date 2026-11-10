import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsNumber, IsOptional, IsUUID, Max, Min, ValidateNested } from 'class-validator';

export class JamDto {
  @IsInt()
  @Min(1)
  atEtaSec: number;

  @IsInt()
  @Min(1)
  @Max(3600)
  addSec: number;
}

export class TripOptionsDto {
  /** 출발 시점 매장 입구까지 남은 시간(초). 실제 시간으로 흐른다 */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(3600)
  startEtaSec?: number;

  /** ETA 전송 간격(초). NaviHelper처럼 기본 30초 */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(60)
  tickSec?: number;

  @IsOptional()
  @IsInt()
  @Min(10)
  @Max(120)
  cruiseKmh?: number;

  @IsOptional()
  @ValidateNested()
  @Type(() => JamDto)
  jam?: JamDto;

  /** 매장 직원 대신 수락·제조 시작(시작 추천 시각)·준비 완료를 자동으로 누른다 */
  @IsOptional()
  @IsBoolean()
  autoStore?: boolean;
}

export class SimulateTripDto extends TripOptionsDto {
  @IsUUID()
  orderId: string;
}

export class DemoRunDto extends TripOptionsDto {
  /** 시연 매장. 기본 양재 DT점 */
  @IsOptional()
  @IsUUID()
  storeId?: string;

  /** 시연 매장 준비 시간(초)을 이 값으로 바꾼다. 기본은 시드값 180 */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(3600)
  prepSec?: number;

  /** 시연 매장 입구 이후 시간(초)을 이 값으로 바꾼다. 기본은 시드값 120 */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(3600)
  afterEntrySec?: number;
}

export class RelocateStoresDto {
  /** 이 좌표 북쪽으로 0.8km · 2.5km · 5km 지점에 시드 매장 3곳을 옮긴다 */
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat: number;

  @IsNumber()
  @Min(-180)
  @Max(180)
  lng: number;
}

export class SetQueueDto {
  @IsInt()
  @Min(0)
  @Max(50)
  cars: number;
}
