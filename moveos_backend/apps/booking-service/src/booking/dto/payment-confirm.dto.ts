import { IsString } from 'class-validator';

export class PaymentConfirmDto {
  @IsString()
  razorpayPaymentId!: string;

  @IsString()
  razorpaySignature!: string;
}
