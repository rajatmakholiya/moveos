'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../../../lib/AuthContext';
import { api, type ApiError } from '../../../../lib/api';
import { Button } from '../../../../components/ui/Button';
import { DriverAuthLoading, DriverAuthRequired } from '../../../../components/DriverAuthState';

// ─── Inline SVG icons ─────────────────────────────────────────────────────────
function Ico({ d, className }: { d: string; className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
      dangerouslySetInnerHTML={{ __html: d }} />
  );
}
const Car = ({ className }: { className?: string }) =>
  <Ico d='<path d="M5 17H3a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v5a2 2 0 0 1-2 2h-2"/><circle cx="7" cy="17" r="2"/><circle cx="17" cy="17" r="2"/>' className={className} />;
const AlertCircle = ({ className }: { className?: string }) =>
  <Ico d='<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12" y2="16"/>' className={className} />;
const CheckCircle = ({ className }: { className?: string }) =>
  <Ico d='<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>' className={className} />;

const VEHICLE_TYPES = [
  'Bolero', 'Innova', 'Innova Crysta', 'Traveller', 'Tempo Traveller',
  'Maruti Omni', 'Force Gurkha', 'Mahindra Scorpio', 'Thar', 'Other',
];

export default function VehicleRegistrationPage() {
  const router = useRouter();
  const { user, token, isReady } = useAuth();
  const [plate, setPlate] = useState('');
  const [vehicleType, setVehicleType] = useState('');
  const [customType, setCustomType] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  if (!isReady) return <DriverAuthLoading />;
  if (!user || user.role !== 'DRIVER') return <DriverAuthRequired />;

  const plateError = () => {
    const p = plate.trim().toUpperCase().replace(/\s/g, '');
    if (!p) return 'Vehicle registration plate is required.';
    if (!/^[A-Z]{2}\d{2}[A-Z]{1,2}\d{4}$/.test(p)) return 'Enter a valid Indian plate, e.g. UK05TA1234.';
    return '';
  };

  const handleSubmit = async () => {
    const pErr = plateError();
    const type = vehicleType === 'Other' ? customType.trim() : vehicleType;
    if (pErr) { setError(pErr); return; }
    if (!type) { setError('Please select a vehicle type.'); return; }
    setSaving(true);
    setError('');
    try {
      await api.post(
        '/driver/onboarding/vehicle',
        { plate: plate.trim().toUpperCase().replace(/\s/g, ''), type },
        token ?? undefined,
      );
      setSuccess(true);
    } catch (err) {
      const e = err as ApiError;
      const code = (e?.details as any)?.error_code ?? '';
      if (code === 'vehicle_already_registered') {
        setError('You already have a vehicle registered for review. Continue to submit your application.');
        setSuccess(true);
      } else if (code === 'plate_already_exists') {
        setError('A vehicle with this plate is already registered in the system. Contact support if this is your vehicle.');
      } else {
        setError(e?.message ?? 'Failed to register vehicle. Please try again.');
      }
    } finally {
      setSaving(false);
    }
  };

  if (success) {
    return (
      <main className="min-h-screen bg-[var(--surface-raised)] px-5 pb-24 pt-5">
        <div className="flex flex-col items-center text-center mt-12">
          <div className="h-16 w-16 rounded-2xl bg-[var(--teal-50)] flex items-center justify-center mb-4">
            <CheckCircle className="h-8 w-8 text-[var(--brand)]" />
          </div>
          <h1 className="font-display text-title text-[var(--text-primary)]">Vehicle Registered</h1>
          <p className="text-body text-[var(--text-secondary)] mt-2 max-w-xs">
            Your vehicle has been submitted for compliance review. Complete your profile to proceed.
          </p>
          {error && (
            <p className="mt-3 rounded-xl bg-amber-50 border border-amber-200 px-4 py-2.5 text-small text-amber-700">
              {error}
            </p>
          )}
          <Button className="mt-6" fullWidth onClick={() => router.push('/driver/onboarding/profile')}>
            Back to Profile & Submit
          </Button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[var(--surface-raised)] px-5 pb-24 pt-5">
      <header className="mb-6">
        <div className="h-12 w-12 rounded-2xl bg-[var(--brand-light)] flex items-center justify-center mb-3">
          <Car className="h-6 w-6 text-[var(--brand)]" />
        </div>
        <h1 className="font-display text-title text-[var(--text-primary)]">Register Your Vehicle</h1>
        <p className="text-small text-[var(--text-secondary)] mt-1">
          Your vehicle will be reviewed by our compliance team before you can start accepting rides.
        </p>
      </header>

      <div className="space-y-5">
        <div>
          <label className="block text-small font-medium text-[var(--text-primary)] mb-1.5">
            Vehicle Registration Plate <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={plate}
            placeholder="e.g. UK05TA1234"
            maxLength={12}
            onChange={(e) => setPlate(e.target.value.toUpperCase())}
            className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-body font-mono text-[var(--text-primary)] outline-none focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--teal-100)] transition"
          />
          <p className="mt-1 text-xs text-[var(--text-secondary)]">Standard Indian format, e.g. UK05TA1234</p>
        </div>

        <div>
          <label className="block text-small font-medium text-[var(--text-primary)] mb-1.5">
            Vehicle Type <span className="text-red-500">*</span>
          </label>
          <div className="grid grid-cols-2 gap-2">
            {VEHICLE_TYPES.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => { setVehicleType(t); if (t !== 'Other') setCustomType(''); }}
                className={[
                  'rounded-xl border px-3 py-2.5 text-small font-medium text-left transition',
                  vehicleType === t
                    ? 'border-[var(--brand)] bg-[var(--brand-light)] text-[var(--brand)]'
                    : 'border-[var(--border)] bg-[var(--surface)] text-[var(--text-primary)]',
                ].join(' ')}
              >
                {t}
              </button>
            ))}
          </div>
          {vehicleType === 'Other' && (
            <input
              type="text"
              value={customType}
              placeholder="Enter vehicle type"
              onChange={(e) => setCustomType(e.target.value)}
              className="mt-3 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-body text-[var(--text-primary)] outline-none focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--teal-100)] transition"
            />
          )}
        </div>

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 flex items-start gap-2">
            <AlertCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
            <p className="text-small text-red-600">{error}</p>
          </div>
        )}

        <Button fullWidth onClick={() => void handleSubmit()} disabled={saving}>
          {saving ? 'Registering…' : 'Register Vehicle'}
        </Button>
        <Button fullWidth variant="ghost" onClick={() => router.push('/driver/onboarding/profile')}>
          ← Back to Profile
        </Button>
      </div>
    </main>
  );
}
