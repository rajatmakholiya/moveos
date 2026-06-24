'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, type ApiError } from '../../../lib/api';
import { useAuth } from '../../../lib/AuthContext';
import { tx } from '../../../lib/i18n';
import { useLanguage } from '../../../lib/LanguageContext';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { localeForLang, onboardingCopy, readLoginPayload, readOnboardingState, timezone, writeOnboardingState, type OnboardingState } from '../flow';

function isApiError(value: unknown): value is ApiError {
  return typeof value === 'object' && value !== null && 'code' in value;
}

function validateName(value: string, lang: 'en' | 'hi') {
  const trimmed = value.trim();
  if (!trimmed) {
    return tx('errRequired', lang);
  }

  if (trimmed.length < 2) {
    return onboardingCopy(lang, 'Enter at least 2 characters', 'कम से कम 2 अक्षर दर्ज करें');
  }

  if (trimmed.length > 60) {
    return onboardingCopy(lang, 'Name must be 60 characters or less', 'नाम 60 अक्षरों या कम का होना चाहिए');
  }

  if (/\d/.test(trimmed)) {
    return onboardingCopy(lang, 'Name cannot contain numbers', 'नाम में नंबर नहीं हो सकते');
  }

  return '';
}

export default function NameEntryPage() {
  const router = useRouter();
  const { lang } = useLanguage();
  const { login } = useAuth();
  const [state, setState] = useState<OnboardingState | null>(null);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const saved = readOnboardingState();
    if (!saved?.phone || !saved.onboardingToken) {
      router.replace('/onboarding/phone');
      return;
    }

    setState(saved);
    setName(saved.name ?? '');
  }, [router]);

  const completeOnboarding = async (nextState: OnboardingState) => {
    if (!nextState.onboardingToken) {
      throw {
        code: 'MISSING_ONBOARDING_TOKEN',
        message: onboardingCopy(lang, 'Session expired. Please request a new OTP.', 'सेशन समाप्त हो गया। नया OTP मंगाएं।'),
      } satisfies ApiError;
    }

    const response = await api.post<unknown>(
      '/onboarding/complete',
      {
        phone: nextState.phone,
        role: nextState.role,
        name: nextState.name,
        locale: localeForLang(lang),
        timezone: timezone(),
      },
      nextState.onboardingToken,
    );
    const payload = readLoginPayload(response, nextState);

    if (!payload) {
      throw {
        code: 'INVALID_AUTH_RESPONSE',
        message: onboardingCopy(lang, 'Unable to complete sign in. Please try again.', 'साइन इन पूरा नहीं हो सका। फिर कोशिश करें।'),
      } satisfies ApiError;
    }

    login(payload);
    window.sessionStorage.removeItem('pahadi_onboarding');
    const intendedUrl = window.sessionStorage.getItem('pahadi_intended_url');
    if (intendedUrl) {
      window.sessionStorage.removeItem('pahadi_intended_url');
      router.replace(intendedUrl);
    } else {
      router.replace('/');
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const validationError = validateName(name, lang);
    setError(validationError);

    if (validationError || !state) {
      return;
    }

    const nextState = { ...state, name: name.trim() };
    writeOnboardingState(nextState);

    if (nextState.role === 'DRIVER') {
      router.push('/onboarding/consents');
      return;
    }

    setLoading(true);

    try {
      await completeOnboarding(nextState);
    } catch (caught) {
      setError(isApiError(caught) ? caught.message : tx('errGeneric', lang));
    } finally {
      setLoading(false);
    }
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
      <h1 className="font-display text-title text-[var(--text-primary)]">{tx('authName', lang)}</h1>
      <p className="mt-2 text-body text-[var(--text-secondary)]">{tx('authNameHint', lang)}</p>
      <form onSubmit={handleSubmit} className="mt-8 space-y-5">
        <Input
          label={tx('authName', lang)}
          value={name}
          error={error}
          hint={!error ? tx('authNameHint', lang) : undefined}
          autoComplete="name"
          maxLength={60}
          onChange={(event) => {
            setName(event.target.value);
            setError('');
          }}
        />
        <Button type="submit" fullWidth loading={loading} disabled={loading || name.trim().length < 2}>
          {onboardingCopy(lang, 'Continue', 'जारी रखें')}
        </Button>
      </form>
    </main>
  );
}
