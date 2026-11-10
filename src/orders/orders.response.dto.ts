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

export class PickupTimingResponse {
  /** 입구까지 남은 시간(초). 차로에 들어왔으면 0, ETA가 없으면 null */
  etaSec: number | null;
  /** 마지막 ETA 수신 시각 */
  etaUpdatedAt: Date | null;
  /** ETA가 90초 넘게 끊김. 추천은 마지막 ETA 기준으로 보류 */
  etaStale: boolean;
  /** 입구 도착 예정 */
  entranceArrivalAt: Date | null;
  /** 예상 수령 = 입구 도착 예정 + 입구 이후 시간 */
  expectedPickupAt: Date | null;
  /** 시작 추천 = 예상 수령 - 준비 시간 */
  recommendedStartAt: Date | null;
  /** 매장 준비 시간(초) */
  prepSec: number;
  /** 매장 입구 이후 시간(초) */
  afterEntrySec: number;
  /** 제조 시작 후, 그때 예상한 수령 시각보다 늦어진 시간(초) */
  delaySec: number;
}

export class CancelRequestResponse {
  requestedAt: Date;
  note: string | null;
  /** 매장이 취소를 거절하면 돌아갈 상태 */
  @ApiProperty({ enum: OrderStatus, enumName: 'OrderStatus', nullable: true })
  statusBefore: OrderStatus | null;
}

export class OrderResponse {
  id: string;
  /** 매장·운전자가 함께 보는 주문번호. 예: P-021 */
  orderNo: string | null;
  @ApiProperty({ enum: OrderStatus, enumName: 'OrderStatus' })
  status: OrderStatus;
  @ApiProperty({ enum: OrderSource, enumName: 'OrderSource' })
  source: OrderSource;
  store: OrderStoreSummary;
  items: OrderItemResponse[];
  /** 총액(원) */
  totalAmount: number;
  /** 직원 검색 보조용 차량번호 */
  plateNumber: string;
  externalOrderId: string | null;
  timing: PickupTimingResponse;
  /** 매장 확인 중으로 2분이 지남. 차량 앱은 상태를 다시 조회해 안내한다 */
  acceptOverdue: boolean;
  createdAt: Date;
  /** 매장에 공유한 시각 */
  sentAt: Date | null;
  acceptedAt: Date | null;
  rejectedAt: Date | null;
  /** SOLD_OUT · BUSY · CLOSED · OTHER */
  rejectReason: string | null;
  /** 제조 시작 시각 */
  preparingAt: Date | null;
  readyAt: Date | null;
  pickedUpAt: Date | null;
  laneEnteredAt: Date | null;
  cancelRequest: CancelRequestResponse | null;
  cancelledAt: Date | null;
  /** USER · NO_SHOW · STORE · PAYMENT_DECLINED · STORE_UNAVAILABLE */
  cancelReason: string | null;
  cancelNote: string | null;
}

export class QuoteItemResponse extends OrderItemResponse {
  /** 이 매장에서 품절 */
  soldOut: boolean;
}

export class QuoteResponse {
  storeId: string;
  storeName: string;
  items: QuoteItemResponse[];
  totalAmount: number;
  /** 품절 메뉴가 없으면 true */
  available: boolean;
  prepSec: number;
  afterEntrySec: number;
  /** 확인 문구. 예: "아이스 아메리카노 한 잔, 4,500원을 픽미 양재 DT점에 예약할까요?" */
  tts: string;
}

export class ReserveResponse {
  order: OrderResponse;
  /** 예약 결과 안내 문구. 같은 Idempotency-Key로 다시 보내면 없음 */
  tts?: string;
}

export class ReserveConflictResponse {
  /** ACTIVE_ORDER_EXISTS · SOLD_OUT · PRICE_CHANGED */
  code: string;
  message: string;
  /** SOLD_OUT · PRICE_CHANGED일 때 새 조건 */
  quote?: QuoteResponse;
}
