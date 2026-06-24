import { Module } from '@nestjs/common';
import { AppConfigModule } from '@common/index';
import { BookingModule } from './booking/booking.module';
import { HealthController } from './health.controller';

@Module({
  imports: [AppConfigModule, BookingModule],
  controllers: [HealthController],
})
export class AppModule {}
