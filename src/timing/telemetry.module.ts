import { Module } from '@nestjs/common';
import { TelemetryStore } from './telemetry.store';

/** 주문(예상 수령 계산)과 타이밍 엔진이 함께 쓰는 최신 ETA 저장소 */
@Module({
  providers: [TelemetryStore],
  exports: [TelemetryStore],
})
export class TelemetryModule {}
