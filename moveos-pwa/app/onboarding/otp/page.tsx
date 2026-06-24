'use client';

import { motion } from 'framer-motion';
import { useRouter, useSearchParams } from 'next/navigation';
import { ClipboardEvent, KeyboardEvent, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, type ApiError } from '../../../lib/api';
import { useAuth } from '../../../lib/AuthContext';
import { tx } from '../../../lib/i18n';
import { useLanguage } from '../../../lib/LanguageContext';
import { Button } from '../../../components/ui/Button';
import {
  maskPhone,
  onboardingCopy,
  readBooleanField,
  readLoginPayload,
  readOnboardingState,
  readStringField,
  localeForLang,
  timezone,
  writeOnboardingState,
  type OnboardingRole,
} from '../flow';

type VerifyResponse = {
  verificationId?: string;
  requiresName?: boolean;
  hasName?: boolean;
};

function isApiError(value: unknown): value is ApiError {
  return typeof value === 'object' && value !== null && 'code' in value;
}

export default function OtpVerificationPage() {
  return (
    <Suspense fallback={<OtpVerificationFallback />}>
      <OtpVerificationContent />
    </Suspense>
  );
}

function OtpVerificationFallback() {
  return <main className="min-h-screen bg-[var(--surface-raised)] px-5 pt-5" />;
}

function OtpVerificationContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { lang } = useLanguage();
  const { login } = useAuth();
  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);
  const verificationInFlightRef = useRef(false);
  const [digits, setDigits] = useState(['', '', '', '', '', '']);
  const [seconds, setSeconds] = useState(60);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [shakeCount, setShakeCount] = useState(0);
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());

  const saved = typeof window === 'undefined' ? null : readOnboardingState();
  const phone = searchParams.get('phone') ?? saved?.phone ?? '';
  const role = useMemo<OnboardingRole>(() => (searchParams.get('role') === 'DRIVER' || saved?.role === 'DRIVER' ? 'DRIVER' : 'PASSENGER'), [searchParams, saved?.role]);
  const otp = digits.join('');
  const isLocked = lockedUntil !== null && lockedUntil > now;
  const lockSeconds = lockedUntil ? Math.max(0, Math.ceil((lockedUntil - now) / 1000)) : 0;

  useEffect(() => {
    if (!phone) {
      router.replace('/onboarding/phone');
      return;
    }

    writeOnboardingState({
      phone,
      role,
      sessionId: saved?.sessionId,
      onboardingToken: saved?.onboardingToken,
      verificationId: saved?.verificationId,
      name: saved?.name,
      devOtpCode: saved?.devOtpCode,
    });
    inputRefs.current[0]?.focus();
  }, [phone, role, router, saved?.devOtpCode, saved?.name, saved?.onboardingToken, saved?.sessionId, saved?.verificationId]);

  useEffect(() => {
    if (seconds <= 0) {
      return;
    }

    const timer = window.setInterval(() => setSeconds((current) => Math.max(0, current - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [seconds]);

  useEffect(() => {
    if (!lockedUntil) {
      return;
    }

    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [lockedUntil]);

  const clearOtp = useCallback(() => {
    setDigits(['', '', '', '', '', '']);
    window.setTimeout(() => inputRefs.current[0]?.focus(), 0);
  }, []);

  const verifyOtp = useCallback(
    async (code: string) => {
      if (verificationInFlightRef.current || loading || isLocked || code.length !== 6) {
        return;
      }

      verificationInFlightRef.current = true;
      setLoading(true);
      setError('');

      try {
        const state = readOnboardingState();
        if (!state?.onboardingToken) {
          setError(onboardingCopy(lang, 'Session missing. Please request a new OTP.', 'सेशन नहीं मिला। नया OTP मंगाएं।'));
          return;
        }

        const response = await api.post<VerifyResponse>(
          '/onboarding/profile',
          {
            phone,
            otp: code,
            locale: localeForLang(lang),
            timezone: timezone(),
          },
          state?.onboardingToken,
        );
        const verificationId = response.verificationId ?? readStringField(response, ['id', 'otpVerificationId', 'userId']);
        const nextState = { phone, role, sessionId: state?.sessionId, onboardingToken: state?.onboardingToken, verificationId, devOtpCode: state?.devOtpCode };
        writeOnboardingState(nextState);

        const payload = readLoginPayload(response, nextState);
        const nextHint = readStringField(response, ['nextHint']);
        const existingName = readStringField(response, ['name']);
        const explicitRequiresName = readBooleanField(response, ['requiresName', 'needsName']) ?? response.requiresName;
        const hasName = readBooleanField(response, ['hasName']) ?? response.hasName ?? Boolean(existingName);
        const requiresName = explicitRequiresName ?? !hasName;

        if (payload && !requiresName) {
          login(payload);
          window.sessionStorage.removeItem('pahadi_onboarding');
          const intendedUrl = window.sessionStorage.getItem('pahadi_intended_url');
          if (intendedUrl && payload.role !== 'DRIVER') {
            window.sessionStorage.removeItem('pahadi_intended_url');
            router.replace(intendedUrl);
          } else {
            router.replace(payload.role === 'DRIVER' ? '/driver' : '/');
          }
          return;
        }

        if (!requiresName && role === 'DRIVER' && nextHint === 'collect_consents') {
          writeOnboardingState({ ...nextState, name: existingName });
          router.replace('/onboarding/consents');
          return;
        }

        if (!requiresName && role === 'PASSENGER' && nextHint === 'ready_to_complete') {
          const completeResponse = await api.post<unknown>(
            '/onboarding/complete',
            {
              phone,
              role,
              name: existingName,
              locale: localeForLang(lang),
              timezone: timezone(),
            },
            state.onboardingToken,
          );
          const completePayload = readLoginPayload(completeResponse, { ...nextState, name: existingName });
          if (completePayload) {
            login(completePayload);
            window.sessionStorage.removeItem('pahadi_onboarding');
            const intendedUrl = window.sessionStorage.getItem('pahadi_intended_url');
            if (intendedUrl) {
              window.sessionStorage.removeItem('pahadi_intended_url');
              router.replace(intendedUrl);
            } else {
              router.replace('/');
            }
            return;
          }
        }

        if (navigator.vibrate) {
          navigator.vibrate(30);
        }
        setDigits(['', '', '', '', '', '']);
        router.replace('/onboarding/name');
      } catch (caught) {
        if (navigator.vibrate) {
          navigator.vibrate([40, 30, 40]);
        }

        setShakeCount((current) => current + 1);
        clearOtp();

        if (isApiError(caught) && caught.status === 401) {
          setError(onboardingCopy(lang, 'Session expired. Please request a new OTP.', 'सेशन समाप्त हो गया। नया OTP मंगाएं।'));
        } else if (isApiError(caught) && (caught.code === 'OTP_EXPIRED' || caught.status === 410)) {
          setError(tx('errOtpExpired', lang));
        } else {
          const nextAttempts = failedAttempts + 1;
          setFailedAttempts(nextAttempts);
          if (nextAttempts >= 3) {
            setLockedUntil(Date.now() + 10 * 60 * 1000);
            setError(onboardingCopy(lang, 'Too many wrong attempts. Try again in 10 minutes.', 'बहुत ज़्यादा गलत कोशिशें हुईं। 10 मिनट बाद कोशिश करें।'));
          } else {
            setError(isApiError(caught) && caught.message ? caught.message : tx('errOtpInvalid', lang));
          }
        }
      } finally {
        verificationInFlightRef.current = false;
        setLoading(false);
      }
    },
    [clearOtp, failedAttempts, isLocked, lang, loading, login, phone, role, router],
  );

  useEffect(() => {
    if (otp.length === 6 && digits.every(Boolean)) {
      void verifyOtp(otp);
    }
  }, [digits, otp, verifyOtp]);

  const setDigitAt = (index: number, value: string) => {
    const nextDigit = value.replace(/\D/g, '').slice(-1);
    setDigits((current) => current.map((digit, digitIndex) => (digitIndex === index ? nextDigit : digit)));
    if (nextDigit && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>, index: number) => {
    if (event.key === 'Backspace' && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (event: ClipboardEvent<HTMLInputElement>) => {
    const pasted = event.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (pasted.length === 6) {
      event.preventDefault();
      setDigits(pasted.split(''));
    }
  };

  const requestNewOtp = () => {
    router.replace(`/onboarding/phone?role=${role}`);
  };

  return (
    <main className="min-h-screen bg-[var(--surface-raised)] px-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-5">
      <button
        type="button"
        onClick={() => router.back()}
        className="mb-8 flex h-11 w-11 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface)] text-title text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)]"
        aria-label={onboardingCopy(lang, 'Go back', 'वापस जाएं')}
      >
        ←
      </button>
      <h1 className="font-display text-title text-[var(--text-primary)]">{tx('authOtpTitle', lang)}</h1>
      <p className="mt-2 text-body text-[var(--text-secondary)]">
        {tx('authOtpSent', lang)} <span className="font-medium text-[var(--text-primary)]">{maskPhone(phone)}</span>
      </p>
      {saved?.devOtpCode ? <p className="mt-3 rounded-xl bg-[var(--amber-50)] px-4 py-3 text-small text-[var(--stone-800)]">Dev OTP: {saved.devOtpCode}</p> : null}

      {isLocked ? (
        <section className="mt-8 rounded-2xl border border-red-200 bg-[var(--red-50)] p-5 text-body text-[var(--red-600)]">
          {onboardingCopy(lang, `Locked for ${Math.ceil(lockSeconds / 60)} minutes after 3 failed attempts.`, `3 गलत कोशिशों के बाद ${Math.ceil(lockSeconds / 60)} मिनट के लिए लॉक है।`)}
        </section>
      ) : (
        <motion.div
          key={shakeCount}
          animate={shakeCount > 0 ? { x: [0, -10, 10, -8, 8, 0] } : { x: 0 }}
          transition={{ duration: 0.35 }}
          className="mt-8 grid grid-cols-6 gap-2"
        >
          {digits.map((digit, index) => (
            <input
              key={index}
              ref={(node) => {
                inputRefs.current[index] = node;
              }}
              value={digit}
              inputMode="numeric"
              autoComplete={index === 0 ? 'one-time-code' : 'off'}
              maxLength={1}
              disabled={loading}
              aria-label={onboardingCopy(lang, `OTP digit ${index + 1} of 6`, `OTP अंक ${index + 1} / 6`)}
              onChange={(event) => setDigitAt(index, event.target.value)}
              onKeyDown={(event) => handleKeyDown(event, index)}
              onPaste={handlePaste}
              className="h-14 rounded-xl border border-[var(--border)] bg-[var(--surface)] text-center font-mono text-title text-[var(--text-primary)] outline-none transition-all focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--teal-100)] disabled:opacity-50"
            />
          ))}
        </motion.div>
      )}

      {error ? <p className="mt-4 text-small font-medium text-[var(--red-600)]">{error}</p> : null}
      <div className="mt-7 flex items-center justify-between">
        {seconds > 0 ? (
          <p className="text-small text-[var(--text-secondary)]">
            {tx('authResendIn', lang)} 0:{String(seconds).padStart(2, '0')}
          </p>
        ) : (
          <button type="button" onClick={requestNewOtp} className="text-small font-medium text-[var(--brand)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)]">
            {error === tx('errOtpExpired', lang) ? onboardingCopy(lang, 'Request new OTP', 'नया OTP मंगाएं') : tx('authResend', lang)}
          </button>
        )}
        {loading ? <span className="pahadi-spinner text-[var(--brand)]" aria-label={onboardingCopy(lang, 'Verifying', 'वेरीफाई हो रहा है')} /> : null}
      </div>
      {error === tx('errOtpExpired', lang) ? (
        <Button className="mt-6" fullWidth onClick={requestNewOtp}>
          {onboardingCopy(lang, 'Request new OTP', 'नया OTP मंगाएं')}
        </Button>
      ) : null}
    </main>
  );
}
