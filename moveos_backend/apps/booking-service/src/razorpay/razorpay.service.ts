import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import Razorpay = require('razorpay');

@Injectable()
export class RazorpayService {
  private readonly client: Razorpay;
  private readonly keySecret: string;

  constructor(private readonly config: ConfigService) {
    this.client = new Razorpay({
      key_id: config.getOrThrow<string>('RAZORPAY_KEY_ID'),
      key_secret: config.getOrThrow<string>('RAZORPAY_KEY_SECRET'),
    });
    this.keySecret = config.getOrThrow<string>('RAZORPAY_KEY_SECRET');
  }

  createOrder(amountPaise: number, receipt: string) {
    return this.client.orders.create({
      amount: amountPaise,
      currency: 'INR',
      receipt,
    });
  }

  verifyPaymentSignature(orderId: string, paymentId: string, signature: string): void {
    const expected = crypto
      .createHmac('sha256', this.keySecret)
      .update(`${orderId}|${paymentId}`)
      .digest('hex');
    if (expected !== signature) {
      throw new UnauthorizedException('Invalid payment signature');
    }
  }

  logRefundIntent(paymentId: string, amountPaise: number, bookingId: string) {
    // Stub: log refund intent — wire to razorpay.payments.refund() when ready
    console.log(`[REFUND INTENT] bookingId=${bookingId} paymentId=${paymentId} amount=${amountPaise} paise`);
  }
}
