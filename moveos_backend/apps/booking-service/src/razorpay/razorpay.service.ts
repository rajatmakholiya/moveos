import { BadRequestException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import Razorpay = require('razorpay');

export interface RefundResult {
  refundId: string;
  amountPaise: number;
  status: string;
}

@Injectable()
export class RazorpayService {
  private readonly logger = new Logger(RazorpayService.name);
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

  /**
   * Issue a (full or partial) refund against a captured payment.
   * `receipt` doubles as Razorpay's idempotency-friendly reference.
   */
  async refundPayment(paymentId: string, amountPaise: number, bookingId: string): Promise<RefundResult> {
    if (!paymentId) {
      throw new BadRequestException('Cannot refund: no payment id recorded on this booking');
    }
    try {
      const refund = await this.client.payments.refund(paymentId, {
        amount: amountPaise,
        speed: 'normal',
        notes: { bookingId },
        receipt: `refund_${bookingId}`,
      });
      this.logger.log(`Refunded ${amountPaise} paise for booking ${bookingId} (refund ${refund.id})`);
      return { refundId: refund.id, amountPaise: Number(refund.amount), status: String(refund.status) };
    } catch (err) {
      const description =
        (err as { error?: { description?: string } })?.error?.description ?? (err as Error).message ?? 'refund_failed';
      this.logger.error(`Refund failed for booking ${bookingId} (payment ${paymentId}): ${description}`);
      throw new BadRequestException({
        message: `Refund could not be processed: ${description}`,
        error_code: 'refund_failed',
      });
    }
  }
}
