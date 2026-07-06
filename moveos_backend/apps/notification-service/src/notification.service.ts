import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  PrismaService,
  PUSH_PROVIDER,
  PushProvider,
  SMS_PROVIDER,
  SmsProvider,
} from '@common/index';

export interface RegisterDeviceInput {
  token: string;
  userId?: string | null;
  driverId?: string | null;
  passengerId?: string | null;
  platform?: string | null;
}

/**
 * Notification delivery. Device tokens persist in PostgreSQL (DeviceToken)
 * and delivery goes through the swappable push/SMS providers. Tokens the
 * provider reports as dead are pruned automatically.
 */
@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(PUSH_PROVIDER) private readonly push: PushProvider,
    @Inject(SMS_PROVIDER) private readonly sms: SmsProvider,
  ) {}

  async registerDevice(input: RegisterDeviceInput) {
    const record = await this.prisma.deviceToken.upsert({
      where: { token: input.token },
      create: {
        token: input.token,
        userId: input.userId ?? null,
        driverId: input.driverId ?? null,
        passengerId: input.passengerId ?? null,
        platform: input.platform ?? null,
      },
      update: {
        userId: input.userId ?? undefined,
        driverId: input.driverId ?? undefined,
        passengerId: input.passengerId ?? undefined,
        platform: input.platform ?? undefined,
        lastSeenAt: new Date(),
      },
    });
    this.logger.log(`Registered device token for ${input.driverId ?? input.passengerId ?? input.userId}`);
    return { id: record.id, token: record.token, status: 'registered' };
  }

  /** Push to every registered device of a driver. */
  async pushToDriver(driverId: string, title: string, body: string, data?: Record<string, string>) {
    return this.pushToTokens({ driverId }, title, body, data);
  }

  /** Push to every registered device of a passenger. */
  async pushToPassenger(passengerId: string, title: string, body: string, data?: Record<string, string>) {
    return this.pushToTokens({ passengerId }, title, body, data);
  }

  private async pushToTokens(
    where: { driverId?: string; passengerId?: string },
    title: string,
    body: string,
    data?: Record<string, string>,
  ) {
    const tokens = await this.prisma.deviceToken.findMany({ where });
    if (tokens.length === 0) {
      return { delivered: 0, total: 0 };
    }
    const results = await this.push.sendToMany(
      tokens.map((t) => t.token),
      { title, body, data },
    );
    // Prune tokens the provider says are dead
    const deadTokens = tokens.filter((_, index) => results[index]?.invalidToken).map((t) => t.token);
    if (deadTokens.length > 0) {
      await this.prisma.deviceToken.deleteMany({ where: { token: { in: deadTokens } } });
      this.logger.log(`Pruned ${deadTokens.length} dead device token(s)`);
    }
    const delivered = results.filter((r) => r.delivered).length;
    return { delivered, total: tokens.length };
  }

  async sendSms(phone: string, message: string) {
    return this.sms.sendMessage(phone, message);
  }

  /** Notify a passenger they have been dropped off (SMS + push). */
  async sendDropOff(payload: {
    bookingId: string;
    passengerId?: string | null;
    passengerPhone?: string | null;
    passengerName?: string | null;
    dropoffLabel?: string | null;
  }) {
    const name = payload.passengerName ?? 'Passenger';
    const where = payload.dropoffLabel ? ` at ${payload.dropoffLabel}` : '';
    const message = `Hi ${name}, you have reached your destination${where}. Thank you for travelling with Pahadi Rides!`;

    let channel: 'sms' | 'push' | 'none' = 'none';
    if (payload.passengerPhone) {
      const result = await this.sms.sendMessage(payload.passengerPhone, message);
      if (result.delivered) channel = 'sms';
    }
    if (payload.passengerId) {
      const result = await this.pushToPassenger(payload.passengerId, 'Trip completed', message, {
        bookingId: payload.bookingId,
        type: 'drop_off',
      });
      if (channel === 'none' && result.delivered > 0) channel = 'push';
    }

    return {
      delivered: channel !== 'none',
      channel,
      devMessage: this.sms.deliversRealSms ? undefined : message,
    };
  }
}
