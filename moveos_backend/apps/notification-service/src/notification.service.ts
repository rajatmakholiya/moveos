import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);
  private readonly tokens = new Map<string, string>();

  registerDevice(driverId: string, token: string) {
    this.tokens.set(driverId, token);
    this.logger.log(`Registered device token for driver ${driverId}`);
    return { driverId, token, status: 'registered' };
  }

  sendPush(driverId: string, message: string) {
    const token = this.tokens.get(driverId);
    if (!token) {
      this.logger.warn(`No token for driver ${driverId}`);
      return { delivered: false };
    }
    // Placeholder for push integration
    this.logger.log(`Would send push to ${driverId} (${token}): ${message}`);
    return { delivered: true };
  }

  /**
   * Notify a passenger that they have been dropped off. No real SMS/push provider
   * is wired yet (same posture as OTP delivery), so this logs and returns the
   * composed message; in dev the message is echoed back for inspection.
   */
  sendDropOff(payload: { bookingId: string; passengerId?: string | null; passengerPhone?: string | null; passengerName?: string | null; dropoffLabel?: string | null }) {
    const name = payload.passengerName ?? 'Passenger';
    const where = payload.dropoffLabel ? ` at ${payload.dropoffLabel}` : '';
    const message = `Hi ${name}, you have reached your destination${where}. Thank you for travelling with Pahadi Rides!`;

    if (payload.passengerPhone) {
      this.logger.log(`Would SMS ${payload.passengerPhone}: ${message}`);
    }
    if (payload.passengerId) {
      // Best-effort push if the passenger registered a device token.
      this.sendPush(payload.passengerId, message);
    }

    return {
      delivered: true,
      channel: payload.passengerPhone ? 'sms' : 'push',
      devMessage: process.env.NODE_ENV !== 'production' ? message : undefined,
    };
  }
}
