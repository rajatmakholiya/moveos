import { Global, Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SMS_PROVIDER, SmsProvider } from './sms/sms.types';
import { DevSmsProvider } from './sms/dev-sms.provider';
import { Msg91SmsProvider } from './sms/msg91-sms.provider';
import { PUSH_PROVIDER, PushProvider } from './push/push.types';
import { DevPushProvider } from './push/dev-push.provider';
import { FcmPushProvider } from './push/fcm-push.provider';
import { KYC_PROVIDER, KycProvider } from './kyc/kyc.types';
import { DevKycProvider } from './kyc/dev-kyc.provider';
import { HypervergeKycProvider } from './kyc/hyperverge-kyc.provider';
import { PAYOUT_PROVIDER, PayoutProvider } from './payout/payout.types';
import { DevPayoutProvider } from './payout/dev-payout.provider';
import { RazorpayXPayoutProvider } from './payout/razorpayx-payout.provider';

const logger = new Logger('ProvidersModule');

function isProduction(config: ConfigService): boolean {
  return (config.get<string>('NODE_ENV') ?? 'development') === 'production';
}

function allowDevInProduction(config: ConfigService): boolean {
  return config.get<string>('ALLOW_DEV_PROVIDERS_IN_PRODUCTION') === 'true';
}

/**
 * Guard against silently shipping a dev provider to production.
 * SMS is fatal (users cannot log in without real OTP delivery); the rest warn
 * loudly so a staged rollout (e.g. launch before payouts) stays possible.
 * Set ALLOW_DEV_PROVIDERS_IN_PRODUCTION=true to bypass for staging smoke tests.
 */
function assertProductionSafety(kind: string, providerName: string, config: ConfigService, fatal: boolean) {
  if (!isProduction(config) || providerName !== 'dev' || allowDevInProduction(config)) return;
  const message =
    `[MoveOS] ${kind} provider is 'dev' in production. ` +
    `Set ${kind.toUpperCase()}_PROVIDER and its credentials, or ALLOW_DEV_PROVIDERS_IN_PRODUCTION=true to override.`;
  if (fatal) throw new Error(message);
  logger.warn(message);
}

function requireEnv(config: ConfigService, key: string, forProvider: string): string {
  const value = config.get<string>(key);
  if (!value) {
    throw new Error(`[MoveOS] ${key} is required when using the '${forProvider}' provider`);
  }
  return value;
}

/**
 * Global external-dependency boundary. Every integration the platform needs
 * to swap at deploy time (SMS, push, KYC, payouts) resolves here from env:
 *
 *   SMS_PROVIDER    = dev | msg91        (default dev)
 *   PUSH_PROVIDER   = dev | fcm          (default dev)
 *   KYC_PROVIDER    = dev | hyperverge   (default dev)
 *   PAYOUT_PROVIDER = dev | razorpayx    (default dev)
 *
 * Inject with e.g. `@Inject(SMS_PROVIDER) private readonly sms: SmsProvider`.
 */
@Global()
@Module({
  providers: [
    {
      provide: SMS_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService): SmsProvider => {
        const selected = config.get<string>('SMS_PROVIDER') ?? 'dev';
        assertProductionSafety('sms', selected, config, true);
        if (selected === 'msg91') {
          return new Msg91SmsProvider({
            authKey: requireEnv(config, 'MSG91_AUTH_KEY', 'msg91'),
            otpTemplateId: requireEnv(config, 'MSG91_OTP_TEMPLATE_ID', 'msg91'),
            flowTemplateId: config.get<string>('MSG91_FLOW_TEMPLATE_ID'),
            senderId: config.get<string>('MSG91_SENDER_ID'),
            baseUrl: config.get<string>('MSG91_BASE_URL'),
          });
        }
        if (selected !== 'dev') throw new Error(`[MoveOS] Unknown SMS_PROVIDER '${selected}' (expected dev | msg91)`);
        return new DevSmsProvider();
      },
    },
    {
      provide: PUSH_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService): PushProvider => {
        const selected = config.get<string>('PUSH_PROVIDER') ?? 'dev';
        assertProductionSafety('push', selected, config, false);
        if (selected === 'fcm') {
          return new FcmPushProvider({
            projectId: requireEnv(config, 'FCM_PROJECT_ID', 'fcm'),
            clientEmail: requireEnv(config, 'FCM_CLIENT_EMAIL', 'fcm'),
            privateKey: requireEnv(config, 'FCM_PRIVATE_KEY', 'fcm'),
          });
        }
        if (selected !== 'dev') throw new Error(`[MoveOS] Unknown PUSH_PROVIDER '${selected}' (expected dev | fcm)`);
        return new DevPushProvider();
      },
    },
    {
      provide: KYC_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService): KycProvider => {
        const selected = config.get<string>('KYC_PROVIDER') ?? 'dev';
        assertProductionSafety('kyc', selected, config, false);
        if (selected === 'hyperverge') {
          return new HypervergeKycProvider({
            appId: requireEnv(config, 'HYPERVERGE_APP_ID', 'hyperverge'),
            appKey: requireEnv(config, 'HYPERVERGE_APP_KEY', 'hyperverge'),
            baseUrl: config.get<string>('HYPERVERGE_BASE_URL'),
            faceMatchThreshold: Number(config.get<string>('KYC_FACE_MATCH_THRESHOLD') ?? 75),
          });
        }
        if (selected !== 'dev') throw new Error(`[MoveOS] Unknown KYC_PROVIDER '${selected}' (expected dev | hyperverge)`);
        return new DevKycProvider();
      },
    },
    {
      provide: PAYOUT_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService): PayoutProvider => {
        const selected = config.get<string>('PAYOUT_PROVIDER') ?? 'dev';
        assertProductionSafety('payout', selected, config, false);
        if (selected === 'razorpayx') {
          return new RazorpayXPayoutProvider({
            keyId: requireEnv(config, 'RAZORPAYX_KEY_ID', 'razorpayx'),
            keySecret: requireEnv(config, 'RAZORPAYX_KEY_SECRET', 'razorpayx'),
            accountNumber: requireEnv(config, 'RAZORPAYX_ACCOUNT_NUMBER', 'razorpayx'),
            baseUrl: config.get<string>('RAZORPAYX_BASE_URL'),
          });
        }
        if (selected !== 'dev')
          throw new Error(`[MoveOS] Unknown PAYOUT_PROVIDER '${selected}' (expected dev | razorpayx)`);
        return new DevPayoutProvider();
      },
    },
  ],
  exports: [SMS_PROVIDER, PUSH_PROVIDER, KYC_PROVIDER, PAYOUT_PROVIDER],
})
export class ProvidersModule {}
