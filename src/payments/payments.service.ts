import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PAYMENT_PROVIDER, PaymentProvider } from './payment-provider';

/** 주문 1건당 결제 1건. 전송 시 승인, 수령 시 확정, 취소 시 승인 취소 */
@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
  ) {}

  async authorize(orderId: string, amount: number) {
    try {
      const { providerRef } = await this.provider.authorize(amount, orderId);
      return await this.prisma.payment.create({ data: { orderId, amount, providerRef, status: 'AUTHORIZED' } });
    } catch (e) {
      await this.prisma.payment.create({ data: { orderId, amount, status: 'FAILED' } });
      throw e;
    }
  }

  async capture(orderId: string) {
    const payment = await this.prisma.payment.findUnique({ where: { orderId } });
    if (!payment || payment.status !== 'AUTHORIZED' || !payment.providerRef) return;
    await this.provider.capture(payment.providerRef, payment.amount);
    await this.prisma.payment.update({ where: { orderId }, data: { status: 'CAPTURED' } });
  }

  /** 승인된 결제가 있으면 취소한다. 없으면 아무것도 하지 않는다. */
  async voidIfAuthorized(orderId: string) {
    const payment = await this.prisma.payment.findUnique({ where: { orderId } });
    if (!payment || payment.status !== 'AUTHORIZED' || !payment.providerRef) return;
    await this.provider.void(payment.providerRef);
    await this.prisma.payment.update({ where: { orderId }, data: { status: 'VOIDED' } });
  }
}
