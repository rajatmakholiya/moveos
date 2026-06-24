import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard, Roles, RolesGuard, PrismaService } from '@common/index';
import { BookingServiceClient } from '../clients/booking-service.client';
import { CreateBookingGatewayDto } from '../dto/bookings.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('PASSENGER')
@Controller('passenger')
export class PassengerController {
  constructor(
    private readonly bookingClient: BookingServiceClient,
    private readonly prisma: PrismaService,
  ) {}

  @Get('me')
  getProfile(@Req() req: any) {
    const userId: string = req.user?.sub;
    return this.prisma.passenger.findUnique({
      where: { userId },
      include: { user: true },
    });
  }

  @Get('bookings')
  getBookings(@Req() req: any) {
    const passengerId: string = req.user?.passengerId ?? req.user?.sub;
    return this.bookingClient.getPassengerBookings(passengerId);
  }

  @Post('bookings')
  createBooking(@Req() req: any, @Body() dto: CreateBookingGatewayDto) {
    const passengerId: string = req.user?.passengerId ?? req.user?.sub;
    return this.bookingClient.createBooking({ ...dto, passengerId });
  }
}
