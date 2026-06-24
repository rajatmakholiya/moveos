'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, type ApiError } from '../../lib/api';
import { useAuth } from '../../lib/AuthContext';
import type { Lang } from '../../lib/i18n';
import { useLanguage } from '../../lib/LanguageContext';
import { copy, formatCurrency, formatPhone, readNumber, readString, safeRecord } from '../../lib/utils';
import { BottomSheet } from '../../components/ui/BottomSheet';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { LanguageToggle } from '../../components/ui/LanguageToggle';

type OrgContext = {
  id: string;
  type: 'INDIVIDUAL' | 'ORGANIZATION';
  label: string;
  activeVehicleCount: number;
  canOperate: boolean;
  blockedReasons?: Array<{ code: string; message: string; owner: 'DRIVER' | 'ORGANIZATION' | 'PLATFORM' }>;
};

type UploadSlot = {
  uploadUrl?: string;
  fileUrl?: string;
  fileUuid?: string;
};

// ─── KYC doc type → display label ────────────────────────────────────────────
const DRIVER_DOC_TYPES: Array<{ key: string; label: string; labelHi: string }> = [
  { key: 'DRIVING_LICENSE', label: 'License', labelHi: 'लाइसेंस' },
  { key: 'AADHAAR', label: 'Aadhaar', labelHi: 'आधार' },
];

const VEHICLE_DOC_TYPES: Array<{ key: string; label: string; labelHi: string }> = [
  { key: 'RC', label: 'RC', labelHi: 'RC' },
  { key: 'INSURANCE', label: 'Insurance', labelHi: 'इंश्योरेंस' },
  { key: 'PERMIT', label: 'Permit', labelHi: 'परमिट' },
];

export default function ProfilePage() {
  const router = useRouter();
  const { lang, setLang } = useLanguage();
  const { user, token, isReady, logout } = useAuth();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(user?.name ?? '');
  const [languageOpen, setLanguageOpen] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [account, setAccount] = useState<Record<string, unknown> | null>(null);
  const [walletPaise, setWalletPaise] = useState<number | null>(null);
  const [orgContexts, setOrgContexts] = useState<OrgContext[]>([]);
  const [vehicles, setVehicles] = useState<Record<string, unknown>[]>([]);
  const [vehiclePlate, setVehiclePlate] = useState('');
  const [vehicleType, setVehicleType] = useState('');
  const [profileError, setProfileError] = useState('');
  const [notificationStatus, setNotificationStatus] = useState('');
  const [documentStatus, setDocumentStatus] = useState('');
  const [vehicleStatus, setVehicleStatus] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  type PendingUpload =
    | { kind: 'vehicle'; vehicleId: string; type: string }
    | { kind: 'driver'; type: string };
  const pendingUploadRef = useRef<PendingUpload | null>(null);

  useEffect(() => {
    if (isReady && !user) {
      router.replace('/onboarding');
    }
  }, [isReady, router, user]);

  useEffect(() => {
    setName(user?.name ?? '');
  }, [user?.name]);

  useEffect(() => {
    if (!token || !user) {
      return;
    }

    let active = true;
    const currentUser = user;
    async function loadAccount() {
      setProfileError('');
      try {
        if (currentUser.role === 'DRIVER') {
          const [profile, wallet, vehicleResponse, ctxResponse] = await Promise.all([
            api.get<unknown>('/drivers/me', token ?? undefined),
            api.get<unknown>('/wallet/me/balance', token ?? undefined),
            api.get<unknown>('/drivers/me/vehicles', token ?? undefined),
            api.get<unknown>('/drivers/me/operating-contexts', token ?? undefined).catch(() => null),
          ]);
          if (active) {
            const profileRecord = safeRecord(profile);
            const driverData = safeRecord(profileRecord?.data) ?? profileRecord;
            setAccount(driverData);
            const walletRecord = safeRecord(wallet);
            const walletData = safeRecord(walletRecord?.data) ?? walletRecord;
            setWalletPaise(readNumber(safeRecord(walletData?.wallet) ?? walletData, ['balance'], 0));
            const vehicleRecord = safeRecord(vehicleResponse);
            const rawVehicles = safeRecord(vehicleRecord?.data)?.vehicles ?? vehicleRecord?.vehicles;
            setVehicles(toRecords(rawVehicles));
            const ctxRecord = safeRecord(ctxResponse);
            const rawContexts = safeRecord(ctxRecord?.data)?.contexts ?? ctxRecord?.contexts;
            setOrgContexts(Array.isArray(rawContexts) ? (rawContexts as OrgContext[]) : []);
          }
          return;
        }

        const profile = await api.get<unknown>('/passenger/me', token ?? undefined);
        if (active) {
          setAccount(safeRecord(profile));
        }
      } catch (caught) {
        if (active) {
          setProfileError(isApiError(caught) ? caught.message : copy(lang, 'Could not load account details.', 'अकाउंट विवरण लोड नहीं हो सके।'));
        }
      }
    }

    void loadAccount();
    return () => {
      active = false;
    };
  }, [lang, token, user]);

  const registerNotifications = async () => {
    if (!token) return;
    try {
      let permission = 'default';
      if ('Notification' in window) {
        permission = await Notification.requestPermission();
      }
      const key = 'pahadi_device_token';
      const existing = window.localStorage.getItem(key);
      const nextToken = existing ?? `web-${crypto.randomUUID()}`;
      window.localStorage.setItem(key, nextToken);
      await api.post('/notifications/device-token', { token: nextToken }, token);
      setNotificationStatus(permission === 'denied' ? copy(lang, 'Saved, but browser notifications are blocked.', 'सेव हो गया, लेकिन ब्राउज़र नोटिफिकेशन बंद हैं।') : copy(lang, 'Notifications enabled for this device.', 'इस डिवाइस पर नोटिफिकेशन चालू हैं।'));
    } catch (caught) {
      setNotificationStatus(isApiError(caught) ? caught.message : copy(lang, 'Could not enable notifications.', 'नोटिफिकेशन चालू नहीं हो सके।'));
    }
  };

  const startDocumentUpload = (kind: 'driver' | 'vehicle', type: string, vehicleId?: string) => {
    if (!token) return;
    pendingUploadRef.current = kind === 'vehicle' ? { kind, vehicleId: vehicleId!, type } : { kind, type };
    fileInputRef.current?.click();
  };

  const handleFileSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    const pending = pendingUploadRef.current;
    pendingUploadRef.current = null;
    if (!file || !pending || !token) return;

    const setStatus = pending.kind === 'vehicle' ? setVehicleStatus : setDocumentStatus;
    setStatus(copy(lang, 'Uploading…', 'अपलोड हो रहा है…'));

    try {
      if (pending.kind === 'vehicle') {
        const slotResponse = await api.post<UploadSlot | { data?: UploadSlot }>(
          `/drivers/me/vehicles/${pending.vehicleId}/documents/upload-request`,
          { type: pending.type, filename: file.name },
          token,
        );
        const slot = normalizeUploadSlot(slotResponse);
        await api.post(
          `/drivers/me/vehicles/${pending.vehicleId}/documents`,
          { type: pending.type, url: slot.fileUrl },
          token,
        );
        setVehicleStatus(copy(lang, 'Document uploaded.', 'डॉक्यूमेंट अपलोड हो गया।'));
        await refreshVehicles();
      } else {
        const slotResponse = await api.post<UploadSlot | { data?: UploadSlot }>(
          '/drivers/me/documents/upload-request',
          { type: pending.type, filename: file.name },
          token,
        );
        const slot = normalizeUploadSlot(slotResponse);
        await api.post('/drivers/me/documents', { type: pending.type, url: slot.fileUrl }, token);
        setDocumentStatus(copy(lang, 'Document uploaded.', 'डॉक्यूमेंट अपलोड हो गया।'));
      }
    } catch (caught) {
      setStatus(isApiError(caught) ? caught.message : copy(lang, 'Upload failed. Please try again.', 'अपलोड विफल हुआ। फिर कोशिश करें।'));
    }
  };

  const refreshVehicles = async () => {
    if (!token) return;
    const vehicleResponse = await api.get<unknown>('/drivers/me/vehicles', token);
    const vehicleRecord = safeRecord(vehicleResponse);
    const rawVehicles = safeRecord(vehicleRecord?.data)?.vehicles ?? vehicleRecord?.vehicles;
    setVehicles(toRecords(rawVehicles));
  };

  const createVehicle = async () => {
    if (!token || !vehiclePlate.trim() || !vehicleType.trim()) {
      setVehicleStatus(copy(lang, 'Enter vehicle number and type.', 'वाहन नंबर और टाइप डालें।'));
      return;
    }
    try {
      await api.post('/drivers/me/vehicles', { plate: vehiclePlate, type: vehicleType }, token);
      setVehiclePlate('');
      setVehicleType('');
      setVehicleStatus(copy(lang, 'Vehicle added. Complete vehicle KYC before activation.', 'वाहन जुड़ गया। एक्टिव करने से पहले वाहन KYC पूरी करें।'));
      await refreshVehicles();
    } catch (caught) {
      setVehicleStatus(isApiError(caught) ? caught.message : copy(lang, 'Could not add vehicle.', 'वाहन नहीं जुड़ सका।'));
    }
  };

  const activateVehicle = async (vehicleId: string) => {
    if (!token) return;
    try {
      await api.post('/drivers/me/vehicles/active', { vehicleId }, token);
      setVehicleStatus(copy(lang, 'Active vehicle updated.', 'एक्टिव वाहन अपडेट हो गया।'));
      await refreshVehicles();
    } catch (caught) {
      setVehicleStatus(isApiError(caught) ? caught.message : copy(lang, 'Could not activate vehicle.', 'वाहन एक्टिव नहीं हो सका।'));
    }
  };

  // ─── Derived values ────────────────────────────────────────────────────────
  const initials = (user?.name ?? 'Pahadi Rides')
    .split(/\s+/).filter(Boolean).slice(0, 2)
    .map((part) => part[0]?.toUpperCase()).join('');
  const accountUser = safeRecord(account?.user);
  const accountName = readString(accountUser ?? account, ['name'], user?.name ?? copy(lang, 'Guest user', 'अतिथि'));
  const accountPhone = readString(accountUser ?? account, ['phone'], user?.phone ?? '');
  const driverStatus = readString(account, ['status']);
  const driverKyc = readString(account, ['kycStatus']);
  const activeVehicle = vehicles.find((a) => Boolean(a.active));

  // Personal details
  const dob = readString(account, ['dob']);
  const age = dob ? Math.floor((Date.now() - new Date(dob).getTime()) / (365.25 * 24 * 60 * 60 * 1000)) : null;
  const bloodGroup = readString(account, ['bloodGroup']);
  const gender = readString(account, ['gender']);
  const alternatePhone = readString(account, ['alternatePhone']);
  const emergencyContactName = readString(account, ['emergencyContactName']);
  const emergencyContactPhone = readString(account, ['emergencyContactPhone']);

  // KYC documents from profile
  const kycRecords = Array.isArray(account?.kycRecords) ? (account.kycRecords as Record<string, unknown>[]) : [];

  // Org membership
  const isOrgDriver = orgContexts.some((c) => c.type === 'ORGANIZATION');

  return (
    <main className="min-h-screen bg-[var(--surface-raised)] px-5 pb-[calc(5rem+env(safe-area-inset-bottom))] pt-5">
      <header className="flex items-center justify-between gap-4">
        <h1 className="font-display text-title text-[var(--text-primary)]">{copy(lang, 'Profile', 'प्रोफाइल')}</h1>
        <LanguageToggle />
      </header>

      {/* ── Profile card ──────────────────────────────────────────────────────── */}
      <section className="mt-5 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-card">
        <div className="flex items-center gap-4">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-[var(--brand)] font-display text-title text-white">
            {initials || 'PR'}
          </div>
          <div className="min-w-0 flex-1">
            {editing ? (
              <Input label={copy(lang, 'Your name', 'आपका नाम')} value={name} onChange={(e) => setName(e.target.value)} />
            ) : (
              <>
                <h2 className="truncate font-display text-heading text-[var(--text-primary)]">{accountName}</h2>
                <p className="text-small text-[var(--text-secondary)]">
                  {accountPhone ? formatPhone(accountPhone) : copy(lang, 'Sign in to manage rides', 'राइड मैनेज करने के लिए साइन इन करें')}
                </p>
              </>
            )}
          </div>
        </div>

        {profileError ? (
          <p className="mt-3 rounded-xl bg-[var(--red-50)] px-3 py-2 text-small text-[var(--red-600)]">{profileError}</p>
        ) : null}

        {user?.role === 'DRIVER' ? (
          <div className="mt-4 grid grid-cols-3 gap-3 rounded-xl bg-[var(--surface-raised)] p-3 text-small">
            <ProfileStat label={copy(lang, 'Status', 'स्थिति')} value={driverStatus || '-'} />
            <ProfileStat label={copy(lang, 'KYC', 'केवाईसी')} value={driverKyc || '-'} />
            <ProfileStat label={copy(lang, 'Wallet', 'वॉलेट')} value={walletPaise === null ? '-' : formatCurrency(walletPaise)} />
          </div>
        ) : null}

        {/* Personal details */}
        {user?.role === 'DRIVER' && (age !== null || bloodGroup || gender) ? (
          <div className="mt-3 grid grid-cols-3 gap-3 rounded-xl bg-[var(--surface-raised)] px-3 py-2.5 text-small">
            {age !== null ? <ProfileStat label={copy(lang, 'Age', 'उम्र')} value={`${age}y`} /> : null}
            {bloodGroup ? <ProfileStat label={copy(lang, 'Blood', 'रक्त')} value={bloodGroup} /> : null}
            {gender ? <ProfileStat label={copy(lang, 'Gender', 'लिंग')} value={gender === 'MALE' ? copy(lang, 'Male', 'पुरुष') : copy(lang, 'Female', 'महिला')} /> : null}
          </div>
        ) : null}

        {/* Alternate & emergency contact */}
        {user?.role === 'DRIVER' && (alternatePhone || emergencyContactName) ? (
          <div className="mt-3 space-y-1.5 rounded-xl bg-[var(--surface-raised)] px-3 py-2.5">
            {alternatePhone ? (
              <div className="flex items-center justify-between">
                <span className="text-micro uppercase text-[var(--text-secondary)]">{copy(lang, 'Alternate phone', 'वैकल्पिक फ़ोन')}</span>
                <span className="text-small font-medium text-[var(--text-primary)]">{formatPhone(alternatePhone)}</span>
              </div>
            ) : null}
            {emergencyContactName ? (
              <div className="flex items-center justify-between">
                <span className="text-micro uppercase text-[var(--text-secondary)]">{copy(lang, 'Emergency contact', 'आपातकालीन संपर्क')}</span>
                <span className="text-small font-medium text-[var(--text-primary)]">{emergencyContactName} · {emergencyContactPhone ? formatPhone(emergencyContactPhone) : ''}</span>
              </div>
            ) : null}
          </div>
        ) : null}

        <Button className="mt-4" fullWidth variant="secondary" onClick={() => setEditing((v) => !v)}>
          {editing ? copy(lang, 'Done', 'हो गया') : copy(lang, 'Edit profile', 'प्रोफाइल संपादित करें')}
        </Button>
      </section>

      {/* ── Organization memberships ──────────────────────────────────────────── */}
      {user?.role === 'DRIVER' && orgContexts.filter((c) => c.type === 'ORGANIZATION').length > 0 ? (
        <section className="mt-5 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-card">
          <h2 className="font-display text-heading text-[var(--text-primary)]">{copy(lang, 'Organization', 'संगठन')}</h2>
          <p className="mt-1 text-small text-[var(--text-secondary)]">{copy(lang, 'Fleet you are part of', 'जिस फ्लीट से आप जुड़े हैं')}</p>
          <div className="mt-4 space-y-3">
            {orgContexts.filter((c) => c.type === 'ORGANIZATION').map((ctx) => (
              <div key={ctx.id} className="rounded-xl border border-[var(--border)] p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-[var(--text-primary)]">{ctx.label}</p>
                    <p className="text-small text-[var(--text-secondary)]">{ctx.activeVehicleCount} {copy(lang, 'active vehicles', 'एक्टिव वाहन')}</p>
                  </div>
                  <span className={['shrink-0 rounded-full px-2 py-1 text-micro font-semibold uppercase', ctx.canOperate ? 'bg-[var(--brand-light)] text-[var(--brand)]' : 'bg-[var(--surface-raised)] text-[var(--text-secondary)]'].join(' ')}>
                    {ctx.canOperate ? copy(lang, 'Ready', 'तैयार') : copy(lang, 'Blocked', 'ब्लॉक')}
                  </span>
                </div>
                {!ctx.canOperate && ctx.blockedReasons && ctx.blockedReasons.length > 0 ? (
                  <div className="mt-2 space-y-1">
                    {ctx.blockedReasons.map((r, i) => (
                      <p key={i} className="text-small text-[var(--red-600)]">{r.message}</p>
                    ))}
                    <button type="button" onClick={() => router.push('/driver/onboarding/profile')} className="mt-2 text-small font-medium text-[var(--brand)] underline">
                      {copy(lang, 'Complete your profile →', 'प्रोफाइल पूरी करें →')}
                    </button>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {/* ── Driver documents ──────────────────────────────────────────────────── */}
      {user?.role === 'DRIVER' ? (
        <section className="mt-5 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-card">
          <h2 className="font-display text-heading text-[var(--text-primary)]">{copy(lang, 'Driver documents', 'ड्राइवर डॉक्यूमेंट')}</h2>
          <p className="mt-1 text-small text-[var(--text-secondary)]">{copy(lang, 'Documents submitted during KYC', 'KYC के दौरान जमा किए गए डॉक्यूमेंट')}</p>
          <div className="mt-3 divide-y divide-[var(--border)]">
            {DRIVER_DOC_TYPES.map(({ key, label, labelHi }) => {
              const rec = kycRecords.find((r) => readString(r, ['documentType']) === key);
              const url = rec ? readString(rec, ['documentUrl']) : undefined;
              const status = rec ? readString(rec, ['status']) : undefined;
              return (
                <DocRow
                  key={key}
                  label={copy(lang, label, labelHi)}
                  url={url}
                  status={status}
                  lang={lang}
                  onUpload={() => startDocumentUpload('driver', key)}
                />
              );
            })}
          </div>
          {documentStatus ? <p className="mt-3 text-small text-[var(--text-secondary)]">{documentStatus}</p> : null}
        </section>
      ) : null}

      {/* ── Vehicles ─────────────────────────────────────────────────────────── */}
      {user?.role === 'DRIVER' ? (
        <section className="mt-5 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-card">
          <div className="mb-4">
            <h2 className="font-display text-heading text-[var(--text-primary)]">{copy(lang, 'Vehicles', 'वाहन')}</h2>
            <p className="mt-1 text-small text-[var(--text-secondary)]">
              {activeVehicle
                ? copy(lang, `Active: ${vehicleLabel(activeVehicle)}`, `एक्टिव: ${vehicleLabel(activeVehicle)}`)
                : copy(lang, 'No active vehicle assigned', 'कोई एक्टिव वाहन असाइन नहीं है')}
            </p>
          </div>

          {/* Add vehicle form — only for independent drivers */}
          {!isOrgDriver ? (
            <div className="mb-4 grid gap-3">
              <Input label={copy(lang, 'Vehicle number', 'वाहन नंबर')} value={vehiclePlate} onChange={(e) => setVehiclePlate(e.target.value)} />
              <Input label={copy(lang, 'Vehicle type', 'वाहन टाइप')} value={vehicleType} onChange={(e) => setVehicleType(e.target.value)} />
              <Button variant="secondary" onClick={() => void createVehicle()}>{copy(lang, 'Add vehicle', 'वाहन जोड़ें')}</Button>
            </div>
          ) : null}

          {/* Vehicle list */}
          <div className="space-y-4">
            {vehicles.map((assignment) => {
              const vehicle = safeRecord(assignment.vehicle);
              const vehicleId = readString(vehicle, ['id']);
              const active = Boolean(assignment.active);
              const isOrgVehicle = typeof assignment.ownershipContext === 'string' && assignment.ownershipContext.startsWith('ORG:');
              const vehicleDocs = toRecords(vehicle?.documents);

              return (
                <div key={readString(assignment, ['id'], vehicleId)} className="rounded-xl border border-[var(--border)] p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-[var(--text-primary)]">{vehicleLabel(assignment)}</p>
                      <p className="text-small text-[var(--text-secondary)]">
                        KYC: {readString(vehicle, ['kycStatus'], '-')} · Compliance: {readString(vehicle, ['complianceStatus'], '-')}
                      </p>
                    </div>
                    <span className={['shrink-0 rounded-full px-2 py-1 text-micro font-semibold uppercase', active ? 'bg-[var(--brand-light)] text-[var(--brand)]' : 'bg-[var(--surface-raised)] text-[var(--text-secondary)]'].join(' ')}>
                      {active ? copy(lang, 'Active', 'एक्टिव') : copy(lang, 'Linked', 'लिंक्ड')}
                    </span>
                  </div>

                  {/* Activate — only for own vehicles */}
                  {!isOrgVehicle && !active ? (
                    <div className="mt-3">
                      <Button size="sm" variant="secondary" fullWidth onClick={() => void activateVehicle(vehicleId)}>
                        {copy(lang, 'Set as active vehicle', 'एक्टिव वाहन बनाएं')}
                      </Button>
                    </div>
                  ) : null}

                  {/* Vehicle documents */}
                  <div className="mt-3 border-t border-[var(--border)] pt-3">
                    <p className="mb-1.5 text-micro font-semibold uppercase text-[var(--text-secondary)]">{copy(lang, 'Documents', 'डॉक्यूमेंट')}</p>
                    <div className="divide-y divide-[var(--border)]">
                      {VEHICLE_DOC_TYPES.map(({ key, label, labelHi }) => {
                        const doc = vehicleDocs.find((d) => readString(d, ['type']) === key);
                        const url = doc ? readString(doc, ['url']) : undefined;
                        const status = doc ? readString(doc, ['status']) : undefined;
                        return (
                          <DocRow
                            key={key}
                            label={copy(lang, label, labelHi)}
                            url={url}
                            status={status}
                            lang={lang}
                            readOnly={isOrgVehicle}
                            onUpload={() => startDocumentUpload('vehicle', key, vehicleId)}
                          />
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {vehicleStatus ? <p className="mt-3 text-small text-[var(--text-secondary)]">{vehicleStatus}</p> : null}
        </section>
      ) : null}

      {/* ── Menu ─────────────────────────────────────────────────────────────── */}
      <section className="mt-5 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-card">
        <MenuRow icon="▤" label={copy(lang, 'My bookings', 'मेरी बुकिंग')} onClick={() => router.push('/bookings')} />
        <MenuRow icon="□" label={copy(lang, 'My invoices', 'मेरे इनवॉइस')} onClick={() => router.push('/bookings')} />
        <MenuRow icon="!" label={notificationStatus || copy(lang, 'Enable notifications', 'नोटिफिकेशन चालू करें')} onClick={() => void registerNotifications()} />
        <MenuRow icon="◎" label={copy(lang, `Language: ${lang === 'hi' ? 'हिंदी' : 'English'}`, `भाषा: ${lang === 'hi' ? 'हिंदी' : 'English'}`)} onClick={() => setLanguageOpen(true)} />
        <MenuRow icon="?" label={copy(lang, 'Help & support', 'मदद और सपोर्ट')} />
        <MenuRow icon="i" label={copy(lang, 'About Pahadi Rides', 'पहाड़ी राइड्स के बारे में')} />
        <MenuRow icon="←" label={copy(lang, 'Log out', 'लॉग आउट')} danger onClick={() => setLogoutOpen(true)} />
      </section>

      {/* ── Sheets ───────────────────────────────────────────────────────────── */}
      <BottomSheet open={languageOpen} onClose={() => setLanguageOpen(false)} title={copy(lang, 'Select language', 'भाषा चुनें')}>
        <div className="space-y-3">
          <LanguageChoice label="English" selected={lang === 'en'} onClick={() => setLang('en')} />
          <LanguageChoice label="हिंदी" selected={lang === 'hi'} onClick={() => setLang('hi')} />
        </div>
      </BottomSheet>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,application/pdf"
        className="hidden"
        onChange={(e) => void handleFileSelected(e)}
      />

      <BottomSheet open={logoutOpen} onClose={() => setLogoutOpen(false)} title={copy(lang, 'Log out?', 'लॉग आउट करें?')}>
        <p className="text-body text-[var(--text-secondary)]">{copy(lang, 'Are you sure you want to log out?', 'क्या आप वाकई लॉग आउट करना चाहते हैं?')}</p>
        <div className="mt-5 grid grid-cols-2 gap-3">
          <Button variant="danger" onClick={() => { logout(); router.replace('/onboarding'); }}>
            {copy(lang, 'Log out', 'लॉग आउट')}
          </Button>
          <Button variant="ghost" onClick={() => setLogoutOpen(false)}>
            {copy(lang, 'Cancel', 'रद्द करें')}
          </Button>
        </div>
      </BottomSheet>
    </main>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function isApiError(value: unknown): value is ApiError {
  return typeof value === 'object' && value !== null && 'code' in value;
}

function ProfileStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-micro uppercase text-[var(--text-secondary)]">{label}</p>
      <p className="mt-1 truncate font-medium text-[var(--text-primary)]">{value}</p>
    </div>
  );
}

function DocRow({
  label,
  url,
  status,
  lang,
  readOnly = false,
  onUpload,
}: {
  label: string;
  url?: string;
  status?: string;
  lang: Lang;
  readOnly?: boolean;
  onUpload: () => void;
}) {
  return (
    <div className="flex items-center justify-between py-2.5">
      <div className="flex items-center gap-2">
        <span className="text-small font-medium text-[var(--text-primary)]">{label}</span>
        {status ? (
          <span className={[
            'text-micro px-1.5 py-0.5 rounded-md font-semibold uppercase',
            status === 'APPROVED' ? 'bg-teal-100 text-teal-700' :
            status === 'REJECTED' ? 'bg-red-100 text-red-600' :
            'bg-amber-100 text-amber-700',
          ].join(' ')}>
            {status}
          </span>
        ) : (
          <span className="text-micro text-[var(--text-secondary)]">{copy(lang, 'Not uploaded', 'अपलोड नहीं हुआ')}</span>
        )}
      </div>
      <div className="flex items-center gap-3">
        {url ? (
          <button
            type="button"
            onClick={() => window.open(url, '_blank', 'noopener,noreferrer')}
            className="text-small font-medium text-[var(--brand)]"
          >
            {copy(lang, 'View', 'देखें')}
          </button>
        ) : null}
        {!readOnly ? (
          <button
            type="button"
            onClick={onUpload}
            className="text-small text-[var(--text-secondary)] underline-offset-2 hover:underline"
          >
            {url ? copy(lang, 'Replace', 'बदलें') : copy(lang, 'Upload', 'अपलोड')}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function vehicleLabel(assignment: Record<string, unknown>) {
  const vehicle = safeRecord(assignment.vehicle);
  const type = readString(vehicle, ['type'], 'Vehicle');
  const plate = readString(vehicle, ['plate']);
  return plate ? `${type} · ${plate}` : type;
}

function toRecords(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const record = safeRecord(item);
    return record ? [record] : [];
  });
}

function normalizeUploadSlot(response: UploadSlot | { data?: UploadSlot }) {
  const direct = safeRecord(response);
  const nested = safeRecord(direct?.data);
  const source = nested ?? direct;
  const fileUrl = readString(source, ['fileUrl']);
  const fileUuid = readString(source, ['fileUuid']);
  if (!fileUrl && !fileUuid) throw new Error('Upload slot did not include a file reference.');
  return { uploadUrl: readString(source, ['uploadUrl']), fileUrl, fileUuid };
}

function MenuRow({ icon, label, danger = false, onClick }: { icon: string; label: string; danger?: boolean; onClick?: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex min-h-[56px] w-full items-center gap-3 border-b border-[var(--border)] px-4 text-left last:border-b-0">
      <span className={['flex h-9 w-9 shrink-0 items-center justify-center rounded-xl font-display', danger ? 'bg-[var(--red-50)] text-[var(--red-600)]' : 'bg-[var(--brand-light)] text-[var(--brand)]'].join(' ')}>{icon}</span>
      <span className={['font-medium', danger ? 'text-[var(--red-600)]' : 'text-[var(--text-primary)]'].join(' ')}>{label}</span>
    </button>
  );
}

function LanguageChoice({ label, selected, onClick }: { label: string; selected: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex w-full items-center gap-3 rounded-xl border border-[var(--border)] p-4 text-left">
      <span className="text-title text-[var(--brand)]">{selected ? '●' : '○'}</span>
      <span className="font-medium text-[var(--text-primary)]">{label}</span>
    </button>
  );
}
