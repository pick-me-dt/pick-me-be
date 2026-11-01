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
  /** 출발 시점 매장까지 남은 시간(초) */
  @IsOptional()
  @IsInt()
  @Min(10)
  @Max(3600)
  startEtaSec?: number;

  /** 배속. 10이면 실제 1초에 시뮬레이션 10초가 흐른다 */
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(600)
  speedup?: number;

  /** 시뮬레이션 기준 텔레메트리 간격(초) */
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

  /** 매장 직원 대신 제조 시작·준비 완료를 자동으로 누른다 */
  @IsOptional()
  @IsBoolean()
  autoStore?: boolean;
}

export class SimulateTripDto extends TripOptionsDto {
  @IsUUID()
  orderId: string;
}

export class DemoRunDto extends TripOptionsDto {
  @IsOptional()
  @IsUUID()
  storeId?: string;

  /** 시연 매장의 DT 대기 차량 수. 대기가 길면 전송이 차로 진입 직전까지 늦춰진다 */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(50)
  queueCars?: number;
}

export class SetQueueDto {
  @IsInt()
  @Min(0)
  @Max(50)
  cars: number;
}
