'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  FileSearch,
  Loader2,
  RefreshCw,
  Search,
  ShieldCheck,
  UserRound,
  XCircle,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/lib/AuthContext';
import { driverVerificationApi, orgApi, type DriverDocSummary, type OrgDriverVerificationStatus, type VerificationListItem } from '@/lib/api';

const STATUS_LABELS: Record<OrgDriverVerificationStatus | 'ALL', string> = {
  ALL: 'All statuses',
  PENDING_COMPLIANCE: 'Pending compliance',
  ACTIVE: 'Active',
  SUSPENDED: 'Suspended',
  REMOVED: 'Removed',
};

function statusTone(status: OrgDriverVerificationStatus) {
  if (status === 'ACTIVE') return 'bg-emerald-100 text-emerald-800 border-emerald-200';
  if (status === 'SUSPENDED') return 'bg-orange-100 text-orange-800 border-orange-200';
  if (status === 'REMOVED') return 'bg-red-100 text-red-800 border-red-200';
  return 'bg-amber-100 text-amber-800 border-amber-200';
}

function DocSummaryChips({ summary }: { summary: DriverDocSummary }) {
  return (
    <div className="flex flex-wrap gap-1">
      {summary.approved > 0 && (
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-800">
          <CheckCircle2 className="h-3 w-3" />{summary.approved} approved
        </span>
      )}
      {summary.pending > 0 && (
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
          <Clock className="h-3 w-3" />{summary.pending} pending
        </span>
      )}
      {summary.rejected > 0 && (
        <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-800">
          <XCircle className="h-3 w-3" />{summary.rejected} rejected
        </span>
      )}
      {summary.missingMandatory.length > 0 && (
        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700">
          <AlertCircle className="h-3 w-3" />{summary.missingMandatory.length} missing
        </span>
      )}
    </div>
  );
}

function formatDate(value?: string | null) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function DriverVerificationsPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<VerificationListItem[]>([]);
  const [organizations, setOrganizations] = useState<{ id: string; name: string }[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [orgFilter, setOrgFilter] = useState<string>('');
  const [searchInput, setSearchInput] = useState('');

  const isSuperAdmin = user?.role === 'SUPER_ADMIN';
  const limit = 20;

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [verRes, orgRes] = await Promise.all([
        driverVerificationApi.list({
          status: statusFilter || undefined,
          organizationId: orgFilter || undefined,
          search: search || undefined,
          page,
          limit,
        }),
        orgApi.list(),
      ]);
      setItems(verRes.data.items);
      setTotal(verRes.data.pagination.total);
      setOrganizations(
        orgRes.data.organizations.map((o: any) => ({
          id: o.id,
          name: o.tradeName || o.legalName || o.id,
        }))
      );
    } catch (err: any) {
      setError(err?.message ?? 'Failed to load verifications');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, orgFilter, search, page]);

  useEffect(() => {
    if (isSuperAdmin) void load();
    else setLoading(false);
  }, [isSuperAdmin, load]);

  const handleSearch = () => {
    setSearch(searchInput);
    setPage(1);
  };

  const totalPages = Math.ceil(total / limit);

  if (!isSuperAdmin) {
    return (
      <div className="p-6">
        <Card><CardContent className="p-6 text-sm text-slate-600">Driver verification is only accessible to super admins.</CardContent></Card>
      </div>
    );
  }

  return (
    <div className="min-h-full space-y-5 bg-slate-50 p-5">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-slate-900">
            <ShieldCheck className="h-5 w-5 text-blue-600" />
            Driver Verifications
          </h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Review and approve drivers submitted for compliance.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => void load()} className="border-slate-200 self-start sm:self-auto">
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <div className="flex min-w-52 flex-1 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5">
          <Search className="h-4 w-4 flex-shrink-0 text-slate-400" />
          <input
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400"
            placeholder="Search name or phone…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          />
          {searchInput && (
            <button onClick={() => { setSearchInput(''); setSearch(''); setPage(1); }} className="text-slate-400 hover:text-slate-700">
              ×
            </button>
          )}
        </div>

        <Select value={statusFilter || 'ALL'} onValueChange={(v) => { setStatusFilter(v === 'ALL' ? '' : v); setPage(1); }}>
          <SelectTrigger className="h-9 w-52 bg-white">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(STATUS_LABELS) as (OrgDriverVerificationStatus | 'ALL')[]).map((k) => (
              <SelectItem key={k} value={k}>{STATUS_LABELS[k]}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={orgFilter || 'ALL'} onValueChange={(v) => { setOrgFilter(v === 'ALL' ? '' : v); setPage(1); }}>
          <SelectTrigger className="h-9 w-52 bg-white">
            <SelectValue placeholder="All organizations" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All organizations</SelectItem>
            {organizations.map((o) => (
              <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button size="sm" onClick={handleSearch} className="bg-blue-600 hover:bg-blue-700">
          <Search className="mr-2 h-4 w-4" />
          Search
        </Button>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />{error}
        </div>
      )}

      {/* Summary metric */}
      {!loading && (
        <p className="text-sm text-slate-500">
          {total === 0 ? 'No drivers found.' : `Showing ${items.length} of ${total} drivers`}
        </p>
      )}

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-20 text-slate-500">
            <FileSearch className="h-10 w-10 text-slate-300" />
            <p className="text-sm">No drivers match the current filters.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
                  <th className="px-4 py-3">Driver</th>
                  <th className="px-4 py-3">Organization</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Documents</th>
                  <th className="px-4 py-3">Submitted</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((item) => (
                  <tr key={item.organizationDriverId} className="hover:bg-slate-50/60">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-blue-100">
                          <UserRound className="h-4 w-4 text-blue-600" />
                        </div>
                        <div className="min-w-0">
                          <p className="truncate font-medium text-slate-900">{item.fullName || '—'}</p>
                          <p className="truncate text-xs text-slate-500">{item.phone}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-700">{item.organizationName}</td>
                    <td className="px-4 py-3">
                      <Badge className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${statusTone(item.status)}`}>
                        {item.status.replace(/_/g, ' ')}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <DocSummaryChips summary={item.documentSummary} />
                    </td>
                    <td className="px-4 py-3 text-slate-500">{formatDate(item.onboardingSubmittedAt)}</td>
                    <td className="px-4 py-3">
                      <Link href={`/dashboard/drivers/verifications/detail?driverId=${encodeURIComponent(item.driverId)}`}>
                        <Button size="sm" variant="outline" className="border-slate-200 text-xs">
                          Review
                        </Button>
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-500">Page {page} of {totalPages}</span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
              Previous
            </Button>
            <Button size="sm" variant="outline" disabled={page === totalPages} onClick={() => setPage((p) => p + 1)}>
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
