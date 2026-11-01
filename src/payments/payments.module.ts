import { Module } from '@nestjs/common';
import { MockPaymentProvider } from './mock-payment.provider';
import { PAYMENT_PROVIDER } from './payment-provider';
import { PaymentsService } from './payments.service';

@Module({
  providers: [PaymentsService, { provide: PAYMENT_PROVIDER, useClass: MockPaymentProvider }],
  exports: [PaymentsService],
})
export class PaymentsModule {}
