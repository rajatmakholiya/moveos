import { IsString, IsOptional, IsEnum, Matches } from 'class-validator';
import { SeatType } from '@prisma/client';

export class AvailableTripsQueryDto {
  @IsString()
  routeId!: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'date must be YYYY-MM-DD' })
  date!: string;

  @IsOptional()
  @IsEnum(SeatType)
  seatType?: SeatType;
}
