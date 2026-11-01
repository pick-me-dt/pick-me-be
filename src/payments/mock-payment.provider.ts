import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PaymentDeclinedError, PaymentProvider } from './payment-provider';

/** 승인 한도를 넘는 금액만 거절하는 목업 결제 */
@Injectable()
export class MockPaymentProvider implements PaymentProvider {
  static readonly APPROVAL_LIMIT = 300_000;

  async authorize(amount: number) {
    if (amount > MockPaymentProvider.APPROVAL_LIMIT) throw new PaymentDeclinedError('승인 한도 초과');
    return { providerRef: `mockpay_${randomUUID()}` };
  }

  async capture() {}

  async void() {}
}
