'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../../lib/AuthContext';
import { api } from '../../../lib/api';
import { useLanguage } from '../../../lib/LanguageContext';
import { copy } from '../../../lib/utils';
import { Button } from '../../../components/ui/Button';
import { Pill } from '../../../components/ui/Pill';
import { SkeletonCard } from '../../../components/ui/SkeletonCard';
import { DriverAuthLoading, DriverAuthRequired } from '../../../components/DriverAuthState';
// Inline SVG icons — lucide-react is not in PWA deps
function IconBuilding({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="7" width="20" height="14" rx="2" /><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
    </svg>
  );
}
function IconUsers({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}
function IconCar({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 17H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2z" /><path d="m5 9 1.5-3h11L19 9" /><circle cx="7.5" cy="17" r="1.5" /><circle cx="16.5" cy="17" r="1.5" />
    </svg>
  );
}
function IconChevronRight({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}
const Building2 = IconBuilding;
const Users = IconUsers;
const Car = IconCar;
const ChevronRight = IconChevronRight;

type OrgStatus = 'DRAFT' | 'PENDING_REVIEW' | 'ACTIVE' | 'SUSPENDED' | 'REJECTED';

interface Organization {
  id: string;
  legalName: string;
  tradeName?: string;
  status: OrgStatus;
  planTier: string;
  primaryPhone?: string;
  _count?: { drivers: number; vehicles: number };
}

interface Membership {
  organizationId: string;
  role: string;
  status: string;
}

function statusPill(status: OrgStatus): { color: 'teal' | 'amber' | 'red' | 'stone'; label: string } {
  if (status === 'ACTIVE') return { color: 'teal' as const, label: 'Active' };
  if (status === 'PENDING_REVIEW') return { color: 'amber' as const, label: 'Pending' };
  if (status === 'SUSPENDED') return { color: 'red' as const, label: 'Suspended' };
  if (status === 'REJECTED') return { color: 'red' as const, label: 'Rejected' };
  return { color: 'stone' as const, label: status };
}

export default function MyOrganizationsPage() {
  const router = useRouter();
  const { lang } = useLanguage();
  const { user, token, isReady } = useAuth();
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get<{ data: { organizations: Organization[]; memberships: Membership[] } }>(
        '/organizations/me',
        token ?? undefined,
      );
      setOrganizations(res.data.organizations);
      setMemberships(res.data.memberships);
    } catch (err: any) {
      setError(err?.message ?? 'Failed to load organizations');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (isReady && token && user?.role === 'DRIVER') {
      void load();
    } else if (isReady && (!token || user?.role !== 'DRIVER')) {
      setLoading(false);
    }
  }, [isReady, token, user?.role, load]);

  if (!isReady) return <DriverAuthLoading />;
  if (!user || user.role !== 'DRIVER') return <DriverAuthRequired />;

  const membershipFor = (orgId: string) => memberships.find((m) => m.organizationId === orgId);

  return (
    <main className="min-h-screen bg-[var(--surface-raised)] px-5 pb-[calc(5rem+env(safe-area-inset-bottom))] pt-5">
      <header className="flex items-center justify-between gap-4 mb-5">
        <div>
          <h1 className="font-display text-title text-[var(--text-primary)]">
            {copy(lang, 'My Organizations', 'मेरे संगठन')}
          </h1>
          <p className="text-small text-[var(--text-secondary)] mt-1">
            {copy(lang, 'Fleet accounts you are a member of', 'वो फ्लीट खाते जिनके आप सदस्य हैं')}
          </p>
        </div>
        <Button size="sm" variant="secondary" onClick={() => router.push('/driver')}>
          {copy(lang, 'Back', 'वापस')}
        </Button>
      </header>

      {loading ? (
        <div className="space-y-3">
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 text-center">
          <p className="text-small text-red-500">{error}</p>
          <Button variant="ghost" onClick={() => void load()} className="mt-3">
            {copy(lang, 'Retry', 'दोबारा कोशिश करें')}
          </Button>
        </div>
      ) : organizations.length === 0 ? (
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-8 text-center flex flex-col items-center gap-3">
          <Building2 className="h-10 w-10 text-[var(--text-tertiary)]" />
          <p className="text-small font-medium text-[var(--text-primary)]">
            {copy(lang, 'No fleet memberships', 'कोई फ्लीट सदस्यता नहीं')}
          </p>
          <p className="text-small text-[var(--text-secondary)]">
            {copy(lang, 'When a fleet invites you, accept their invite to join.', 'जब कोई फ्लीट आपको आमंत्रित करे, तब उनका आमंत्रण स्वीकार करें।')}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {organizations.map((org) => {
            const membership = membershipFor(org.id);
            const pill = statusPill(org.status);
            return (
              <button
                key={org.id}
                type="button"
                onClick={() => router.push(`/driver/organizations/${org.id}`)}
                className="w-full rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 text-left shadow-card transition hover:border-[var(--brand)] active:scale-[0.99]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-[var(--text-primary)] truncate">
                      {org.tradeName || org.legalName}
                    </p>
                    <p className="text-small text-[var(--text-secondary)] truncate">{org.legalName}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1 flex-shrink-0">
                    <Pill color={pill.color as 'teal' | 'amber' | 'red' | 'stone'} label={copy(lang, pill.label, pill.label)} />
                    {membership && (
                      <span className="text-[10px] text-[var(--text-tertiary)] font-medium uppercase tracking-wide">
                        {membership.role}
                      </span>
                    )}
                  </div>
                </div>
                {org._count && (
                  <div className="mt-3 flex items-center gap-4 text-small text-[var(--text-secondary)]">
                    <span className="flex items-center gap-1.5">
                      <Users className="h-3.5 w-3.5" />
                      {org._count.drivers} {copy(lang, 'drivers', 'ड्राइवर')}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Car className="h-3.5 w-3.5" />
                      {org._count.vehicles} {copy(lang, 'vehicles', 'वाहन')}
                    </span>
                  </div>
                )}
                <div className="mt-2 flex justify-end">
                  <ChevronRight className="h-4 w-4 text-[var(--text-tertiary)]" />
                </div>
              </button>
            );
          })}
        </div>
      )}
    </main>
  );
}
