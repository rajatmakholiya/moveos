import { IsString, IsEnum, IsOptional, IsPhoneNumber, IsObject, Length } from 'class-validator';

// Enums are re-declared here so the gateway DTO has no Prisma dependency.
enum SeatType {
  FRONT = 'FRONT',
  BACK = 'BACK',
}

enum LuggageSize {
  SMALL = 'SMALL',
  LARGE = 'LARGE',
  OVERSIZED = 'OVERSIZED',
}

enum PaymentMethod {
  CASH = 'CASH',
  CARD = 'CARD',
  WALLET = 'WALLET',
  UPI = 'UPI',
}

export class CreateBookingGatewayDto {
  @IsString()
  tripId!: string;

  @IsString()
  passengerName!: string;

  @IsPhoneNumber()
  passengerPhone!: string;

  @IsEnum(SeatType)
  seatType!: SeatType;

  @IsEnum(LuggageSize)
  luggageSize!: LuggageSize;

  @IsEnum(PaymentMethod)
  paymentMethod!: PaymentMethod;

  @IsOptional()
  @IsString()
  emergencyContact?: string;

  @IsOptional()
  @IsString()
  gstin?: string;

  @IsOptional()
  @IsObject()
  pickup?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  dropoff?: Record<string, unknown>;
}

export class PaymentConfirmGatewayDto {
  @IsString()
  razorpayPaymentId!: string;

  @IsString()
  razorpaySignature!: string;
}

export class CancelBookingGatewayDto {
  @IsOptional()
  @IsString()
  reason?: string;
}

export class VerifyPickupOtpGatewayDto {
  @IsString()
  @Length(6, 6)
  otp!: string;
}
