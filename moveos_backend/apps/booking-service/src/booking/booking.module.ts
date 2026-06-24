import { Module } from '@nestjs/common';
import { PrismaModule, RedisModule } from '@common/index';
import { RazorpayModule } from '../razorpay/razorpay.module';
import { BookingController } from './booking.controller';
import { BookingService } from './booking.service';
import { InvoiceGeneratorService } from './invoice-generator.service';
import { GeofenceListenerService } from './geofence-listener.service';
import { TripEventsListenerService } from './trip-events-listener.service';
import { TripSweepService } from './trip-sweep.service';

@Module({
  imports: [PrismaModule, RedisModule, RazorpayModule],
  controllers: [BookingController],
  providers: [
    BookingService,
    InvoiceGeneratorService,
    GeofenceListenerService,
    TripEventsListenerService,
    TripSweepService,
  ],
  exports: [InvoiceGeneratorService],
})
export class BookingModule {}
