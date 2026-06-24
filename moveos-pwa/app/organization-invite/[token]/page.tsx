'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '../../../lib/AuthContext';
import { api, type ApiError } from '../../../lib/api';
import { useLanguage } from '../../../lib/LanguageContext';
import { copy } from '../../../lib/utils';
import { Button } from '../../../components/ui/Button';
import { DriverAuthLoading, DriverAuthRequired } from '../../../components/DriverAuthState';
import { Pill } from '../../../components/ui/Pill';
// Inline SVG icons — lucide-react is not in PWA deps
function Ico({ d, className }: { d: string; className?: string }) {
  return <svg xmlns="http://www.w3.org/2000/svg" className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" dangerouslySetInnerHTML={{ __html: d }} />;
}
const Building2 = ({ className }: { className?: string }) => <Ico d='<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>' className={className} />;
const Calendar = ({ className }: { className?: string }) => <Ico d='<rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>' className={className} />;
const ShieldCheck = ({ className }: { className?: string }) => <Ico d='<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/>' className={className} />;
const User = ({ className }: { className?: string }) => <Ico d='<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>' className={className} />;

interface InviteDetails {
  invitation: { id: string; phone: string; role: string; expiresAt: string };
  organization: { id: string; legalName: string; tradeName?: string; status: string };
}

export default function OrganizationInvitePage() {
  const params = useParams<{ token: string }>();
  const router = useRouter();
  const { lang } = useLanguage();
  const { user, token: authToken, isReady } = useAuth();
  const [inviteDetails, setInviteDetails] = useState<InviteDetails | null>(null);
  const [status, setStatus] = useState<'loading_details' | 'idle' | 'saving' | 'accepted' | 'error'>('loading_details');
  const [message, setMessage] = useState('');

  useEffect(() => {
    const loadDetails = async () => {
      try {
        const res = await api.get<{ data: InviteDetails }>(
          `/organizations/invitations/${params.token}/details`,
        );
        setInviteDetails(res.data);
        setStatus('idle');
      } catch (err) {
        const apiError = err as ApiError;
        setStatus('error');
        setMessage(apiError.message ?? copy(lang, 'Invitation not found or expired.', 'आमंत्रण नहीं मिला या समाप्त हो गया।'));
      }
    };
    void loadDetails();
  }, [params.token, lang]);

  const acceptInvite = async () => {
    setStatus('saving');
    setMessage('');
    try {
      await api.post(
        `/organizations/invitations/${params.token}/accept`,
        {},
        authToken ?? undefined,
      );
      setStatus('accepted');
      setMessage(
        copy(
          lang,
          'Fleet invite accepted. Compliance review may still be required before you can operate.',
          'फ्लीट आमंत्रण स्वीकार हो गया। संचालन से पहले कम्प्लायंस समीक्षा आवश्यक हो सकती है।',
        ),
      );
    } catch (error) {
      const apiError = error as ApiError;
      setStatus('error');
      setMessage(apiError.message);
    }
  };

  if (!isReady) return <DriverAuthLoading />;
  if (!user || user.role !== 'DRIVER') {
    return (
      <main className="min-h-screen bg-[var(--surface-raised)] px-5 py-6">
        <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-card">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="font-display text-title text-[var(--text-primary)]">
                {copy(lang, 'Fleet invitation', 'फ्लीट आमंत्रण')}
              </h1>
              <p className="mt-1.5 text-small text-[var(--text-secondary)]">
                {copy(lang, 'Sign in as a driver to accept this invitation.', 'इस आमंत्रण को स्वीकार करने के लिए ड्राइवर के रूप में साइन इन करें।')}
              </p>
            </div>
          </div>
          {inviteDetails && (
            <div className="mt-5 rounded-xl bg-[var(--surface-raised)] border border-[var(--border)] p-4 space-y-3">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center flex-shrink-0">
                  <Building2 className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <p className="font-semibold text-[var(--text-primary)]">{inviteDetails.organization.tradeName || inviteDetails.organization.legalName}</p>
                  <p className="text-small text-[var(--text-secondary)]">{copy(lang, 'Invited you to join their fleet', 'आपको उनके फ्लीट में जुड़ने के लिए आमंत्रित किया')}</p>
                </div>
              </div>
            </div>
          )}
          <div className="mt-5 space-y-2.5">
            <Button fullWidth onClick={() => router.push(`/onboarding/phone?role=DRIVER&redirect=${encodeURIComponent(`/organization-invite/${params.token}`)}`)}>
              {copy(lang, 'Sign in to accept invitation', 'आमंत्रण स्वीकार करने के लिए साइन इन करें')}
            </Button>
            <Button fullWidth variant="ghost" onClick={() => router.push('/')}>
              {copy(lang, 'Go to home', 'होम पर जाएं')}
            </Button>
          </div>
        </section>
      </main>
    );
  }

  const org = inviteDetails?.organization;
  const invite = inviteDetails?.invitation;
  const expiresAt = invite?.expiresAt ? new Date(invite.expiresAt) : null;
  const isExpired = expiresAt ? expiresAt.getTime() < Date.now() : false;

  return (
    <main className="min-h-screen bg-[var(--surface-raised)] px-5 py-6">
      <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-card">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="font-display text-title text-[var(--text-primary)]">
              {copy(lang, 'Fleet invitation', 'फ्लीट आमंत्रण')}
            </h1>
            <p className="mt-1.5 text-small text-[var(--text-secondary)]">
              {copy(
                lang,
                'Review the details below before accepting.',
                'स्वीकार करने से पहले नीचे दिए विवरण देखें।',
              )}
            </p>
          </div>
          <Pill
            color={status === 'accepted' ? 'teal' : status === 'error' || isExpired ? 'red' : 'amber'}
            label={
              status === 'accepted'
                ? copy(lang, 'Accepted', 'स्वीकृत')
                : isExpired
                ? copy(lang, 'Expired', 'समाप्त')
                : copy(lang, 'Pending', 'लंबित')
            }
          />
        </div>

        {/* Org details */}
        {status !== 'loading_details' && org && (
          <div className="mt-5 rounded-xl bg-[var(--surface-raised)] border border-[var(--border)] p-4 space-y-3">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center flex-shrink-0">
                <Building2 className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="font-semibold text-[var(--text-primary)]">{org.tradeName || org.legalName}</p>
                {org.tradeName && <p className="text-small text-[var(--text-secondary)]">{org.legalName}</p>}
              </div>
            </div>
            <div className="flex flex-col gap-2 pt-1 border-t border-[var(--border)]">
              {invite && (
                <div className="flex items-center gap-2 text-small text-[var(--text-secondary)]">
                  <User className="h-3.5 w-3.5 flex-shrink-0" />
                  <span>
                    {copy(lang, 'Role:', 'भूमिका:')} <span className="font-medium text-[var(--text-primary)]">{invite.role}</span>
                  </span>
                </div>
              )}
              {expiresAt && (
                <div className="flex items-center gap-2 text-small text-[var(--text-secondary)]">
                  <Calendar className="h-3.5 w-3.5 flex-shrink-0" />
                  <span>
                    {copy(lang, 'Valid until:', 'वैध तक:')} {expiresAt.toLocaleDateString(lang === 'hi' ? 'hi-IN' : 'en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </span>
                </div>
              )}
              <div className="flex items-start gap-2 text-small text-[var(--text-secondary)]">
                <ShieldCheck className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
                <span>
                  {copy(
                    lang,
                    'After joining, compliance clearance is required before you can operate under this fleet.',
                    'शामिल होने के बाद, इस फ्लीट के अंतर्गत संचालन से पहले कम्प्लायंस मंजूरी आवश्यक है।',
                  )}
                </span>
              </div>
            </div>
          </div>
        )}

        {message ? (
          <p
            className={`mt-4 rounded-xl p-3 text-small ${
              status === 'accepted'
                ? 'bg-teal-50 text-teal-800 border border-teal-100'
                : 'bg-red-50 text-red-700 border border-red-100'
            }`}
          >
            {message}
          </p>
        ) : null}

        <div className="mt-5 space-y-2.5">
          {status === 'accepted' ? (
            <>
              <Button
                fullWidth
                onClick={() => router.push(`/driver/organizations/${org?.id ?? ''}`)}
              >
                {copy(lang, 'View organization', 'संगठन देखें')}
              </Button>
              <Button fullWidth variant="ghost" onClick={() => router.push('/driver')}>
                {copy(lang, 'Back to driver home', 'ड्राइवर होम पर वापस')}
              </Button>
            </>
          ) : (
            <>
              <Button
                fullWidth
                loading={status === 'saving'}
                disabled={status === 'error' || status === 'loading_details' || isExpired}
                onClick={() => void acceptInvite()}
              >
                {copy(lang, 'Accept invitation', 'आमंत्रण स्वीकार करें')}
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
