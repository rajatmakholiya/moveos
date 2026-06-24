import { IsString, IsEnum, IsOptional, IsPhoneNumber, IsObject } from 'class-validator';
import { SeatType, LuggageSize, PaymentMethod } from '@prisma/client';

export class CreateBookingDto {
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

  @IsOptional()
  @IsString()
  passengerId?: string;

  @IsOptional()
  @IsString()
  agentId?: string;
}
