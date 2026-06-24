'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, type ApiError } from '../../../lib/api';
import { useAuth } from '../../../lib/AuthContext';
import { useLanguage } from '../../../lib/LanguageContext';
import { Button } from '../../../components/ui/Button';
import { BottomSheet } from '../../../components/ui/BottomSheet';
import { localeForLang, onboardingCopy, readLoginPayload, readOnboardingState, timezone, type OnboardingState } from '../flow';

type Consents = {
  location: boolean;
  notifications: boolean;
  marketing: boolean;
};

function isApiError(value: unknown): value is ApiError {
  return typeof value === 'object' && value !== null && 'code' in value;
}

export default function DriverConsentsPage() {
  const router = useRouter();
  const { lang } = useLanguage();
  const { login } = useAuth();
  const [state, setState] = useState<OnboardingState | null>(null);
  const [consents, setConsents] = useState<Consents>({ location: false, notifications: false, marketing: false });
  const [permissionSheetOpen, setPermissionSheetOpen] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const saved = readOnboardingState();
    if (!saved?.phone || saved.role !== 'DRIVER' || !saved.name || !saved.onboardingToken) {
      router.replace('/onboarding/phone?role=DRIVER');
      return;
    }

    setState(saved);
  }, [router]);

  const requestLocation = async () => {
    setError('');

    try {
      if ('permissions' in navigator) {
        const permission = await navigator.permissions.query({ name: 'geolocation' });
        if (permission.state === 'denied') {
          setPermissionSheetOpen(true);
          setConsents((current) => ({ ...current, location: false }));
          return;
        }
      }

      if (!navigator.geolocation) {
        setPermissionSheetOpen(true);
        setConsents((current) => ({ ...current, location: false }));
        return;
      }

      await new Promise<void>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(
          () => resolve(),
          () => reject(new Error('Location permission denied')),
          { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 },
        );
      });
      setConsents((current) => ({ ...current, location: true }));
    } catch {
      setPermissionSheetOpen(true);
      setConsents((current) => ({ ...current, location: false }));
    }
  };

  const toggleNotifications = async () => {
    if (!consents.notifications && 'Notification' in window && Notification.permission === 'default') {
      const permission = await Notification.requestPermission();
      setConsents((current) => ({ ...current, notifications: permission === 'granted' }));
      return;
    }

    setConsents((current) => ({ ...current, notifications: !current.notifications }));
  };

  const completeOnboarding = async () => {
    if (!state || !consents.location) {
      return;
    }

    if (!state.onboardingToken) {
      setError(onboardingCopy(lang, 'Session expired. Please request a new OTP.', 'सेशन समाप्त हो गया। नया OTP मंगाएं।'));
      router.replace('/onboarding/phone?role=DRIVER');
      return;
    }

    setLoading(true);
    setError('');

    try {
      await api.post(
        '/onboarding/consents',
        {
          locationPermission: consents.location ? 'granted' : 'denied',
          notificationsOptIn: consents.notifications,
          marketingOptIn: consents.marketing,
          locale: localeForLang(lang),
          timezone: timezone(),
        },
        state.onboardingToken,
      );
      const response = await api.post<unknown>(
        '/onboarding/complete',
        {
          phone: state.phone,
          role: state.role,
          name: state.name,
          locale: localeForLang(lang),
          timezone: timezone(),
        },
        state.onboardingToken,
      );
      const payload = readLoginPayload(response, state);

      if (!payload) {
        throw {
          code: 'INVALID_AUTH_RESPONSE',
          message: onboardingCopy(lang, 'Unable to complete sign in. Please try again.', 'साइन इन पूरा नहीं हो सका। फिर कोशिश करें।'),
        } satisfies ApiError;
      }

      login(payload);
      window.sessionStorage.removeItem('pahadi_onboarding');
      router.replace('/driver');
    } catch (caught) {
      setError(isApiError(caught) ? caught.message : onboardingCopy(lang, 'Something went wrong. Please try again.', 'कुछ गड़बड़ हुई। फिर कोशिश करें।'));
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
      <h1 className="font-display text-title text-[var(--text-primary)]">{onboardingCopy(lang, 'Driver permissions', 'ड्राइवर अनुमतियां')}</h1>
      <p className="mt-2 text-body text-[var(--text-secondary)]">
        {onboardingCopy(lang, 'Set up location and notifications before posting trips.', 'यात्रा पोस्ट करने से पहले लोकेशन और नोटिफिकेशन सेट करें।')}
      </p>
      <div className="mt-8 space-y-3">
        <ConsentRow
          title={onboardingCopy(lang, 'Location permission', 'लोकेशन अनुमति')}
          subtitle={onboardingCopy(lang, 'Required for live tracking and driver safety.', 'लाइव ट्रैकिंग और ड्राइवर सुरक्षा के लिए आवश्यक।')}
          icon="⌖"
          checked={consents.location}
          required
          requiredLabel={onboardingCopy(lang, 'Required', 'आवश्यक')}
          onToggle={requestLocation}
        />
        <ConsentRow
          title={onboardingCopy(lang, 'Notifications', 'नोटिफिकेशन')}
          subtitle={onboardingCopy(lang, 'Recommended for booking updates and passenger calls.', 'बुकिंग अपडेट और यात्री कॉल के लिए सुझाया गया।')}
          icon="!"
          checked={consents.notifications}
          onToggle={toggleNotifications}
        />
        <ConsentRow
          title={onboardingCopy(lang, 'Marketing', 'मार्केटिंग')}
          subtitle={onboardingCopy(lang, 'Optional route tips and platform offers.', 'वैकल्पिक मार्ग सुझाव और प्लेटफॉर्म ऑफर।')}
          icon="%"
          checked={consents.marketing}
          onToggle={() => setConsents((current) => ({ ...current, marketing: !current.marketing }))}
        />
      </div>
      {error ? <p className="mt-4 text-small font-medium text-[var(--red-600)]">{error}</p> : null}
      <Button className="mt-7" fullWidth disabled={!consents.location || loading} loading={loading} onClick={completeOnboarding}>
        {onboardingCopy(lang, 'Continue', 'जारी रखें')}
      </Button>
      <BottomSheet open={permissionSheetOpen} onClose={() => setPermissionSheetOpen(false)} title={onboardingCopy(lang, 'Enable location', 'लोकेशन चालू करें')}>
        <p className="text-body text-[var(--text-secondary)]">
          {onboardingCopy(
            lang,
            'Location access is required for drivers so passengers can track confirmed rides. Open your browser settings, allow location for this site, then try again.',
            'ड्राइवरों के लिए लोकेशन एक्सेस आवश्यक है ताकि यात्री कन्फर्म राइड ट्रैक कर सकें। ब्राउज़र सेटिंग में इस साइट के लिए लोकेशन अनुमति दें, फिर कोशिश करें।',
          )}
        </p>
        <Button className="mt-5" fullWidth onClick={() => setPermissionSheetOpen(false)}>
          {onboardingCopy(lang, 'Got it', 'समझ गया')}
        </Button>
      </BottomSheet>
    </main>
  );
}

function ConsentRow({
  title,
  subtitle,
  icon,
  checked,
  required = false,
  requiredLabel,
  onToggle,
}: {
  title: string;
  subtitle: string;
  icon: string;
  checked: boolean;
  required?: boolean;
  requiredLabel?: string;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex w-full items-center gap-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 text-left shadow-card transition-all active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)]"
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--brand-light)] font-display text-heading text-[var(--brand)]" aria-hidden="true">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2 font-medium text-[var(--text-primary)]">
          {title}
          {required ? <span className="rounded-full bg-[var(--red-50)] px-2 py-0.5 text-micro uppercase text-[var(--red-600)]">{requiredLabel}</span> : null}
        </span>
        <span className="mt-1 block text-small text-[var(--text-secondary)]">{subtitle}</span>
      </span>
      <span className={['relative h-8 w-14 shrink-0 rounded-full transition-colors', checked ? 'bg-[var(--brand)]' : 'bg-[var(--stone-300)]'].join(' ')}>
        <span className={['absolute top-1 h-6 w-6 rounded-full bg-white shadow transition-transform', checked ? 'translate-x-7' : 'translate-x-1'].join(' ')} />
      </span>
    </button>
  );
}
