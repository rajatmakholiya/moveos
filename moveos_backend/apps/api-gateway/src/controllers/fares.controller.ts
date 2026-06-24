import { Controller, Get } from '@nestjs/common';

// These values must stay in sync with LUGGAGE_SURCHARGE in booking.service.ts.
// The fare-config contract test enforces that invariant.
export const LUGGAGE_SURCHARGE_PAISE = {
  SMALL: 0,
  LARGE: 5000,
  OVERSIZED: 15000,
} as const;

@Controller('fares')
export class FaresController {
  @Get('config')
  getConfig() {
    return {
      luggageSurcharges: LUGGAGE_SURCHARGE_PAISE,
    };
  }
}
