'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../../../lib/AuthContext';
import { useLanguage } from '../../../../lib/LanguageContext';
import { copy } from '../../../../lib/utils';
import { api, type ApiError } from '../../../../lib/api';
import { Button } from '../../../../components/ui/Button';
import { Input } from '../../../../components/ui/Input';
import { DriverAuthLoading, DriverAuthRequired } from '../../../../components/DriverAuthState';

type StepStatus = 'NOT_SUBMITTED' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXPIRED';

type KycStatusData = {
  kycStatus: string;
  providerVerification: 'live' | 'dev';
  aadhaar: { status: StepStatus };
  drivingLicense: { status: StepStatus; documentNo: string | null; expiresAt: string | null };
};

function errorMessageOf(err: unknown, fallback: string): string {
  const e = err as ApiError;
  const detailMessage = (e?.details as { message?: string } | undefined)?.message;
  return (typeof detailMessage === 'string' && detailMessage) || e?.message || fallback;
}

function StatusDot({ status }: { status: StepStatus }) {
  const color =
    status === 'APPROVED' ? 'bg-teal-500' : status === 'PENDING' ? 'bg-amber-400' : status === 'REJECTED' ? 'bg-red-500' : 'bg-stone-300';
  return <span className={`inline-block h-2.5 w-2.5 rounded-full ${color}`} />;
}

/**
 * Instant KYC verification — Aadhaar OTP, selfie face-match, and DL registry
 * check via the KYC provider. Passing the DL check auto-approves driver KYC;
 * outcomes needing manual review fall back to the super-admin queue.
 */
export default function DriverKycVerifyPage() {
  const router = useRouter();
  const { lang } = useLanguage();
  const { user, token, isReady } = useAuth();

  const [status, setStatus] = useState<KycStatusData | null>(null);
  const [aadhaarNumber, setAadhaarNumber] = useState('');
  const [aadhaarOtp, setAadhaarOtp] = useState('');
  const [otpRequested, setOtpRequested] = useState(false);
  const [devHint, setDevHint] = useState('');
  const [selfieBase64, setSelfieBase64] = useState('');
  const [faceMatched, setFaceMatched] = useState<boolean | null>(null);
  const [dlNumber, setDlNumber] = useState('');
  const [dob, setDob] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');

  const loadStatus = useCallback(async () => {
    try {
      const res = await api.get<{ data?: KycStatusData }>('/driver/kyc/status', token ?? undefined);
      const data = (res as { data?: KycStatusData }).data ?? (res as unknown as KycStatusData);
      setStatus(data);
    } catch {
      setStatus(null);
    }
  }, [token]);

  useEffect(() => {
    if (isReady && user?.role === 'DRIVER') void loadStatus();
  }, [isReady, user?.role, loadStatus]);

  if (!isReady) return <DriverAuthLoading />;
  if (!user || user.role !== 'DRIVER') return <DriverAuthRequired />;

  const aadhaarDone = status?.aadhaar.status === 'APPROVED';
  const dlDone = status?.drivingLicense.status === 'APPROVED';

  const requestAadhaarOtp = async () => {
    const digits = aadhaarNumber.replace(/\D/g, '');
    if (!/^\d{12}$/.test(digits)) {
      setError(copy(lang, 'Enter your 12-digit Aadhaar number.', 'अपना 12 अंकों का आधार नंबर दर्ज करें।'));
      return;
    }
    setBusy('aadhaar-otp');
    setError('');
    try {
      const res = await api.post<{ data?: { devHint?: string } }>('/driver/kyc/aadhaar/otp', { aadhaarNumber: digits }, token ?? undefined);
      setOtpRequested(true);
      setDevHint((res as { data?: { devHint?: string } }).data?.devHint ?? '');
    } catch (err) {
      setError(errorMessageOf(err, copy(lang, 'Could not send Aadhaar OTP.', 'आधार OTP नहीं भेजा जा सका।')));
    } finally {
      setBusy(null);
    }
  };

  const verifyAadhaar = async () => {
    if (!aadhaarOtp.trim()) return;
    setBusy('aadhaar-verify');
    setError('');
    try {
      await api.post('/driver/kyc/aadhaar/verify', { otp: aadhaarOtp.trim() }, token ?? undefined);
      setOtpRequested(false);
      setAadhaarOtp('');
      await loadStatus();
    } catch (err) {
      setError(errorMessageOf(err, copy(lang, 'Aadhaar verification failed.', 'आधार सत्यापन विफल रहा।')));
    } finally {
      setBusy(null);
    }
  };

  const captureSelfie = (file: File | null) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? '');
      // strip the data: prefix — the API expects raw base64
      setSelfieBase64(result.includes(',') ? result.split(',')[1] : result);
      setFaceMatched(null);
    };
    reader.readAsDataURL(file);
  };

  const runFaceMatch = async () => {
    if (!selfieBase64) return;
    setBusy('face');
    setError('');
    try {
      const res = await api.post<{ data?: { matched?: boolean } }>('/driver/kyc/face-match', { selfieBase64 }, token ?? undefined);
      setFaceMatched(Boolean((res as { data?: { matched?: boolean } }).data?.matched));
    } catch (err) {
      setFaceMatched(false);
      setError(errorMessageOf(err, copy(lang, 'Face match failed. Retake the selfie in good light.', 'फेस मैच विफल। अच्छी रोशनी में दोबारा सेल्फी लें।')));
    } finally {
      setBusy(null);
    }
  };

  const verifyDl = async () => {
    const dl = dlNumber.trim().toUpperCase().replace(/[\s-]/g, '');
    if (!dl) {
      setError(copy(lang, 'Enter your driving licence number.', 'अपना ड्राइविंग लाइसेंस नंबर दर्ज करें।'));
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dob)) {
      setError(copy(lang, 'Enter your date of birth.', 'अपनी जन्मतिथि दर्ज करें।'));
      return;
    }
    setBusy('dl');
    setError('');
    try {
      await api.post('/driver/kyc/dl/verify', { dlNumber: dl, dob }, token ?? undefined);
      await loadStatus();
    } catch (err) {
      setError(errorMessageOf(err, copy(lang, 'Licence verification failed.', 'लाइसेंस सत्यापन विफल रहा।')));
    } finally {
      setBusy(null);
    }
  };

  return (
    <main className="min-h-screen bg-[var(--surface-raised)] px-5 pb-[calc(5rem+env(safe-area-inset-bottom))] pt-5">
      <header>
        <h1 className="font-display text-title text-[var(--text-primary)]">
          {copy(lang, 'Instant verification', 'तुरंत सत्यापन')}
        </h1>
        <p className="mt-1 text-small text-[var(--text-secondary)]">
          {copy(lang, 'Verify your identity and licence in minutes to start driving.', 'गाड़ी चलाना शुरू करने के लिए मिनटों में पहचान और लाइसेंस सत्यापित करें।')}
        </p>
      </header>

      {status?.kycStatus === 'APPROVED' && (
        <div className="mt-5 rounded-2xl border border-teal-200 bg-teal-50 p-4 text-center shadow-card">
          <p className="font-medium text-teal-700">{copy(lang, '✓ KYC verified — you are ready to drive!', '✓ KYC सत्यापित — आप गाड़ी चलाने के लिए तैयार हैं!')}</p>
          <Button className="mt-3" size="sm" onClick={() => router.push('/driver')}>
            {copy(lang, 'Go to dashboard', 'डैशबोर्ड पर जाएं')}
          </Button>
        </div>
      )}

      {error && (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-small text-red-700">{error}</div>
      )}

      {/* Step 1 — Aadhaar */}
      <section className="mt-5 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-card">
        <div className="flex items-center justify-between">
          <p className="font-medium text-[var(--text-primary)]">1. {copy(lang, 'Aadhaar verification', 'आधार सत्यापन')}</p>
          <StatusDot status={status?.aadhaar.status ?? 'NOT_SUBMITTED'} />
        </div>
        {aadhaarDone ? (
          <p className="mt-2 text-small text-teal-700">{copy(lang, 'Verified via Aadhaar OTP', 'आधार OTP से सत्यापित')}</p>
        ) : (
          <div className="mt-3 space-y-3">
            <Input
              label={copy(lang, 'Aadhaar number', 'आधार नंबर')}
              value={aadhaarNumber}
              onChange={(event) => setAadhaarNumber(event.target.value)}
              inputMode="numeric"
              placeholder="XXXX XXXX XXXX"
              disabled={otpRequested}
            />
            {otpRequested ? (
              <>
                {devHint && <p className="text-xs text-[var(--text-secondary)]">{devHint}</p>}
                <Input
                  label={copy(lang, 'OTP sent to your Aadhaar-linked mobile', 'आधार से जुड़े मोबाइल पर भेजा गया OTP')}
                  value={aadhaarOtp}
                  onChange={(event) => setAadhaarOtp(event.target.value)}
                  inputMode="numeric"
                  placeholder="123456"
                />
                <div className="grid grid-cols-2 gap-3">
                  <Button loading={busy === 'aadhaar-verify'} onClick={() => void verifyAadhaar()}>
                    {copy(lang, 'Verify', 'सत्यापित करें')}
                  </Button>
                  <Button variant="ghost" loading={busy === 'aadhaar-otp'} onClick={() => void requestAadhaarOtp()}>
                    {copy(lang, 'Resend OTP', 'OTP दोबारा भेजें')}
                  </Button>
                </div>
              </>
            ) : (
              <Button fullWidth loading={busy === 'aadhaar-otp'} onClick={() => void requestAadhaarOtp()}>
                {copy(lang, 'Send OTP', 'OTP भेजें')}
              </Button>
            )}
          </div>
        )}
      </section>

      {/* Step 2 — Selfie face match */}
      <section className="mt-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-card">
        <div className="flex items-center justify-between">
          <p className="font-medium text-[var(--text-primary)]">2. {copy(lang, 'Selfie check', 'सेल्फी जांच')}</p>
          <StatusDot status={faceMatched ? 'APPROVED' : 'NOT_SUBMITTED'} />
        </div>
        {!aadhaarDone ? (
          <p className="mt-2 text-small text-[var(--text-secondary)]">{copy(lang, 'Verify Aadhaar first.', 'पहले आधार सत्यापित करें।')}</p>
        ) : faceMatched ? (
          <p className="mt-2 text-small text-teal-700">{copy(lang, 'Face matched with your Aadhaar photo', 'आपकी आधार फोटो से चेहरा मेल खाता है')}</p>
        ) : (
          <div className="mt-3 space-y-3">
            <label className="block">
              <span className="text-small text-[var(--text-secondary)]">{copy(lang, 'Take a selfie in good light', 'अच्छी रोशनी में सेल्फी लें')}</span>
              <input
                type="file"
                accept="image/*"
                capture="user"
                className="mt-2 block w-full text-small"
                onChange={(event) => captureSelfie(event.target.files?.[0] ?? null)}
              />
            </label>
            <Button fullWidth disabled={!selfieBase64} loading={busy === 'face'} onClick={() => void runFaceMatch()}>
              {copy(lang, 'Match face', 'चेहरा मिलाएं')}
            </Button>
          </div>
        )}
      </section>

      {/* Step 3 — Driving licence */}
      <section className="mt-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-card">
        <div className="flex items-center justify-between">
          <p className="font-medium text-[var(--text-primary)]">3. {copy(lang, 'Driving licence', 'ड्राइविंग लाइसेंस')}</p>
          <StatusDot status={status?.drivingLicense.status ?? 'NOT_SUBMITTED'} />
        </div>
        {dlDone ? (
          <p className="mt-2 text-small text-teal-700">
            {copy(lang, 'Verified against the RTO registry', 'RTO रजिस्ट्री से सत्यापित')}
            {status?.drivingLicense.documentNo ? ` · ${status.drivingLicense.documentNo}` : ''}
          </p>
        ) : (
          <div className="mt-3 space-y-3">
            <Input
              label={copy(lang, 'Licence number', 'लाइसेंस नंबर')}
              value={dlNumber}
              onChange={(event) => setDlNumber(event.target.value)}
              placeholder="UK0420150001234"
            />
            <Input
              label={copy(lang, 'Date of birth', 'जन्मतिथि')}
              type="date"
              value={dob}
              onChange={(event) => setDob(event.target.value)}
            />
            <Button fullWidth loading={busy === 'dl'} onClick={() => void verifyDl()}>
              {copy(lang, 'Verify licence', 'लाइसेंस सत्यापित करें')}
            </Button>
            {status?.drivingLicense.status === 'PENDING' && (
              <p className="text-small text-amber-600">
                {copy(lang, 'Submitted for manual review — we will notify you.', 'मैनुअल समीक्षा के लिए भेजा गया — हम आपको सूचित करेंगे।')}
              </p>
            )}
          </div>
        )}
      </section>

      <p className="mt-4 text-center text-xs text-[var(--text-secondary)]">
        {copy(lang, 'Prefer document upload? ', 'दस्तावेज़ अपलोड करना चाहते हैं? ')}
        <button type="button" className="font-medium text-[var(--brand)] underline" onClick={() => router.push('/driver/onboarding/profile')}>
          {copy(lang, 'Upload documents instead', 'दस्तावेज़ अपलोड करें')}
        </button>
      </p>
    </main>
  );
}
