'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { FormEvent, Suspense, useEffect, useMemo, useState } from 'react';
import { api, type ApiError } from '../../../lib/api';
import { tx } from '../../../lib/i18n';
import { useLanguage } from '../../../lib/LanguageContext';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { deviceFingerprint, formatPhone, localeForLang, normalizePhone, onboardingCopy, readOnboardingState, readStringField, timezone, unwrapData, writeOnboardingState, type OnboardingRole } from '../flow';

type SessionResponse = {
  status?: string;
  data?: {
    sessionId?: string;
    onboardingToken?: string;
  };
};

type ProfileResponse = {
  status?: string;
  data?: {
    devOtpCode?: string;
    otpExpiresIn?: number;
  };
};

function isApiError(value: unknown): value is ApiError {
  return typeof value === 'object' && value !== null && 'code' in value;
}

function readRetryMinutes(error: ApiError) {
  const details = error.details;
  if (typeof details === 'object' && details !== null) {
    const retryAfter = (details as Record<string, unknown>).retryAfter;
    if (typeof retryAfter === 'number' && Number.isFinite(retryAfter)) {
      return Math.max(1, Math.ceil(retryAfter / 60));
    }
  }

  return 1;
}

function readExistingRole(error: ApiError): OnboardingRole | undefined {
  const sources = [error.details];

  if (typeof error.details === 'object' && error.details !== null) {
    const details = error.details as Record<string, unknown>;
    sources.push(details.details, details.message);
  }

  for (const source of sources) {
    if (typeof source !== 'object' || source === null) {
      continue;
    }

    const role = (source as Record<string, unknown>).existingRole;
    if (role === 'DRIVER' || role === 'PASSENGER') {
      return role;
    }
  }

  return undefined;
}

export default function PhoneEntryPage() {
  return (
    <Suspense fallback={<PhoneEntryFallback />}>
      <PhoneEntryContent />
    </Suspense>
  );
}

function PhoneEntryFallback() {
  return <main className="min-h-screen bg-[var(--surface-raised)] px-5 pt-5" />;
}

function PhoneEntryContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { lang } = useLanguage();
  const role = useMemo<OnboardingRole>(() => (searchParams.get('role') === 'DRIVER' ? 'DRIVER' : 'PASSENGER'), [searchParams]);
  const [phone, setPhone] = useState('');
  const [error, setError] = useState('');
  const [offline, setOffline] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const saved = readOnboardingState();
    if (saved?.phone) {
      setPhone(formatPhone(saved.phone));
    }

    const updateOnlineState = () => setOffline(!window.navigator.onLine);
    updateOnlineState();
    window.addEventListener('online', updateOnlineState);
    window.addEventListener('offline', updateOnlineState);
    return () => {
      window.removeEventListener('online', updateOnlineState);
      window.removeEventListener('offline', updateOnlineState);
    };
  }, []);

  const digits = normalizePhone(phone);
  const isValid = digits.length === 10;

  const requestOtpForRole = async (fullPhone: string, selectedRole: OnboardingRole) => {
    const session = await api.post<SessionResponse>('/onboarding/session', {
      deviceFingerprint: deviceFingerprint(),
      role: selectedRole,
      appVersion: '1.0.0',
      locale: localeForLang(lang),
      timezone: timezone(),
    });
    const sessionData = unwrapData(session);
    const sessionId = readStringField(sessionData, ['sessionId', 'id']);
    const onboardingToken = readStringField(sessionData, ['onboardingToken', 'token']);
    if (!onboardingToken) {
      throw {
        code: 'INVALID_ONBOARDING_SESSION',
        message: onboardingCopy(lang, 'Could not start onboarding. Please try again.', 'ऑनबोर्डिंग शुरू नहीं हो सकी। फिर कोशिश करें।'),
      } satisfies ApiError;
    }
    const profile = await api.post<ProfileResponse>(
      '/onboarding/profile',
      {
        phone: fullPhone,
        resend: true,
        locale: localeForLang(lang),
        timezone: timezone(),
      },
      onboardingToken,
    );
    const profileData = unwrapData(profile);
    const devOtpCode = readStringField(profileData, ['devOtpCode']);

    writeOnboardingState({ phone: fullPhone, role: selectedRole, sessionId, onboardingToken, devOtpCode });
    router.push(`/onboarding/otp?phone=${encodeURIComponent(fullPhone)}&role=${selectedRole}`);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');

    if (!isValid) {
      setError(tx('errPhone', lang));
      return;
    }

    setLoading(true);

    try {
      const fullPhone = `+91${digits}`;
      await requestOtpForRole(fullPhone, role);
    } catch (caught) {
      if (isApiError(caught) && (caught.code === 'role_conflict' || caught.status === 409)) {
        const existingRole = readExistingRole(caught);
        const fullPhone = `+91${digits}`;
        if (existingRole && existingRole !== role) {
          try {
            await requestOtpForRole(fullPhone, existingRole);
            return;
          } catch (retryError) {
            setError(isApiError(retryError) ? retryError.message : tx('errGeneric', lang));
          }
        } else {
          setError(caught.message);
        }
      } else if (isApiError(caught) && caught.status === 429) {
        const minutes = readRetryMinutes(caught);
        setError(onboardingCopy(lang, `You've requested too many OTPs. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`, `बहुत ज़्यादा OTP मांगे गए हैं। ${minutes} मिनट बाद कोशिश करें।`));
      } else if (isApiError(caught) && caught.code === 'NETWORK_ERROR') {
        setOffline(true);
        setError(caught.message);
      } else {
        setError(isApiError(caught) ? caught.message : tx('errGeneric', lang));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-[var(--surface-raised)] px-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-5">
      {offline ? (
        <div className="mb-4 rounded-xl bg-[var(--amber-50)] px-4 py-3 text-small font-medium text-[var(--stone-800)]">
          {error || onboardingCopy(lang, 'API is not reachable - retry after services are running.', 'API उपलब्ध नहीं है - सर्विस चालू होने पर फिर कोशिश करें।')}
        </div>
      ) : null}
      <button
        type="button"
        onClick={() => router.back()}
        className="mb-8 flex h-11 w-11 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface)] text-title text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)]"
        aria-label={onboardingCopy(lang, 'Go back', 'वापस जाएं')}
      >
        ←
      </button>
      <h1 className="font-display text-title text-[var(--text-primary)]">{tx('authTitle', lang)}</h1>
      <p className="mt-2 text-body text-[var(--text-secondary)]">{tx('authSubtitle', lang)}</p>
      <form onSubmit={handleSubmit} className="mt-8 space-y-5">
        <div className="flex gap-3">
          <div className="flex h-[52px] shrink-0 items-center rounded-xl bg-[var(--brand-light)] px-4 font-medium text-[var(--brand)]">+91</div>
          <Input
            label={tx('authPhone', lang)}
            inputMode="numeric"
            autoComplete="tel"
            maxLength={11}
            value={phone}
            error={error}
            placeholder={onboardingCopy(lang, '98765 43210', '98765 43210')}
            onChange={(event) => {
              setPhone(formatPhone(event.target.value));
              setError('');
            }}
          />
        </div>
        <Button type="submit" fullWidth disabled={!isValid || loading} loading={loading}>
          {offline && error ? onboardingCopy(lang, 'Retry', 'फिर कोशिश करें') : tx('authSendOtp', lang)}
        </Button>
      </form>
    </main>
  );
}
