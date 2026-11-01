/** 결제 연동 지점. 프로토타입은 목업, 실서비스는 카페이·PG 구현으로 교체한다. */
export interface PaymentProvider {
  /** 금액만큼 승인을 건다. 실패하면 PaymentDeclinedError */
  authorize(amount: number, orderId: string): Promise<{ providerRef: string }>;
  capture(providerRef: string, amount: number): Promise<void>;
  void(providerRef: string): Promise<void>;
}

export const PAYMENT_PROVIDER = Symbol('PAYMENT_PROVIDER');

export class PaymentDeclinedError extends Error {}
