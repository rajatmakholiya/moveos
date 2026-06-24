'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, type ApiError } from '../../../lib/api';
import { useAuth } from '../../../lib/AuthContext';
import { tx } from '../../../lib/i18n';
import { useLanguage } from '../../../lib/LanguageContext';
import { parseRoutes, type RouteOption } from '../../../lib/pahadi';
import { addDays, copy, formatDate, readString, toIsoDate } from '../../../lib/utils';
import { BottomSheet } from '../../../components/ui/BottomSheet';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { LanguageToggle } from '../../../components/ui/LanguageToggle';
import { Pill } from '../../../components/ui/Pill';
import { DriverAuthLoading, DriverAuthRequired } from '../../../components/DriverAuthState';

type LuggagePolicy = 'FREE' | 'SURCHARGE';

type VehicleOption = {
  id: string;
  vehicleId: string;
  type: string | null;
  plate: string | null;
  status: string;
  active: boolean;
};

type FormState = {
  route: RouteOption | null;
  vehicle: VehicleOption | null;
  date: string;
  hour: number;
  minute: number;
  frontSeats: number;
  backSeats: number;
  pickupPoint: string;
  luggagePolicy: LuggagePolicy;
  notes: string;
};

const initialForm: FormState = {
  route: null,
  vehicle: null,
  date: toIsoDate(addDays(new Date(), 1)),
  hour: 8,
  minute: 30,
  frontSeats: 1,
  backSeats: 3,
  pickupPoint: '',
  luggagePolicy: 'FREE',
  notes: '',
};

function isApiError(value: unknown): value is ApiError {
  return typeof value === 'object' && value !== null && 'code' in value;
}

function departureDate(form: FormState) {
  const [year, month, day] = form.date.split('-').map(Number);
  const date = new Date(year, month - 1, day, form.hour, form.minute, 0, 0);
  return date;
}

export default function DriverPostTripPage() {
  const router = useRouter();
  const { lang } = useLanguage();
  const { user, token, isReady } = useAuth();
  const [routes, setRoutes] = useState<RouteOption[]>([]);
  const [vehicles, setVehicles] = useState<VehicleOption[]>([]);
  const [form, setForm] = useState<FormState>(initialForm);
  const [routeSheetOpen, setRouteSheetOpen] = useState(false);
  const [vehicleSheetOpen, setVehicleSheetOpen] = useState(false);
  const [dateSheetOpen, setDateSheetOpen] = useState(false);
  const [timeSheetOpen, setTimeSheetOpen] = useState(false);
  const [error, setError] = useState('');
  const [duplicateTripId, setDuplicateTripId] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isReady) {
      return;
    }
    if (user && user.role !== 'DRIVER') {
      router.replace('/');
    }
  }, [isReady, router, user]);

  useEffect(() => {
    let active = true;
    async function loadRoutes() {
      try {
        const response = await api.get<unknown>('/routes');
        if (active) {
          const nextRoutes = parseRoutes(response);
          setRoutes(nextRoutes);
          setForm((current) => ({ ...current, route: nextRoutes.find((route) => route.id === current.route?.id) ?? nextRoutes[0] ?? null }));
        }
      } catch {
        if (active) setRoutes([]);
      }
    }
    void loadRoutes();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!token) return;
    let active = true;
    async function loadVehicles() {
      try {
        const response = await api.get<{ data?: { vehicles?: unknown[] }; vehicles?: unknown[] }>('/drivers/me/vehicles', token ?? undefined);
        if (!active) return;
        const rawVehicles = Array.isArray(response?.data?.vehicles)
          ? response.data!.vehicles!
          : Array.isArray(response?.vehicles)
            ? response.vehicles
            : [];
        const parsed: VehicleOption[] = rawVehicles.flatMap((item) => {
          const a = item as Record<string, unknown>;
          const v = (a.vehicle ?? {}) as Record<string, unknown>;
          if (typeof a.vehicleId !== 'string' || a.status !== 'ACTIVE') return [];
          return [{
            id: typeof a.id === 'string' ? a.id : String(a.vehicleId),
            vehicleId: a.vehicleId,
            type: typeof v.type === 'string' ? v.type : null,
            plate: typeof v.plate === 'string' ? v.plate : null,
            status: String(a.status),
            active: a.active === true,
          }];
        });
        setVehicles(parsed);
        setForm((current) => {
          const preselect = parsed.find((v) => v.active) ?? parsed[0] ?? null;
          return current.vehicle ? current : { ...current, vehicle: preselect };
        });
      } catch {
        if (active) setVehicles([]);
      }
    }
    void loadVehicles();
    return () => { active = false; };
  }, [token]);

  const departure = useMemo(() => departureDate(form), [form]);
  const departureError = departure.getTime() - Date.now() < 2 * 60 * 60 * 1000 ? copy(lang, 'Departure must be at least 2 hours from now', 'प्रस्थान अभी से कम से कम 2 घंटे बाद होना चाहिए') : '';
  const routeError = form.route ? '' : copy(lang, 'Route is required', 'मार्ग आवश्यक है');
  const vehicleError = form.vehicle ? '' : copy(lang, 'Vehicle is required', 'वाहन आवश्यक है');
  const pickupError = form.pickupPoint.trim() ? '' : copy(lang, 'Pickup point is required', 'पिकअप स्थान आवश्यक है');

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setDuplicateTripId('');

    if (routeError || vehicleError || departureError || pickupError) {
      setError(routeError || vehicleError || departureError || pickupError);
      return;
    }

    setLoading(true);
    try {
      const response = await api.post<unknown>(
        '/driver/trips',
        {
          routeId: form.route?.id,
          vehicleId: form.vehicle?.vehicleId,
          departureAt: departure.toISOString(),
          frontSeatsTotal: form.frontSeats,
          backSeatsTotal: form.backSeats,
          departurePoint: form.pickupPoint.trim(),
          luggagePolicy: form.luggagePolicy,
          notes: form.notes.trim() || undefined,
        },
        token ?? undefined,
      );
      const tripId = readString(response, ['tripId', 'id']);
      if (!tripId) {
        throw { code: 'HTTP_ERROR', message: copy(lang, 'Trip response did not include a trip ID.', 'यात्रा रिस्पॉन्स में यात्रा ID नहीं मिली।') };
      }
      router.replace(`/driver/trips/${tripId}/manifest`);
    } catch (caught) {
      if (isApiError(caught) && caught.status === 409) {
        const tripId = readString(caught.details, ['tripId', 'id']);
        setDuplicateTripId(tripId);
        setError(copy(lang, 'You already have a trip on this route at this time.', 'इस मार्ग और समय पर आपकी यात्रा पहले से है।'));
      } else {
        setError(isApiError(caught) ? caught.message : copy(lang, 'Could not post trip. Please try again.', 'यात्रा पोस्ट नहीं हो सकी। फिर कोशिश करें।'));
      }
    } finally {
      setLoading(false);
    }
  };

  if (!isReady) {
    return <DriverAuthLoading />;
  }

  if (!user || user.role !== 'DRIVER') {
    return <DriverAuthRequired />;
  }

  return (
    <main className="min-h-screen bg-[var(--surface-raised)] px-5 pb-[calc(5rem+env(safe-area-inset-bottom))] pt-5">
      <header className="flex items-center justify-between gap-4">
        <button type="button" onClick={() => router.back()} className="flex h-11 w-11 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface)]" aria-label={copy(lang, 'Back', 'वापस')}>
          ←
        </button>
        <h1 className="font-display text-heading text-[var(--text-primary)]">{tx('driverPost', lang)}</h1>
        <LanguageToggle />
      </header>
      <form onSubmit={submit} className="mt-5 space-y-5">
        <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-card">
          <FieldButton label={tx('driverRoute', lang)} value={form.route ? `${form.route.from} → ${form.route.to}` : copy(lang, 'Select route', 'मार्ग चुनें')} onClick={() => setRouteSheetOpen(true)} />
          <FieldButton label={copy(lang, 'Vehicle', 'वाहन')} value={form.vehicle ? `${form.vehicle.type ?? ''} · ${form.vehicle.plate ?? ''}`.trim().replace(/^·\s*|·\s*$/, '') || copy(lang, 'Select vehicle', 'वाहन चुनें') : copy(lang, 'Select vehicle', 'वाहन चुनें')} onClick={() => setVehicleSheetOpen(true)} />
          <FieldButton label={copy(lang, 'Date', 'तारीख')} value={formatDate(form.date, lang)} onClick={() => setDateSheetOpen(true)} />
          <FieldButton label={copy(lang, 'Time', 'समय')} value={`${String(form.hour).padStart(2, '0')}:${String(form.minute).padStart(2, '0')}`} onClick={() => setTimeSheetOpen(true)} />
          {departureError ? <p className="mt-2 text-small font-medium text-[var(--red-600)]">{departureError}</p> : null}
        </section>
        <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-card">
          <h2 className="font-display text-heading text-[var(--text-primary)]">{copy(lang, 'Seats', 'सीटें')}</h2>
          <Stepper label={tx('driverFrontSeats', lang)} value={form.frontSeats} min={0} max={1} onChange={(frontSeats) => setForm((current) => ({ ...current, frontSeats }))} />
          <Stepper label={tx('driverBackSeats', lang)} value={form.backSeats} min={1} max={4} onChange={(backSeats) => setForm((current) => ({ ...current, backSeats }))} />
        </section>
        <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-card">
          <Input label={tx('driverPoint', lang)} value={form.pickupPoint} error={pickupError} placeholder={copy(lang, 'Enter exact pickup point', 'सटीक पिकअप स्थान दर्ज करें')} onChange={(event) => setForm((current) => ({ ...current, pickupPoint: event.target.value }))} />
          <div className="mt-4 overflow-hidden rounded-xl bg-[var(--teal-50)]">
            <svg viewBox="0 0 320 120" className="h-28 w-full" aria-hidden="true">
              <path d="M0 90L70 30L112 68L164 22L246 88L320 52V120H0Z" fill="var(--teal-100)" />
              <path d="M134 120C145 91 162 70 184 54C202 74 219 96 230 120H134Z" fill="var(--brand)" />
              <circle cx="178" cy="54" r="9" fill="var(--red-600)" />
            </svg>
          </div>
        </section>
        <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-card">
          <h2 className="font-display text-heading text-[var(--text-primary)]">{tx('driverLuggage', lang)}</h2>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <Choice selected={form.luggagePolicy === 'FREE'} title={copy(lang, 'Free for passengers', 'यात्रियों के लिए मुफ्त')} onClick={() => setForm((current) => ({ ...current, luggagePolicy: 'FREE' }))} />
            <Choice selected={form.luggagePolicy === 'SURCHARGE'} title={copy(lang, 'Surcharge applies', 'अतिरिक्त शुल्क लगेगा')} onClick={() => setForm((current) => ({ ...current, luggagePolicy: 'SURCHARGE' }))} />
          </div>
          {form.luggagePolicy === 'SURCHARGE' ? <p className="mt-3 rounded-xl bg-[var(--amber-50)] px-3 py-2 text-small text-[var(--stone-800)]">{copy(lang, 'Large bag: ₹50 · Oversized: ₹150', 'बड़ा बैग: ₹50 · बड़ा सामान: ₹150')}</p> : null}
        </section>
        <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-card">
          <label className="font-display text-heading text-[var(--text-primary)]" htmlFor="driver-notes">
            {tx('driverNotes', lang)}
          </label>
          <textarea
            id="driver-notes"
            maxLength={200}
            value={form.notes}
            onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
            className="mt-3 min-h-28 w-full resize-none rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 text-body outline-none focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--teal-100)]"
          />
          <p className="mt-1 text-right text-micro text-[var(--text-secondary)]">{form.notes.length}/200</p>
        </section>
        {error ? (
          <div className="rounded-xl bg-[var(--red-50)] px-4 py-3 text-small font-medium text-[var(--red-600)]">
            {error}
            {duplicateTripId ? (
              <button type="button" className="ml-2 underline" onClick={() => router.push(`/driver/trips/${duplicateTripId}/manifest`)}>
                {copy(lang, 'View existing trip', 'मौजूदा यात्रा देखें')}
              </button>
            ) : null}
          </div>
        ) : null}
        <Button type="submit" fullWidth loading={loading} disabled={loading || Boolean(routeError || vehicleError || departureError || pickupError)}>
          {tx('driverPostBtn', lang)}
        </Button>
      </form>
      <BottomSheet open={routeSheetOpen} onClose={() => setRouteSheetOpen(false)} title={tx('driverRoute', lang)}>
        <div className="space-y-3">
          {routes.length === 0 ? (
            <p className="rounded-xl bg-[var(--surface-raised)] p-4 text-small text-[var(--text-secondary)]">
              {copy(lang, 'No routes are available from the backend.', 'बैकेंड से कोई मार्ग उपलब्ध नहीं है।')}
            </p>
          ) : routes.map((route) => (
            <button
              key={route.id}
              type="button"
              onClick={() => {
                setForm((current) => ({ ...current, route }));
                setRouteSheetOpen(false);
              }}
              className="flex w-full items-center justify-between gap-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 text-left"
            >
              <span>
                <span className="block font-medium text-[var(--text-primary)]">
                  {route.from} → {route.to}
                </span>
                <span className="text-small text-[var(--text-secondary)]">
                  {route.durationHours} hrs · ~{route.distanceKm} km
                </span>
              </span>
              {route.id === form.route?.id ? <Pill color="teal" label={copy(lang, 'Selected', 'चयनित')} /> : null}
            </button>
          ))}
        </div>
      </BottomSheet>
      <BottomSheet open={vehicleSheetOpen} onClose={() => setVehicleSheetOpen(false)} title={copy(lang, 'Select vehicle', 'वाहन चुनें')}>
        <div className="space-y-3">
          {vehicles.length === 0 ? (
            <p className="rounded-xl bg-[var(--surface-raised)] p-4 text-small text-[var(--text-secondary)]">
              {copy(lang, 'No active vehicles assigned. Add a vehicle first.', 'कोई सक्रिय वाहन नहीं मिला। पहले वाहन जोड़ें।')}
            </p>
          ) : vehicles.map((vehicle) => (
            <button
              key={vehicle.id}
              type="button"
              onClick={() => {
                setForm((current) => ({ ...current, vehicle }));
                setVehicleSheetOpen(false);
              }}
              className="flex w-full items-center justify-between gap-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 text-left"
            >
              <span>
                <span className="block font-medium text-[var(--text-primary)]">{vehicle.type ?? copy(lang, 'Vehicle', 'वाहन')}</span>
                <span className="text-small text-[var(--text-secondary)]">{vehicle.plate ?? '—'}</span>
              </span>
              {vehicle.id === form.vehicle?.id ? <Pill color="teal" label={copy(lang, 'Selected', 'चयनित')} /> : vehicle.active ? <Pill color="amber" label={copy(lang, 'Active', 'सक्रिय')} /> : null}
            </button>
          ))}
        </div>
      </BottomSheet>
      <BottomSheet open={dateSheetOpen} onClose={() => setDateSheetOpen(false)} title={copy(lang, 'Departure date', 'प्रस्थान तारीख')}>
        <DateGrid selected={form.date} lang={lang} onSelect={(date) => {
          setForm((current) => ({ ...current, date }));
          setDateSheetOpen(false);
        }} />
      </BottomSheet>
      <BottomSheet open={timeSheetOpen} onClose={() => setTimeSheetOpen(false)} title={copy(lang, 'Departure time', 'प्रस्थान समय')}>
        <TimeGrid form={form} onChange={setForm} />
      </BottomSheet>
    </main>
  );
}

function FieldButton({ label, value, onClick }: { label: string; value: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="mb-3 flex min-h-[52px] w-full items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 text-left last:mb-0">
      <span>
        <span className="block text-micro uppercase text-[var(--text-secondary)]">{label}</span>
        <span className="font-medium text-[var(--text-primary)]">{value}</span>
      </span>
      <span className="text-[var(--text-secondary)]">⌄</span>
    </button>
  );
}

function Stepper({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (value: number) => void }) {
  return (
    <div className="mt-4 flex items-center justify-between gap-4">
      <span className="font-medium text-[var(--text-primary)]">{label}</span>
      <div className="flex items-center gap-3">
        <button type="button" disabled={value <= min} onClick={() => onChange(value - 1)} className="flex h-11 w-11 items-center justify-center rounded-full border border-[var(--border)] disabled:opacity-40">
          −
        </button>
        <span className="w-6 text-center font-display text-heading">{value}</span>
        <button type="button" disabled={value >= max} onClick={() => onChange(value + 1)} className="flex h-11 w-11 items-center justify-center rounded-full border border-[var(--border)] disabled:opacity-40">
          +
        </button>
      </div>
    </div>
  );
}

function Choice({ selected, title, onClick }: { selected: boolean; title: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={['min-h-[76px] rounded-xl border p-3 text-left text-small font-medium', selected ? 'border-[var(--brand)] bg-[var(--brand-light)] text-[var(--brand)]' : 'border-[var(--border)] bg-[var(--surface)] text-[var(--text-primary)]'].join(' ')}>
      {title}
    </button>
  );
}

function DateGrid({ selected, lang, onSelect }: { selected: string; lang: 'en' | 'hi'; onSelect: (date: string) => void }) {
  const today = new Date();
  const days = Array.from({ length: 31 }, (_, index) => addDays(today, index));
  return (
    <div className="grid grid-cols-7 gap-2">
      {days.map((date) => {
        const iso = toIsoDate(date);
        const isSelected = selected === iso;
        return (
          <button key={iso} type="button" onClick={() => onSelect(iso)} className={['flex aspect-square flex-col items-center justify-center rounded-full text-small', isSelected ? 'bg-[var(--brand)] text-white' : 'bg-[var(--surface-raised)] text-[var(--text-primary)]'].join(' ')}>
            <span>{new Intl.DateTimeFormat(lang === 'hi' ? 'hi-IN' : 'en-IN', { weekday: 'narrow' }).format(date)}</span>
            <span className="font-medium">{date.getDate()}</span>
          </button>
        );
      })}
    </div>
  );
}

function TimeGrid({ form, onChange }: { form: FormState; onChange: (form: FormState) => void }) {
  const hours = Array.from({ length: 18 }, (_, index) => index + 5);
  const minutes = [0, 15, 30, 45];
  return (
    <div className="grid grid-cols-2 gap-4">
      <div className="grid grid-cols-3 gap-2">
        {hours.map((hour) => (
          <button key={hour} type="button" onClick={() => onChange({ ...form, hour })} className={['rounded-xl px-3 py-2 text-small font-medium', hour === form.hour ? 'bg-[var(--brand)] text-white' : 'bg-[var(--surface-raised)] text-[var(--text-primary)]'].join(' ')}>
            {String(hour).padStart(2, '0')}
          </button>
        ))}
      </div>
      <div className="grid content-start grid-cols-2 gap-2">
        {minutes.map((minute) => (
          <button key={minute} type="button" onClick={() => onChange({ ...form, minute })} className={['rounded-xl px-3 py-2 text-small font-medium', minute === form.minute ? 'bg-[var(--brand)] text-white' : 'bg-[var(--surface-raised)] text-[var(--text-primary)]'].join(' ')}>
            {String(minute).padStart(2, '0')}
          </button>
        ))}
      </div>
    </div>
  );
}
