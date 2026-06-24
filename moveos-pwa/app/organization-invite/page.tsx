'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '../../lib/AuthContext';
import { api, type ApiError } from '../../lib/api';
import { useLanguage } from '../../lib/LanguageContext';
import { copy } from '../../lib/utils';
import { Button } from '../../components/ui/Button';
import { Pill } from '../../components/ui/Pill';

// ─── Inline SVG icons (lucide-react not in PWA deps) ─────────────────────────
function Ico({ d, className }: { d: string; className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
      dangerouslySetInnerHTML={{ __html: d }} />
  );
}
const Building2 = ({ className }: { className?: string }) =>
  <Ico d='<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>' className={className} />;
const ShieldCheck = ({ className }: { className?: string }) =>
  <Ico d='<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/>' className={className} />;
const Lock = ({ className }: { className?: string }) =>
  <Ico d='<rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>' className={className} />;
const Calendar = ({ className }: { className?: string }) =>
  <Ico d='<rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>' className={className} />;

// ─── Types ────────────────────────────────────────────────────────────────────
type InviteDetails = {
  invitationId: string;
  organizationId: string;
  organizationName: string;
  invitedName: string | null;
  phoneMasked: string;
  role: string;
  status: string;
  expiresAt: string;
  canRequestOtp: boolean;
};

type Stage =
  | 'loading'
  | 'invalid'
  | 'show_invite'
  | 'otp_input'
  | 'verifying'
  | 'success';

// ─── Main export (wrapped in Suspense for useSearchParams) ────────────────────
export default function OrganizationInvitePage() {
  return (
    <Suspense fallback={<LoadingShell />}>
      <InvitePageContent />
    </Suspense>
  );
}

function LoadingShell() {
  return <main className="min-h-screen bg-[var(--surface-raised)] px-5 py-6" />;
}

// ─── Core page ────────────────────────────────────────────────────────────────
function InvitePageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { lang } = useLanguage();
  const { login } = useAuth();

  const publicInviteRef = searchParams.get('ref') ?? '';
  const rawToken = searchParams.get('token') ?? '';

  const [stage, setStage] = useState<Stage>('loading');
  const [inviteDetails, setInviteDetails] = useState<InviteDetails | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [devOtp, setDevOtp] = useState('');

  // OTP input state
  const [digits, setDigits] = useState(['', '', '', '', '', '']);
  const [otpTimer, setOtpTimer] = useState(0);
  const [otpError, setOtpError] = useState('');
  const [otpLoading, setOtpLoading] = useState(false);
  const [shakeKey, setShakeKey] = useState(0);
  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);
  const verifyInFlight = useRef(false);

  // ── Load invite details on mount ──────────────────────────────────────────
  useEffect(() => {
    if (!publicInviteRef || !rawToken) {
      setStage('invalid');
      setErrorMsg(copy(lang, 'Invalid invite link. Please ask your organization admin for a new link.', 'अमान्य आमंत्रण लिंक। कृपया अपने संगठन एडमिन से नया लिंक मांगें।'));
      return;
    }

    void (async () => {
      try {
        const res = await api.get<{ status: string; data: InviteDetails }>(
          `/driver/invitations/${publicInviteRef}?token=${encodeURIComponent(rawToken)}`,
        );
        setInviteDetails(res.data as unknown as InviteDetails);
        setStage('show_invite');
      } catch (err) {
        const e = err as ApiError;
        setStage('invalid');
        const code = (e.details as Record<string, unknown> | undefined)?.error_code ?? e.code;
        if (code === 'invite_expired') {
          setErrorMsg(copy(lang, 'This invitation has expired. Please ask your organization admin to send a new one.', 'यह आमंत्रण समाप्त हो गया है। कृपया अपने संगठन एडमिन से नया आमंत्रण मंगाएं।'));
        } else if (code === 'invite_cancelled') {
          setErrorMsg(copy(lang, 'This invitation has been cancelled.', 'यह आमंत्रण रद्द कर दिया गया है।'));
        } else if (code === 'invite_already_used') {
          setErrorMsg(copy(lang, 'This invitation has already been used.', 'यह आमंत्रण पहले ही उपयोग किया जा चुका है।'));
        } else {
          setErrorMsg(copy(lang, 'Invitation not found or link is invalid.', 'आमंत्रण नहीं मिला या लिंक अमान्य है।'));
        }
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [publicInviteRef, rawToken]);

  // ── OTP countdown timer ───────────────────────────────────────────────────
  useEffect(() => {
    if (otpTimer <= 0) return;
    const t = setInterval(() => setOtpTimer((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [otpTimer]);

  // ── Auto-verify when 6 digits entered ────────────────────────────────────
  useEffect(() => {
    const code = digits.join('');
    if (code.length === 6 && digits.every(Boolean) && stage === 'otp_input') {
      void handleVerifyOtp(code);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [digits]);

  // ── Send OTP ──────────────────────────────────────────────────────────────
  const handleSendOtp = useCallback(async () => {
    if (!inviteDetails) return;
    setOtpError('');
    try {
      const res = await api.post<{ status: string; data: { otpExpiresIn: number; devOtpCode?: string } }>(
        `/driver/invitations/${publicInviteRef}/send-otp`,
        { token: rawToken, phone: inviteDetails.phoneMasked },
      );
      const d = (res as unknown as { data: { otpExpiresIn: number; devOtpCode?: string } }).data;
      setOtpTimer(d?.otpExpiresIn ?? 600);
      if (d?.devOtpCode) setDevOtp(d.devOtpCode);
      setDigits(['', '', '', '', '', '']);
      setStage('otp_input');
      setTimeout(() => inputRefs.current[0]?.focus(), 100);
    } catch (err) {
      const e = err as ApiError;
      setErrorMsg(e.message ?? copy(lang, 'Failed to send OTP. Please try again.', 'OTP भेजने में विफल। कृपया पुनः प्रयास करें।'));
    }
  }, [inviteDetails, lang, publicInviteRef, rawToken]);

  // ── Verify OTP ────────────────────────────────────────────────────────────
  const handleVerifyOtp = useCallback(async (code: string) => {
    if (verifyInFlight.current || !inviteDetails) return;
    verifyInFlight.current = true;
    setOtpLoading(true);
    setOtpError('');
    try {
      const res = await api.post<{ status: string; data: { authToken: string; refreshToken: string; userId: string; driverId: string; organizationId: string; nextStep: string } }>(
        `/driver/invitations/${publicInviteRef}/verify-otp`,
        { token: rawToken, phone: inviteDetails.phoneMasked, otp: code },
      );
      const d = (res as unknown as { data: { authToken: string; refreshToken?: string; userId: string; driverId: string } }).data;
      login({ token: d.authToken, refreshToken: d.refreshToken, userId: d.userId, role: 'DRIVER', driverId: d.driverId });
      setStage('success');
    } catch (err) {
      const e = err as ApiError;
      setShakeKey((k) => k + 1);
      setDigits(['', '', '', '', '', '']);
      setTimeout(() => inputRefs.current[0]?.focus(), 50);
      const code_ = (e.details as Record<string, unknown> | undefined)?.error_code ?? '';
      if (code_ === 'invite_phone_mismatch') {
        setOtpError(copy(lang, 'This invite is linked to a different mobile number. Contact your organization admin.', 'यह आमंत्रण किसी अन्य मोबाइल नंबर से जुड़ा है। अपने संगठन एडमिन से संपर्क करें।'));
      } else if (code_ === 'otp_expired') {
        setOtpError(copy(lang, 'OTP expired. Request a new one.', 'OTP समाप्त हो गया। नया OTP मंगाएं।'));
      } else if (code_ === 'driver_access_revoked') {
        setOtpError(copy(lang, 'Your access to this organization has been suspended. Contact the admin.', 'इस संगठन में आपकी पहुंच निलंबित है। एडमिन से संपर्क करें।'));
      } else {
        setOtpError(e.message ?? copy(lang, 'Incorrect OTP. Please try again.', 'OTP गलत है। पुनः प्रयास करें।'));
      }
    } finally {
      verifyInFlight.current = false;
      setOtpLoading(false);
    }
  }, [inviteDetails, lang, login, publicInviteRef, rawToken]);

  const setDigitAt = (index: number, value: string) => {
    const next = value.replace(/\D/g, '').slice(-1);
    setDigits((d) => d.map((v, i) => (i === index ? next : v)));
    if (next && index < 5) inputRefs.current[index + 1]?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, index: number) => {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (pasted.length === 6) {
      e.preventDefault();
      setDigits(pasted.split(''));
    }
  };

  const expiresAt = inviteDetails?.expiresAt ? new Date(inviteDetails.expiresAt) : null;

  // ── Render: invalid / expired ─────────────────────────────────────────────
  if (stage === 'invalid') {
    return (
      <main className="min-h-screen bg-[var(--surface-raised)] px-5 py-10 flex flex-col items-center justify-center gap-4">
        <div className="w-14 h-14 rounded-2xl bg-red-100 flex items-center justify-center">
          <Lock className="h-7 w-7 text-red-500" />
        </div>
        <h1 className="font-display text-title text-center text-[var(--text-primary)]">
          {copy(lang, 'Invite unavailable', 'आमंत्रण उपलब्ध नहीं')}
        </h1>
        <p className="text-body text-center text-[var(--text-secondary)] max-w-xs">{errorMsg}</p>
        <Button variant="ghost" onClick={() => router.push('/')}>
          {copy(lang, 'Go to home', 'होम पर जाएं')}
        </Button>
      </main>
    );
  }

  // ── Render: loading ───────────────────────────────────────────────────────
  if (stage === 'loading') {
    return (
      <main className="min-h-screen bg-[var(--surface-raised)] px-5 py-6 flex items-center justify-center">
        <span className="pahadi-spinner text-[var(--brand)]" />
      </main>
    );
  }

  // ── Render: success ───────────────────────────────────────────────────────
  if (stage === 'success') {
    return (
      <main className="min-h-screen bg-[var(--surface-raised)] px-5 py-10 flex flex-col items-center justify-center gap-5">
        <div className="w-16 h-16 rounded-2xl bg-teal-100 flex items-center justify-center">
          <ShieldCheck className="h-8 w-8 text-teal-600" />
        </div>
        <div className="text-center">
          <h1 className="font-display text-title text-[var(--text-primary)]">
            {copy(lang, 'Phone verified!', 'फ़ोन सत्यापित हो गया!')}
          </h1>
          <p className="mt-2 text-body text-[var(--text-secondary)]">
            {copy(lang, 'Now complete your driver profile to get started with', 'अब अपनी ड्राइवर प्रोफ़ाइल पूरी करें।')}{' '}
            <span className="font-medium text-[var(--text-primary)]">{inviteDetails?.organizationName}</span>.
          </p>
        </div>
        <Button fullWidth onClick={() => router.push('/driver/onboarding/profile')}>
          {copy(lang, 'Complete driver profile', 'ड्राइवर प्रोफ़ाइल पूरी करें')}
        </Button>
        <Button fullWidth variant="ghost" onClick={() => router.push('/driver')}>
          {copy(lang, 'Go to driver home', 'ड्राइवर होम पर जाएं')}
        </Button>
      </main>
    );
  }

  // ── Render: show invite details ───────────────────────────────────────────
  return (
    <main className="min-h-screen bg-[var(--surface-raised)] px-5 py-6">
      <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-card">

        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="font-display text-title text-[var(--text-primary)]">
              {copy(lang, 'Driver invitation', 'ड्राइवर आमंत्रण')}
            </h1>
            <p className="mt-1 text-small text-[var(--text-secondary)]">
              {copy(lang, 'Verify your mobile number to join the fleet.', 'फ्लीट से जुड़ने के लिए अपना मोबाइल नंबर सत्यापित करें।')}
            </p>
          </div>
          <Pill color="amber" label={copy(lang, 'Pending', 'लंबित')} />
        </div>

        {/* Org card */}
        {inviteDetails && (
          <div className="mt-5 rounded-xl bg-[var(--surface-raised)] border border-[var(--border)] p-4 space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center flex-shrink-0">
                <Building2 className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="font-semibold text-[var(--text-primary)]">{inviteDetails.organizationName}</p>
                <p className="text-small text-[var(--text-secondary)]">{inviteDetails.role}</p>
              </div>
            </div>

            <div className="border-t border-[var(--border)] pt-3 space-y-2">
              {inviteDetails.invitedName && (
                <p className="text-small text-[var(--text-secondary)]">
                  {copy(lang, 'Invited as:', 'आमंत्रित:')} <span className="font-medium text-[var(--text-primary)]">{inviteDetails.invitedName}</span>
                </p>
              )}

              {/* Mobile lock notice */}
              <div className="flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-100 px-3 py-2.5">
                <Lock className="h-3.5 w-3.5 flex-shrink-0 mt-0.5 text-amber-600" />
                <div>
                  <p className="text-small font-medium text-amber-800">
                    {copy(lang, 'Mobile number locked', 'मोबाइल नंबर लॉक है')}
                  </p>
                  <p className="text-small text-amber-700 mt-0.5">
                    {copy(lang, 'OTP will be sent to', 'OTP भेजा जाएगा')} <span className="font-mono font-semibold">{inviteDetails.phoneMasked}</span>.{' '}
                    {copy(lang, 'This invite is linked to that number only.', 'यह आमंत्रण केवल उस नंबर से जुड़ा है।')}
                  </p>
                </div>
              </div>

              {expiresAt && (
                <div className="flex items-center gap-2 text-small text-[var(--text-secondary)]">
                  <Calendar className="h-3.5 w-3.5 flex-shrink-0" />
                  {copy(lang, 'Valid until:', 'वैध तक:')} {expiresAt.toLocaleDateString(lang === 'hi' ? 'hi-IN' : 'en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                </div>
              )}

              <div className="flex items-start gap-2 text-small text-[var(--text-secondary)]">
                <ShieldCheck className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
                {copy(lang, 'Document verification is required before you can accept rides.', 'सवारी स्वीकार करने से पहले दस्तावेज़ सत्यापन आवश्यक है।')}
              </div>
            </div>
          </div>
        )}

        {/* OTP section */}
        {stage === 'otp_input' && (
          <div className="mt-5">
            <p className="text-small text-[var(--text-secondary)] mb-3">
              {copy(lang, 'Enter the 6-digit OTP sent to', 'भेजा गया 6-अंकीय OTP दर्ज करें')} <span className="font-mono font-medium text-[var(--text-primary)]">{inviteDetails?.phoneMasked}</span>
            </p>
            {devOtp && (
              <p className="mb-3 rounded-xl bg-amber-50 px-4 py-2.5 text-small text-stone-700">
                Dev OTP: <span className="font-mono font-bold">{devOtp}</span>
              </p>
            )}
            <div
              key={shakeKey}
              className="grid grid-cols-6 gap-2"
              style={shakeKey > 0 ? { animation: 'shake 0.35s ease' } : undefined}
            >
              {digits.map((digit, i) => (
                <input
                  key={i}
                  ref={(n) => { inputRefs.current[i] = n; }}
                  value={digit}
                  inputMode="numeric"
                  autoComplete={i === 0 ? 'one-time-code' : 'off'}
                  maxLength={1}
                  disabled={otpLoading}
                  aria-label={`OTP digit ${i + 1} of 6`}
                  onChange={(e) => setDigitAt(i, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(e, i)}
                  onPaste={handlePaste}
                  className="h-14 rounded-xl border border-[var(--border)] bg-[var(--surface)] text-center font-mono text-title text-[var(--text-primary)] outline-none transition-all focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--teal-100)] disabled:opacity-50"
                />
              ))}
            </div>
            {otpError && (
              <p className="mt-3 text-small font-medium text-[var(--red-600)]">{otpError}</p>
            )}
            <div className="mt-4 flex items-center justify-between">
              {otpTimer > 0 ? (
                <p className="text-small text-[var(--text-secondary)]">
                  {copy(lang, 'Resend in', 'पुनः भेजें')} 0:{String(otpTimer).padStart(2, '0')}
                </p>
              ) : (
                <button
                  type="button"
                  onClick={() => void handleSendOtp()}
                  className="text-small font-medium text-[var(--brand)]"
                >
                  {copy(lang, 'Resend OTP', 'OTP पुनः भेजें')}
                </button>
              )}
              {otpLoading && <span className="pahadi-spinner text-[var(--brand)]" />}
            </div>
          </div>
        )}

        {errorMsg && (
          <p className="mt-4 rounded-xl bg-red-50 border border-red-100 px-4 py-3 text-small text-red-700">{errorMsg}</p>
        )}

        {/* CTA */}
        <div className="mt-5 space-y-2.5">
          {stage === 'show_invite' && (
            <>
              <Button fullWidth onClick={() => void handleSendOtp()}>
                {copy(lang, 'Send OTP to verify mobile', 'मोबाइल सत्यापित करने के लिए OTP भेजें')}
              </Button>
              <Button fullWidth variant="ghost" onClick={() => router.push('/driver')}>
                {copy(lang, 'Decline — back to driver home', 'अस्वीकार करें — ड्राइवर होम पर वापस')}
              </Button>
            </>
          )}
        </div>
      </section>
    </main>
  );
}
