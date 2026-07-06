import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard, PrismaService, Roles, RolesGuard } from '@common/index';
import { BookingStatus } from '@prisma/client';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

class SubmitRatingDto {
  @IsInt()
  @Min(1)
  @Max(5)
  stars!: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  comment?: string;
}

/**
 * Post-trip driver ratings. One rating per booking; the driver's aggregate
 * rating is recomputed on every submission.
 */
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class RatingsController {
  constructor(private readonly prisma: PrismaService) {}

  @Roles('PASSENGER')
  @Post('bookings/:bookingId/rating')
  async submitRating(@Req() req: any, @Param('bookingId') bookingId: string, @Body() body: SubmitRatingDto) {
    const passengerId = req.user?.passengerId ?? req.user?.sub;
    const booking = await this.prisma.seatBooking.findUnique({
      where: { id: bookingId },
      include: { trip: { select: { driverId: true } }, rating: true },
    });
    if (!booking) throw new NotFoundException('Booking not found');
    if (booking.passengerId !== passengerId) {
      throw new ForbiddenException('You can only rate your own bookings');
    }
    if (booking.status !== BookingStatus.COMPLETED) {
      throw new BadRequestException({
        message: 'You can rate the driver after the trip is completed',
        error_code: 'trip_not_completed',
      });
    }
    if (booking.rating) {
      throw new BadRequestException({
        message: 'You have already rated this trip',
        error_code: 'already_rated',
      });
    }

    const driverId = booking.trip.driverId;
    const rating = await this.prisma.driverRating.create({
      data: {
        bookingId,
        driverId,
        passengerId,
        stars: body.stars,
        comment: body.comment ?? null,
      },
    });

    // Recompute the driver's aggregate rating
    const aggregate = await this.prisma.driverRating.aggregate({
      where: { driverId },
      _avg: { stars: true },
      _count: { _all: true },
    });
    const average = Number((aggregate._avg.stars ?? body.stars).toFixed(2));
    await this.prisma.driver.update({ where: { id: driverId }, data: { rating: average } });

    return {
      status: 'ok',
      data: {
        ratingId: rating.id,
        stars: rating.stars,
        driverAverage: average,
        driverRatingCount: aggregate._count._all,
      },
    };
  }

  // Passenger checks whether a booking is already rated (drives the UI state)
  @Roles('PASSENGER')
  @Get('bookings/:bookingId/rating')
  async getRating(@Req() req: any, @Param('bookingId') bookingId: string) {
    const passengerId = req.user?.passengerId ?? req.user?.sub;
    const rating = await this.prisma.driverRating.findUnique({ where: { bookingId } });
    if (rating && rating.passengerId !== passengerId) {
      throw new ForbiddenException('Not your booking');
    }
    return { status: 'ok', data: { rating: rating ? { stars: rating.stars, comment: rating.comment } : null } };
  }
}
