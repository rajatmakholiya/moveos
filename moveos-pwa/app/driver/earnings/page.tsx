'use client';

import { useCallback, useEffect, useState } from 'react';
import { useLanguage } from '../../../lib/LanguageContext';
import { useAuth } from '../../../lib/AuthContext';
import { api, type ApiError } from '../../../lib/api';
import { copy, formatCurrency, formatDate, formatTime } from '../../../lib/utils';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { BottomSheet } from '../../../components/ui/BottomSheet';
import { LanguageToggle } from '../../../components/ui/LanguageToggle';
import { Pill } from '../../../components/ui/Pill';
import { DriverAuthLoading, DriverAuthRequired } from '../../../components/DriverAuthState';

type Earnings = {
  todayPaise: number;
  weekPaise: number;
  monthPaise: number;
  totalPaise?: number;
  pendingCashPaise: number;
  platformFeePaise: number;
};

type LedgerEntry = {
  id: string;
  amountPaise: number;
  entryType: 'CREDIT' | 'DEBIT';
  refType: string;
  createdAt: string;
};

type PayoutProfile = {
  accountHolderName: string;
  accountNumberMasked: string;
  ifsc: string;
  verificationStatus: string;
};

type Payout = {
  id: string;
  amount: number;
  mode: string;
  status: string;
  utr?: string | null;
  createdAt: string;
};

const REF_LABELS: Record<string, { en: string; hi: string }> = {
  TRIP_EARNINGS: { en: 'Trip earnings', hi: 'यात्रा की कमाई' },
  PLATFORM_FEE_CASH: { en: 'Platform fee (cash trip)', hi: 'प्लेटफॉर्म शुल्क (नकद)' },
  PAYOUT: { en: 'Payout to bank', hi: 'बैंक में भुगतान' },
  PAYOUT_REVERSAL: { en: 'Payout reversed', hi: 'भुगतान वापस' },
};

function unwrap<T>(res: unknown): T {
  const record = res as { data?: T };
  return (record?.data ?? res) as T;
}

function errorText(err: unknown, fallback: string) {
  const e = err as ApiError;
  const detail = (e?.details as { message?: string } | undefined)?.message;
  return (typeof detail === 'string' && detail) || e?.message || fallback;
}

export default function DriverEarningsPage() {
  const { lang } = useLanguage();
  const { user, token, isReady } = useAuth();

  const [earnings, setEarnings] = useState<Earnings | null>(null);
  const [balancePaise, setBalancePaise] = useState(0);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [profile, setProfile] = useState<PayoutProfile | null>(null);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  // Bank setup sheet
  const [bankOpen, setBankOpen] = useState(false);
  const [bankForm, setBankForm] = useState({ accountHolderName: '', accountNumber: '', ifsc: '' });
  const [savingBank, setSavingBank] = useState(false);
  const [requestingPayout, setRequestingPayout] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [earningsRes, walletRes, ledgerRes, profileRes, payoutsRes] = await Promise.all([
        api.get<unknown>('/driver/earnings', token ?? undefined),
        api.get<unknown>('/wallet/me/balance', token ?? undefined),
        api.get<unknown>('/wallet/me/ledger', token ?? undefined),
        api.get<unknown>('/drivers/me/payout-profile', token ?? undefined),
        api.get<unknown>('/drivers/me/payouts', token ?? undefined),
      ]);
      setEarnings(unwrap<{ earnings?: Earnings }>(earningsRes).earnings ?? null);
      setBalancePaise(unwrap<{ wallet?: { balance?: number } }>(walletRes).wallet?.balance ?? 0);
      setLedger(unwrap<{ entries?: LedgerEntry[] }>(ledgerRes).entries ?? []);
      setProfile(unwrap<{ profile?: PayoutProfile | null }>(profileRes).profile ?? null);
      setPayouts(unwrap<{ payouts?: Payout[] }>(payoutsRes).payouts ?? []);
    } catch {
      // sections render their empty states
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (isReady && user?.role === 'DRIVER') void load();
  }, [isReady, user?.role, load]);

  if (!isReady) return <DriverAuthLoading />;
  if (!user || user.role !== 'DRIVER') return <DriverAuthRequired />;

  const saveBank = async () => {
    if (!bankForm.accountHolderName.trim() || !/^\d{9,18}$/.test(bankForm.accountNumber) || !/^[A-Za-z]{4}0[A-Za-z0-9]{6}$/.test(bankForm.ifsc)) {
      setMessage({ kind: 'err', text: copy(lang, 'Enter valid account details (9-18 digit account, valid IFSC).', 'सही खाता विवरण भरें (9-18 अंक खाता, सही IFSC)।') });
      return;
    }
    setSavingBank(true);
    setMessage(null);
    try {
      await api.post('/drivers/me/payout-profile', {
        accountHolderName: bankForm.accountHolderName.trim(),
        accountNumber: bankForm.accountNumber,
        ifsc: bankForm.ifsc.toUpperCase(),
      }, token ?? undefined);
      setBankOpen(false);
      setMessage({ kind: 'ok', text: copy(lang, 'Bank account verified and saved!', 'बैंक खाता सत्यापित और सेव हो गया!') });
      await load();
    } catch (err) {
      setMessage({ kind: 'err', text: errorText(err, copy(lang, 'Bank verification failed.', 'बैंक सत्यापन विफल।')) });
    } finally {
      setSavingBank(false);
    }
  };

  const requestPayout = async () => {
    setRequestingPayout(true);
    setMessage(null);
    try {
      await api.post('/drivers/me/payouts', {}, token ?? undefined);
      setMessage({ kind: 'ok', text: copy(lang, 'Payout requested! Money usually arrives within a few hours.', 'भुगतान का अनुरोध हो गया! पैसा आमतौर पर कुछ घंटों में आ जाता है।') });
      await load();
    } catch (err) {
      setMessage({ kind: 'err', text: errorText(err, copy(lang, 'Payout request failed.', 'भुगतान अनुरोध विफल।')) });
    } finally {
      setRequestingPayout(false);
    }
  };

  const bankVerified = profile?.verificationStatus === 'APPROVED';
  const canPayout = bankVerified && balancePaise >= 10000;

  return (
    <main className="min-h-screen bg-[var(--surface-raised)] px-5 pb-[calc(5rem+env(safe-area-inset-bottom))] pt-5">
      <header className="flex items-center justify-between gap-4">
        <h1 className="font-display text-title text-[var(--text-primary)]">{copy(lang, 'Earnings', 'कमाई')}</h1>
        <LanguageToggle />
      </header>

      {message && (
        <div className={`mt-4 rounded-xl border px-4 py-3 text-small ${message.kind === 'ok' ? 'border-teal-200 bg-teal-50 text-teal-800' : 'border-red-200 bg-red-50 text-red-700'}`}>
          {message.text}
        </div>
      )}

      {/* Wallet balance + payout CTA */}
      <section className="mt-5 rounded-2xl bg-[var(--brand)] p-5 text-white shadow-card">
        <p className="text-small opacity-80">{copy(lang, 'Wallet balance', 'वॉलेट बैलेंस')}</p>
        <p className="mt-1 font-display text-[2rem] font-bold">{formatCurrency(balancePaise)}</p>
        {bankVerified ? (
          <Button className="mt-4" variant="secondary" fullWidth loading={requestingPayout} disabled={!canPayout} onClick={() => void requestPayout()}>
            {canPayout
              ? copy(lang, 'Withdraw to bank', 'बैंक में निकालें')
              : copy(lang, 'Minimum payout ₹100', 'न्यूनतम भुगतान ₹100')}
          </Button>
        ) : (
          <Button className="mt-4" variant="secondary" fullWidth onClick={() => setBankOpen(true)}>
            {copy(lang, 'Set up bank account for payouts', 'भुगतान के लिए बैंक खाता जोड़ें')}
          </Button>
        )}
        {profile && (
          <p className="mt-2 text-center text-xs opacity-80">
            {profile.accountNumberMasked} · {profile.ifsc} · {bankVerified ? copy(lang, 'verified', 'सत्यापित') : copy(lang, 'verification pending', 'सत्यापन लंबित')}
          </p>
        )}
      </section>

      {/* Period summary */}
      <section className="mt-5 grid grid-cols-3 gap-3">
        {[
          { label: copy(lang, 'Today', 'आज'), value: earnings?.todayPaise ?? 0 },
          { label: copy(lang, '7 days', '7 दिन'), value: earnings?.weekPaise ?? 0 },
          { label: copy(lang, '30 days', '30 दिन'), value: earnings?.monthPaise ?? 0 },
        ].map((item) => (
          <div key={item.label} className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3 text-center shadow-card">
            <p className="text-xs text-[var(--text-secondary)]">{item.label}</p>
            <p className="mt-1 font-display text-heading text-[var(--text-primary)]">{formatCurrency(item.value)}</p>
          </div>
        ))}
      </section>

      {(earnings?.pendingCashPaise ?? 0) > 0 && (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-small text-amber-800">
          {copy(lang, `Cash to collect from passengers: ${formatCurrency(earnings!.pendingCashPaise)}`, `यात्रियों से लेने वाली नकद राशि: ${formatCurrency(earnings!.pendingCashPaise)}`)}
        </div>
      )}

      {/* Payout history */}
      {payouts.length > 0 && (
        <section className="mt-5">
          <h2 className="font-display text-heading text-[var(--text-primary)]">{copy(lang, 'Payouts', 'भुगतान')}</h2>
          <div className="mt-3 space-y-2">
            {payouts.map((payout) => (
              <div key={payout.id} className="flex items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 shadow-card">
                <div>
                  <p className="font-medium text-[var(--text-primary)]">{formatCurrency(payout.amount)}</p>
                  <p className="text-xs text-[var(--text-secondary)]">
                    {formatDate(new Date(payout.createdAt), lang)} · {payout.mode}
                    {payout.utr ? ` · UTR ${payout.utr}` : ''}
                  </p>
                </div>
                <Pill
                  color={payout.status === 'PROCESSED' ? 'teal' : payout.status === 'FAILED' || payout.status === 'REVERSED' ? 'red' : 'amber'}
                  label={payout.status}
                />
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Ledger */}
      <section className="mt-5">
        <h2 className="font-display text-heading text-[var(--text-primary)]">{copy(lang, 'Recent activity', 'हाल की गतिविधि')}</h2>
        {loading ? (
          <p className="mt-3 text-small text-[var(--text-secondary)]">{copy(lang, 'Loading…', 'लोड हो रहा है…')}</p>
        ) : ledger.length === 0 ? (
          <p className="mt-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-5 text-center text-small text-[var(--text-secondary)]">
            {copy(lang, 'Earnings appear here after your first completed trip.', 'पहली पूरी यात्रा के बाद कमाई यहाँ दिखेगी।')}
          </p>
        ) : (
          <div className="mt-3 space-y-2">
            {ledger.map((entry) => {
              const label = REF_LABELS[entry.refType] ?? { en: entry.refType, hi: entry.refType };
              const credit = entry.entryType === 'CREDIT';
              return (
                <div key={entry.id} className="flex items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 shadow-card">
                  <div>
                    <p className="text-small font-medium text-[var(--text-primary)]">{lang === 'hi' ? label.hi : label.en}</p>
                    <p className="text-xs text-[var(--text-secondary)]">
                      {formatDate(new Date(entry.createdAt), lang)} · {formatTime(new Date(entry.createdAt), lang)}
                    </p>
                  </div>
                  <p className={`font-display font-semibold ${credit ? 'text-teal-600' : 'text-red-600'}`}>
                    {credit ? '+' : '−'}{formatCurrency(entry.amountPaise)}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Bank setup sheet */}
      <BottomSheet open={bankOpen} onClose={() => setBankOpen(false)} title={copy(lang, 'Bank account', 'बैंक खाता')}>
        <p className="text-small text-[var(--text-secondary)]">
          {copy(lang, 'Your account is verified instantly with a penny-drop check. Only the last 4 digits are stored.', 'पेनी-ड्रॉप जांच से आपका खाता तुरंत सत्यापित होता है। केवल अंतिम 4 अंक ही सेव होते हैं।')}
        </p>
        <div className="mt-4 space-y-3">
          <Input
            label={copy(lang, 'Account holder name', 'खाताधारक का नाम')}
            value={bankForm.accountHolderName}
            onChange={(event) => setBankForm((current) => ({ ...current, accountHolderName: event.target.value }))}
          />
          <Input
            label={copy(lang, 'Account number', 'खाता संख्या')}
            inputMode="numeric"
            value={bankForm.accountNumber}
            onChange={(event) => setBankForm((current) => ({ ...current, accountNumber: event.target.value.replace(/\D/g, '') }))}
          />
          <Input
            label="IFSC"
            value={bankForm.ifsc}
            onChange={(event) => setBankForm((current) => ({ ...current, ifsc: event.target.value.toUpperCase() }))}
            placeholder="SBIN0001234"
          />
          <Button fullWidth loading={savingBank} onClick={() => void saveBank()}>
            {copy(lang, 'Verify and save', 'सत्यापित करें और सेव करें')}
          </Button>
        </div>
      </BottomSheet>
    </main>
  );
}
