import { ApiProperty } from '@nestjs/swagger';
import { OrderSource, OrderStatus } from '@prisma/client';

export class OrderStoreSummary {
  id: string;
  name: string;
  lat: number;
  lng: number;
}

export class OrderItemResponse {
  menuItemId: string;
  name: string;
  /** 단가(원) */
  unitPrice: number;
  qty: number;
}

export class OrderResponse {
  id: string;
  @ApiProperty({ enum: OrderStatus, enumName: 'OrderStatus' })
  status: OrderStatus;
  @ApiProperty({ enum: OrderSource, enumName: 'OrderSource' })
  source: OrderSource;
  store: OrderStoreSummary;
  items: OrderItemResponse[];
  /** 총액(원) */
  totalAmount: number;
  /** 창구 매칭에 쓰는 차량번호 */
  plateNumber: string;
  /** 예상 제조 시간(초) */
  estPrepSec: number;
  /** 매장 쪽 주문 번호. 전송 후에 생긴다 */
  externalOrderId: string | null;
  createdAt: Date;
  sentAt: Date | null;
  laneEnteredAt: Date | null;
  readyAt: Date | null;
  pickedUpAt: Date | null;
  cancelledAt: Date | null;
  /** USER · EXPIRED · NO_SHOW · STORE_REJECTED · PAYMENT_DECLINED · STORE */
  cancelReason: string | null;
}

export class QuoteResponse {
  storeId: string;
  storeName: string;
  items: OrderItemResponse[];
  totalAmount: number;
  estPrepSec: number;
  /** 금액 재확인 문구. 예: "아메리카노 한 잔, 4,500원 주문할까요?" */
  tts: string;
}

export class ReserveResponse {
  order: OrderResponse;
  /** 정차 후 확인이 필요한 이유. 비어 있으면 바로 예약됨 */
  @ApiProperty({
    enum: ['VOICE_DISABLED', 'NOT_FAVORITE', 'OVER_PER_ORDER_LIMIT', 'OVER_DAILY_LIMIT'],
    isArray: true,
  })
  confirmationReasons: string[];
  /** 예약 결과 안내 문구. 같은 Idempotency-Key로 다시 보내면 없음 */
  tts?: string;
}

export class ChangeStoreResponse {
  order: OrderResponse;
  tts: string;
}
