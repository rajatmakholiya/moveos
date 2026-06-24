'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '../../../../lib/AuthContext';
import { api } from '../../../../lib/api';
import { useLanguage } from '../../../../lib/LanguageContext';
import { copy } from '../../../../lib/utils';
import { Button } from '../../../../components/ui/Button';
import { Pill } from '../../../../components/ui/Pill';
import { SkeletonCard } from '../../../../components/ui/SkeletonCard';
import { DriverAuthLoading, DriverAuthRequired } from '../../../../components/DriverAuthState';
// Inline SVG icons — lucide-react is not in PWA deps
function Ico({ d, className }: { d: string; className?: string }) {
  return <svg xmlns="http://www.w3.org/2000/svg" className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" dangerouslySetInnerHTML={{ __html: d }} />;
}
const ArrowLeft = ({ className }: { className?: string }) => <Ico d='<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>' className={className} />;
const Car = ({ className }: { className?: string }) => <Ico d='<path d="M19 17H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2z"/><path d="m5 9 1.5-3h11L19 9"/><circle cx="7.5" cy="17" r="1.5"/><circle cx="16.5" cy="17" r="1.5"/>' className={className} />;
const FileText = ({ className }: { className?: string }) => <Ico d='<path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/>' className={className} />;
const Shield = ({ className }: { className?: string }) => <Ico d='<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>' className={className} />;
const Users = ({ className }: { className?: string }) => <Ico d='<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>' className={className} />;

type DocStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXPIRED';

interface Organization {
  id: string;
  legalName: string;
  tradeName?: string;
  status: string;
  planTier: string;
  gstin?: string;
  pan?: string;
  primaryPhone?: string;
  primaryEmail?: string;
  members?: Array<{ userId: string; role: string; status: string }>;
  drivers?: Array<{ driverId: string; status: string; driver?: { user: { phone: string; name?: string } } }>;
  vehicles?: Array<{ vehicleId: string; status: string; vehicle?: { plate: string; type: string } }>;
  documents?: Array<{ id: string; type: string; status: DocStatus; expiresAt?: string }>;
}

interface KycRecord {
  id: string;
  documentType: string;
  status: DocStatus;
  expiresAt?: string;
  documentUrl: string;
}

function docStatusPill(status: DocStatus): { color: 'teal' | 'amber' | 'red' | 'stone'; label: string } {
  if (status === 'APPROVED') return { color: 'teal', label: 'Approved' };
  if (status === 'PENDING') return { color: 'amber', label: 'Pending' };
  if (status === 'REJECTED') return { color: 'red', label: 'Rejected' };
  if (status === 'EXPIRED') return { color: 'red', label: 'Expired' };
  return { color: 'stone', label: status };
}

function SectionCard({ title, icon: Icon, children }: { title: string; icon: typeof Users; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-card">
      <div className="flex items-center gap-2 mb-3">
        <Icon className="h-4 w-4 text-[var(--brand)]" />
        <h2 className="font-medium text-[var(--text-primary)] text-small">{title}</h2>
      </div>
      {children}
    </section>
  );
}

export default function OrgDetailPage() {
  const params = useParams<{ orgId: string }>();
  const router = useRouter();
  const { lang } = useLanguage();
  const { user, token, isReady } = useAuth();
  const [org, setOrg] = useState<Organization | null>(null);
  const [kyc, setKyc] = useState<KycRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [orgRes, kycRes] = await Promise.all([
        api.get<{ data: { organization: Organization } }>(`/organizations/${params.orgId}`, token ?? undefined),
        api.get<{ data: { kycRecords: KycRecord[] } }>(`/organizations/${params.orgId}/kyc`, token ?? undefined),
      ]);
      setOrg(orgRes.data.organization);
      setKyc(kycRes.data.kycRecords);
    } catch (err: any) {
      setError(err?.message ?? 'Failed to load organization');
    } finally {
      setLoading(false);
    }
  }, [params.orgId, token]);

  useEffect(() => {
    if (isReady && token && user?.role === 'DRIVER') void load();
    else if (isReady) setLoading(false);
  }, [isReady, token, user?.role, load]);

  if (!isReady) return <DriverAuthLoading />;
  if (!user || user.role !== 'DRIVER') return <DriverAuthRequired />;

  const orgStatusPill = (status: string) => {
    if (status === 'ACTIVE') return { color: 'teal' as const, label: copy(lang, 'Active', 'सक्रिय') };
    if (status === 'PENDING_REVIEW') return { color: 'amber' as const, label: copy(lang, 'Pending review', 'समीक्षाधीन') };
    if (status === 'SUSPENDED') return { color: 'red' as const, label: copy(lang, 'Suspended', 'निलंबित') };
    return { color: 'stone' as const, label: status };
  };

  return (
    <main className="min-h-screen bg-[var(--surface-raised)] px-5 pb-[calc(5rem+env(safe-area-inset-bottom))] pt-5">
      <header className="flex items-center gap-3 mb-5">
        <button
          type="button"
          onClick={() => router.push('/driver/organizations')}
          className="flex items-center justify-center w-9 h-9 rounded-xl bg-[var(--surface)] border border-[var(--border)] active:scale-95 transition"
        >
          <ArrowLeft className="h-4 w-4 text-[var(--text-primary)]" />
        </button>
        <div className="min-w-0">
          <h1 className="font-display text-heading text-[var(--text-primary)] truncate">
            {org?.tradeName || org?.legalName || copy(lang, 'Organization', 'संगठन')}
          </h1>
          <p className="text-small text-[var(--text-secondary)]">{copy(lang, 'Fleet details', 'फ्लीट विवरण')}</p>
        </div>
      </header>

      {loading ? (
        <div className="space-y-4">
          <SkeletonCard />
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
      ) : org ? (
        <div className="space-y-4">
          {/* Org overview */}
          <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-card">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-display text-heading text-[var(--text-primary)]">
                    {org.tradeName || org.legalName}
                  </p>
                  <Pill {...orgStatusPill(org.status)} />
                </div>
                <p className="text-small text-[var(--text-secondary)] mt-1">{org.legalName}</p>
              </div>
              <span className="text-[10px] font-bold text-[var(--text-tertiary)] uppercase tracking-wider flex-shrink-0 mt-1">
                {org.planTier}
              </span>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-2.5">
              {[
                { label: copy(lang, 'Drivers', 'ड्राइवर'), value: org.drivers?.length ?? 0 },
                { label: copy(lang, 'Vehicles', 'वाहन'), value: org.vehicles?.length ?? 0 },
                { label: copy(lang, 'Documents', 'दस्तावेज़'), value: org.documents?.length ?? 0 },
              ].map((s) => (
                <div key={s.label} className="rounded-xl bg-[var(--surface-raised)] p-3 text-center">
                  <p className="text-heading font-bold text-[var(--text-primary)]">{s.value}</p>
                  <p className="text-small text-[var(--text-secondary)]">{s.label}</p>
                </div>
              ))}
            </div>

            {(org.gstin || org.pan) && (
              <div className="mt-3 flex flex-wrap gap-3 text-small text-[var(--text-secondary)]">
                {org.gstin && <span>GSTIN: <span className="font-mono text-[var(--text-primary)]">{org.gstin}</span></span>}
                {org.pan && <span>PAN: <span className="font-mono text-[var(--text-primary)]">{org.pan}</span></span>}
              </div>
            )}
          </section>

          {/* My KYC status */}
          {kyc.length > 0 && (
            <SectionCard title={copy(lang, 'Compliance / KYC', 'कम्प्लायंस / KYC')} icon={Shield}>
              <div className="space-y-2.5">
                {kyc.map((record) => {
                  const pill = docStatusPill(record.status);
                  return (
                    <div key={record.id} className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-small font-medium text-[var(--text-primary)] truncate">
                          {record.documentType.replace(/_/g, ' ')}
                        </p>
                        {record.expiresAt && (
                          <p className="text-small text-[var(--text-secondary)]">
                            {copy(lang, 'Expires', 'समाप्त')} {new Date(record.expiresAt).toLocaleDateString(lang === 'hi' ? 'hi-IN' : 'en-IN')}
                          </p>
                        )}
                      </div>
                      <Pill color={pill.color} label={copy(lang, pill.label, pill.label)} />
                    </div>
                  );
                })}
              </div>
            </SectionCard>
          )}

          {/* Org documents */}
          {(org.documents?.length ?? 0) > 0 && (
            <SectionCard title={copy(lang, 'Organization documents', 'संगठन दस्तावेज़')} icon={FileText}>
              <div className="space-y-2.5">
                {org.documents!.map((doc) => {
                  const pill = docStatusPill(doc.status);
                  return (
                    <div key={doc.id} className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-small font-medium text-[var(--text-primary)] truncate">
                          {doc.type.replace(/_/g, ' ')}
                        </p>
                        {doc.expiresAt && (
                          <p className="text-small text-[var(--text-secondary)]">
                            {copy(lang, 'Expires', 'समाप्त')} {new Date(doc.expiresAt).toLocaleDateString()}
                          </p>
                        )}
                      </div>
                      <Pill color={pill.color} label={copy(lang, pill.label, pill.label)} />
                    </div>
                  );
                })}
              </div>
            </SectionCard>
          )}

          {/* Vehicles */}
          {(org.vehicles?.length ?? 0) > 0 && (
            <SectionCard title={copy(lang, 'Fleet vehicles', 'फ्लीट वाहन')} icon={Car}>
              <div className="space-y-2.5">
                {org.vehicles!.map((v) => (
                  <div key={v.vehicleId} className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-small font-medium font-mono text-[var(--text-primary)]">
                        {v.vehicle?.plate ?? v.vehicleId}
                      </p>
                      {v.vehicle?.type && (
                        <p className="text-small text-[var(--text-secondary)]">{v.vehicle.type}</p>
                      )}
                    </div>
                    <Pill
                      color={v.status === 'ACTIVE' ? 'teal' : v.status === 'SUSPENDED' ? 'red' : 'amber' as 'teal' | 'red' | 'amber'}
                      label={v.status}
                    />
                  </div>
                ))}
              </div>
            </SectionCard>
          )}

        </div>
      ) : null}
    </main>
  );
}
