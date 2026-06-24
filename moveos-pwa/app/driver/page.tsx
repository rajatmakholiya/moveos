'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../lib/AuthContext';
import { api } from '../../lib/api';
import { tx } from '../../lib/i18n';
import { useLanguage } from '../../lib/LanguageContext';
import { parseTrips, type Trip } from '../../lib/pahadi';
import { copy, formatCurrency, formatTime } from '../../lib/utils';
import { Button } from '../../components/ui/Button';
import { LanguageToggle } from '../../components/ui/LanguageToggle';
import { Pill } from '../../components/ui/Pill';
import { SkeletonCard } from '../../components/ui/SkeletonCard';
import { DriverAuthLoading, DriverAuthRequired } from '../../components/DriverAuthState';

type OperatingContext = {
  id: string;
  type: 'INDIVIDUAL' | 'ORGANIZATION';
  label: string;
  activeVehicleCount: number;
  canOperate: boolean;
  blockedReasons?: Array<{ code: string; message: string; owner: 'DRIVER' | 'ORGANIZATION' | 'PLATFORM' }>;
};

// nextStep values that permit dashboard access
const DASHBOARD_ALLOWED: ReadonlySet<string> = new Set(['ACTIVE', 'WAIT_FOR_VERIFICATION', 'SUSPENDED']);

export default function DriverDashboardPage() {
  const router = useRouter();
  const { lang } = useLanguage();
  const { user, token, isReady } = useAuth();
  const [guardReady, setGuardReady] = useState(false);
  const [online, setOnline] = useState(false);
  const [onlineSince, setOnlineSince] = useState<Date | null>(null);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState({ totalEarningsPaise: 0, openSeats: 0, activeRoutes: 0, bookings: 0 });
  const [compliance, setCompliance] = useState({ canAcceptBookings: true, insurance: 'VERIFIED' });
  const [contexts, setContexts] = useState<OperatingContext[]>([]);
  const [selectedContext, setSelectedContext] = useState<string | null>(null);

  useEffect(() => {
    if (!isReady) return;
    if (user && user.role !== 'DRIVER') {
      router.replace('/');
    }
  }, [isReady, router, user]);

  // Guard: block dashboard until profile + documents are complete and submitted
  useEffect(() => {
    if (!isReady || !token || user?.role !== 'DRIVER') {
      setGuardReady(false);
      return;
    }
    setGuardReady(false);
    let active = true;
    api
      .get<{ data?: { nextStep?: string; missingRequiredFields?: string[]; missingRequiredDocuments?: string[] } }>('/driver/onboarding/me', token)
      .then((res) => {
        if (!active) return;
        const data = res?.data;
        const nextStep = data?.nextStep ?? '';
        const hasMissing = (data?.missingRequiredFields?.length ?? 0) > 0 || (data?.missingRequiredDocuments?.length ?? 0) > 0;
        if (!DASHBOARD_ALLOWED.has(nextStep) || hasMissing) {
          router.replace('/driver/onboarding/profile');
        } else {
          setGuardReady(true);
        }
      })
      .catch(() => {
        if (!active) return;
        // Onboarding endpoint unavailable — let the driver through rather than blocking indefinitely
        setGuardReady(true);
      });
    return () => {
      active = false;
    };
  }, [isReady, token, user?.role, router]);

  useEffect(() => {
    if (!token || user?.role !== 'DRIVER' || !guardReady) {
      setLoading(false);
      return;
    }

    let active = true;
    async function loadTrips() {
      setLoading(true);
      try {
        const [response, earningsResponse, complianceResponse, contextResponse] = await Promise.all([
          api.get<{ metrics?: typeof metrics }>('/driver/trips?scope=today', token ?? undefined),
          api.get<{ earnings?: { todayPaise?: number; weekPaise?: number; monthPaise?: number } }>('/driver/earnings', token ?? undefined),
          api.get<{ compliance?: typeof compliance }>('/driver/compliance', token ?? undefined),
          api.get<{ contexts?: OperatingContext[]; selectedContext?: string | null }>('/drivers/me/operating-contexts', token ?? undefined),
        ]);
        if (active) {
          setTrips(parseTrips(response));
          if (response.metrics) {
            setMetrics({ ...response.metrics, totalEarningsPaise: earningsResponse.earnings?.todayPaise ?? response.metrics.totalEarningsPaise });
          }
          if (complianceResponse.compliance) {
            setCompliance(complianceResponse.compliance);
          }
          setContexts(contextResponse.contexts ?? []);
          setSelectedContext(contextResponse.selectedContext ?? contextResponse.contexts?.[0]?.id ?? null);
        }
      } catch {
        if (active) {
          setTrips([]);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void loadTrips();
    return () => {
      active = false;
    };
  }, [token, user?.role, guardReady]);

  const earnings = useMemo(() => {
    const total = metrics.totalEarningsPaise || trips.reduce((sum, trip) => sum + (trip.frontFarePaise + trip.backFarePaise * 2), 0);
    return {
      week: total,
      month: total * 4,
    };
  }, [metrics.totalEarningsPaise, trips]);

  const toggleOnline = async () => {
    const nextOnline = !online;
    const previousOnline = online;
    const previousSince = onlineSince;
    setOnline(nextOnline);
    setOnlineSince(nextOnline ? new Date() : null);

    try {
      await api.post(`/drivers/me/${nextOnline ? 'go-online' : 'go-offline'}`, {}, token ?? undefined);
    } catch {
      setOnline(previousOnline);
      setOnlineSince(previousSince);
    }
  };

  const chooseContext = async (contextId: string) => {
    const previous = selectedContext;
    setSelectedContext(contextId);
    try {
      await api.post('/drivers/me/operating-context', { contextId }, token ?? undefined);
    } catch {
      setSelectedContext(previous);
    }
  };

  if (!isReady || !guardReady) {
    return <DriverAuthLoading />;
  }

  if (!user || user.role !== 'DRIVER') {
    return <DriverAuthRequired />;
  }

  return (
    <main className="min-h-screen bg-[var(--surface-raised)] px-5 pb-[calc(5rem+env(safe-area-inset-bottom))] pt-5">
      <header className="flex items-center justify-between gap-4">
        <h1 className="font-display text-title text-[var(--text-primary)]">{copy(lang, 'Driver', 'ड्राइवर')}</h1>
        <LanguageToggle />
      </header>
      {/* Active trip banner — shown when a trip is DEPARTED */}
      {trips.some((t) => t.status === 'DEPARTED') ? (
        <ActiveTripBanner trip={trips.find((t) => t.status === 'DEPARTED')!} lang={lang} onOpen={(trip) => router.push(`/driver/trips/${trip.id}/manifest`)} />
      ) : null}

      <section className={['mt-5 flex items-center justify-between gap-4 rounded-2xl p-5 shadow-card', online ? 'bg-[var(--brand)] text-white' : 'bg-[var(--stone-900)] text-white'].join(' ')}>
        <div>
          <p className="font-display text-heading">{online ? copy(lang, 'ONLINE', 'ऑनलाइन') : copy(lang, 'OFFLINE', 'ऑफलाइन')}</p>
          <p className="text-small opacity-80">{onlineSince ? `${copy(lang, 'since', 'से')} ${formatTime(onlineSince, lang)}` : copy(lang, 'Go online to receive bookings', 'बुकिंग लेने के लिए ऑनलाइन जाएं')}</p>
        </div>
        <Button variant={online ? 'ghost' : 'secondary'} onClick={() => void toggleOnline()}>
          {online ? tx('driverGoOffline', lang) : tx('driverGoOnline', lang)}
        </Button>
      </section>
      <section className="mt-5 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-card">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="font-medium text-[var(--text-primary)]">{copy(lang, 'Compliance', 'कम्प्लायंस')}</p>
            <p className="text-small text-[var(--text-secondary)]">{copy(lang, `Insurance: ${compliance.insurance}`, `इंश्योरेंस: ${compliance.insurance}`)}</p>
          </div>
          <Pill color={compliance.canAcceptBookings ? 'teal' : 'red'} label={compliance.canAcceptBookings ? copy(lang, 'Ready', 'तैयार') : copy(lang, 'Blocked', 'ब्लॉक')} />
        </div>
      </section>
      <section className="mt-5 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-card">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="font-medium text-[var(--text-primary)]">{copy(lang, 'Operating context', 'ऑपरेटिंग कॉन्टेक्स्ट')}</p>
            <p className="text-small text-[var(--text-secondary)]">{copy(lang, 'Choose whether you are driving independently or for a fleet', 'स्वतंत्र या फ्लीट के लिए ड्राइविंग चुनें')}</p>
          </div>
          <Pill color={selectedContext?.startsWith('ORG:') ? 'amber' : 'teal'} label={selectedContext?.startsWith('ORG:') ? copy(lang, 'Fleet', 'फ्लीट') : copy(lang, 'Solo', 'स्वतंत्र')} />
        </div>
        <div className="mt-4 space-y-3">
          {(contexts.length ? contexts : [{ id: 'INDIVIDUAL', type: 'INDIVIDUAL', label: copy(lang, 'Drive independently', 'स्वतंत्र रूप से चलाएं'), activeVehicleCount: 0, canOperate: compliance.canAcceptBookings } as OperatingContext]).map((context) => (
            <button
              key={context.id}
              type="button"
              onClick={() => void chooseContext(context.id)}
              className={[
                'w-full rounded-xl border p-3 text-left transition',
                selectedContext === context.id ? 'border-[var(--brand)] bg-[var(--brand-light)]' : 'border-[var(--border)] bg-[var(--surface-raised)]',
              ].join(' ')}
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-small font-medium text-[var(--text-primary)]">{context.label}</p>
                  <p className="text-small text-[var(--text-secondary)]">{context.activeVehicleCount} {copy(lang, 'vehicles', 'वाहन')}</p>
                </div>
                <Pill color={context.canOperate ? 'teal' : 'red'} label={context.canOperate ? copy(lang, 'Ready', 'तैयार') : copy(lang, 'Blocked', 'ब्लॉक')} />
              </div>
              {!context.canOperate && context.blockedReasons?.[0] ? (
                <p className="mt-2 text-small text-[var(--red-600)]">{context.blockedReasons[0].message}</p>
              ) : null}
            </button>
          ))}
        </div>
      </section>
      <section className="mt-5 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-card">
        <h2 className="font-display text-heading text-[var(--text-primary)]">{copy(lang, 'Dashboard', 'डैशबोर्ड')}</h2>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <Earning label={copy(lang, 'This week', 'इस सप्ताह')} value={formatCurrency(earnings.week)} />
          <Earning label={copy(lang, 'This month', 'इस महीने')} value={formatCurrency(earnings.month)} />
          <Earning label={copy(lang, 'Open seats', 'खाली सीटें')} value={String(metrics.openSeats || trips.reduce((sum, trip) => sum + trip.frontSeatsLeft + trip.backSeatsLeft, 0))} />
          <Earning label={copy(lang, 'Bookings', 'बुकिंग')} value={String(metrics.bookings || trips.length)} />
        </div>
      </section>
      <section className="mt-5 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-card">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-heading text-[var(--text-primary)]">{copy(lang, 'Hotspots', 'हॉटस्पॉट')}</h2>
            <p className="text-small text-[var(--text-secondary)]">{copy(lang, 'Prioritized by available seats and route demand', 'खाली सीट और रूट डिमांड के आधार पर')}</p>
          </div>
          <Pill color="amber" label={`${metrics.activeRoutes || trips.length} ${copy(lang, 'routes', 'रूट')}`} />
        </div>
        <div className="mt-4 space-y-3">
          {trips.length === 0 ? (
            <p className="rounded-xl bg-[var(--surface-raised)] p-4 text-small text-[var(--text-secondary)]">
              {copy(lang, 'No hotspot data is available from the backend yet.', 'बैकेंड से अभी कोई हॉटस्पॉट डेटा उपलब्ध नहीं है।')}
            </p>
          ) : trips.slice(0, 3).map((trip) => (
            <div key={trip.id} className="flex items-center justify-between gap-3 rounded-xl bg-[var(--surface-raised)] p-3">
              <span className="text-small font-medium text-[var(--text-primary)]">
                {trip.from} → {trip.to}
              </span>
              <span className="text-small text-[var(--text-secondary)]">{trip.frontSeatsLeft + trip.backSeatsLeft} {copy(lang, 'seats', 'सीटें')}</span>
            </div>
          ))}
        </div>
      </section>
      <section className="mt-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-heading text-[var(--text-primary)]">{copy(lang, "Today's trips", 'आज की यात्राएं')}</h2>
          <Button size="sm" variant="secondary" onClick={() => router.push('/driver/offerings')}>
            {copy(lang, 'Offerings', 'ऑफरिंग')}
          </Button>
        </div>
        <div className="space-y-4">
          {loading ? (
            <SkeletonCard />
          ) : trips.filter((t) => t.status !== 'COMPLETED' && t.status !== 'CANCELLED').length === 0 ? (
            <p className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 text-small text-[var(--text-secondary)] shadow-card">
              {copy(lang, "No trips are scheduled for today.", 'आज कोई यात्रा निर्धारित नहीं है।')}
            </p>
          ) : (
            trips.filter((t) => t.status !== 'COMPLETED' && t.status !== 'CANCELLED').map((trip) => (
              <button key={trip.id} type="button" onClick={() => router.push(`/driver/trips/${trip.id}/manifest`)} className="w-full rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 text-left shadow-card">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-display text-heading text-[var(--text-primary)]">
                      {trip.from} → {trip.to}
                    </p>
                    <p className="mt-1 text-small text-[var(--text-secondary)]">{formatTime(trip.departureAt, lang)}</p>
                  </div>
                  <Pill color="teal" label={`${trip.frontSeatsLeft + trip.backSeatsLeft} ${copy(lang, 'open', 'खाली')}`} />
                </div>
              </button>
            ))
          )}
        </div>
      </section>
    </main>
  );
}

function ActiveTripBanner({ trip, lang, onOpen }: { trip: Trip; lang: 'en' | 'hi'; onOpen: (trip: Trip) => void }) {
  return (
    <div className="mt-5 overflow-hidden rounded-2xl shadow-card">
      {/* Pulse header */}
      <div className="flex items-center gap-2.5 bg-amber-500 px-4 py-2">
        <span className="h-2 w-2 animate-pulse rounded-full bg-white" />
        <p className="text-small font-semibold text-white">{copy(lang, 'TRIP IN PROGRESS', 'यात्रा जारी है')}</p>
      </div>
      {/* Details */}
      <div className="flex items-center justify-between gap-4 border border-t-0 border-amber-200 bg-amber-50 px-4 py-4">
        <div className="min-w-0">
          <p className="font-display text-heading text-[var(--text-primary)]">{trip.from} → {trip.to}</p>
          <p className="mt-0.5 text-small text-[var(--text-secondary)]">
            {formatTime(trip.departureAt, lang)} · {trip.vehicleNumber}
          </p>
          <div className="mt-2 flex items-center gap-2">
            <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800">
              {trip.frontSeatsLeft + trip.backSeatsLeft} {copy(lang, 'seats open', 'सीटें खाली')}
            </span>
          </div>
        </div>
        <Button size="sm" variant="primary" onClick={() => onOpen(trip)}>
          {copy(lang, 'Manifest', 'मैनिफेस्ट')}
        </Button>
      </div>
    </div>
  );
}

function Earning({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-[var(--surface-raised)] p-4">
      <p className="text-small text-[var(--text-secondary)]">{label}</p>
      <p className="mt-1 font-display text-heading text-[var(--text-primary)]">{value}</p>
    </div>
  );
}
