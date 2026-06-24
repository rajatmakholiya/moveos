'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  ExternalLink,
  FileText,
  History,
  Loader2,
  RefreshCw,
  ShieldCheck,
  UserRound,
  XCircle,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAuth } from '@/lib/AuthContext';
import {
  driverVerificationApi,
  type VerificationDetail,
  type VerificationDocument,
  type VerificationHistoryEvent,
} from '@/lib/api';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(v?: string | null) {
  if (!v) return '—';
  return new Date(v).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function formatDateOnly(v?: string | null) {
  if (!v) return '—';
  return new Date(v).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function docStatusTone(status: string) {
  if (status === 'APPROVED') return 'bg-emerald-100 text-emerald-800 border-emerald-200';
  if (status === 'REJECTED') return 'bg-red-100 text-red-800 border-red-200';
  if (status === 'EXPIRED') return 'bg-orange-100 text-orange-800 border-orange-200';
  return 'bg-amber-100 text-amber-800 border-amber-200';
}

function driverStatusTone(status: string) {
  if (status === 'ACTIVE') return 'bg-emerald-100 text-emerald-800 border-emerald-200';
  if (status === 'SUSPENDED') return 'bg-orange-100 text-orange-800 border-orange-200';
  if (status === 'REMOVED') return 'bg-red-100 text-red-800 border-red-200';
  return 'bg-amber-100 text-amber-800 border-amber-200';
}

function InfoRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-0.5 text-sm font-medium text-slate-900 break-words">{value || '—'}</p>
    </div>
  );
}

// ─── Reject reason modal ────────────────────────────────────────────────────

function RejectModal({
  open,
  title,
  loading,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  loading: boolean;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
}) {
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (!open) setReason('');
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onCancel()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">
              Rejection reason <span className="text-red-500">*</span>
            </label>
            <textarea
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
              rows={4}
              maxLength={500}
              placeholder="Describe why this is being rejected…"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
            <p className="mt-1 text-right text-xs text-slate-400">{reason.length}/500</p>
          </div>
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="outline" onClick={onCancel} disabled={loading}>
              Cancel
            </Button>
            <Button
              size="sm"
              variant="destructive"
              disabled={loading || reason.trim().length === 0}
              onClick={() => onConfirm(reason.trim())}
            >
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <XCircle className="mr-2 h-4 w-4" />}
              Reject
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Approve confirmation modal ─────────────────────────────────────────────

function ApproveDriverModal({
  open,
  loading,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  loading: boolean;
  onConfirm: (remarks?: string) => void;
  onCancel: () => void;
}) {
  const [remarks, setRemarks] = useState('');

  useEffect(() => {
    if (!open) setRemarks('');
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onCancel()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Activate driver</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <p className="text-sm text-slate-600">
            This will set the driver status to <strong>ACTIVE</strong>. All mandatory documents must be approved. This action cannot be undone automatically.
          </p>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Remarks (optional)</label>
            <textarea
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
              rows={3}
              maxLength={500}
              placeholder="Any internal notes…"
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="outline" onClick={onCancel} disabled={loading}>
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={loading}
              className="bg-emerald-600 hover:bg-emerald-700"
              onClick={() => onConfirm(remarks.trim() || undefined)}
            >
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
              Confirm Activation
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Document card ──────────────────────────────────────────────────────────

function DocumentCard({
  doc,
  driverId,
  actionLoading,
  onApprove,
  onRejectClick,
}: {
  doc: VerificationDocument;
  driverId: string;
  actionLoading: string | null;
  onApprove: (doc: VerificationDocument) => void;
  onRejectClick: (doc: VerificationDocument) => void;
}) {
  const approving = actionLoading === `approve:${doc.id}`;
  const rejecting = actionLoading === `reject:${doc.id}`;
  const busy = Boolean(actionLoading);

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      {/* File preview area */}
      <div className="flex h-36 items-center justify-center bg-slate-100">
        {doc.frontFileId ? (
          <div className="flex flex-col items-center gap-2 text-sm text-slate-500">
            <FileText className="h-8 w-8 text-slate-400" />
            <div className="flex gap-2">
              <a
                href={`/api/files/${doc.frontFileId}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs text-blue-600 underline"
              >
                <ExternalLink className="h-3 w-3" />Front
              </a>
              {doc.backFileId && (
                <a
                  href={`/api/files/${doc.backFileId}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-blue-600 underline"
                >
                  <ExternalLink className="h-3 w-3" />Back
                </a>
              )}
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-1 text-slate-400">
            <FileText className="h-8 w-8" />
            <span className="text-xs">No file uploaded</span>
          </div>
        )}
      </div>

      <div className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <p className="font-semibold text-slate-900">{doc.documentType.replace(/_/g, ' ')}</p>
          <Badge className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${docStatusTone(doc.status)}`}>
            {doc.status}
          </Badge>
        </div>

        <div className="space-y-1.5 text-sm">
          {doc.documentNumberMasked && (
            <InfoRow label="Document number" value={doc.documentNumberMasked} />
          )}
          {doc.expiresAt && (
            <InfoRow label="Expires" value={formatDateOnly(doc.expiresAt)} />
          )}
          {doc.rejectionReason && (
            <div className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
              <p className="font-semibold">Rejection reason</p>
              <p className="mt-0.5">{doc.rejectionReason}</p>
            </div>
          )}
          {doc.reviewedAt && (
            <InfoRow label="Reviewed" value={formatDate(doc.reviewedAt)} />
          )}
        </div>

        <div className="flex gap-2 pt-1">
          {doc.status !== 'APPROVED' && (
            <Button
              size="sm"
              disabled={busy}
              className="bg-emerald-600 hover:bg-emerald-700 text-xs"
              onClick={() => onApprove(doc)}
            >
              {approving ? <Loader2 className="mr-1.5 h-3 w-3 animate-spin" /> : <CheckCircle2 className="mr-1.5 h-3 w-3" />}
              Approve
            </Button>
          )}
          {doc.status !== 'REJECTED' && (
            <Button
              size="sm"
              variant="destructive"
              disabled={busy}
              className="text-xs"
              onClick={() => onRejectClick(doc)}
            >
              {rejecting ? <Loader2 className="mr-1.5 h-3 w-3 animate-spin" /> : <XCircle className="mr-1.5 h-3 w-3" />}
              Reject
            </Button>
          )}
          {doc.status === 'APPROVED' && (
            <span className="flex items-center gap-1 text-xs text-emerald-600">
              <CheckCircle2 className="h-4 w-4" /> Approved
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── History entry ──────────────────────────────────────────────────────────

function HistoryEntry({ event }: { event: VerificationHistoryEvent }) {
  return (
    <div className="flex gap-3">
      <div className="mt-1 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-slate-100">
        <History className="h-3.5 w-3.5 text-slate-500" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-slate-900">{event.action.replace(/_/g, ' ')}</p>
        {event.reason && <p className="mt-0.5 text-xs text-slate-500">Reason: {event.reason}</p>}
        <p className="mt-0.5 text-xs text-slate-400">{formatDate(event.createdAt)}</p>
      </div>
    </div>
  );
}

// ─── Main page ───────────────────────────────────────────────────────────────

export default function DriverVerificationDetailClient({ driverId: driverIdProp }: { driverId?: string }) {
  const { user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const driverId = driverIdProp ?? searchParams.get('driverId') ?? '';

  const [detail, setDetail] = useState<VerificationDetail | null>(null);
  const [history, setHistory] = useState<VerificationHistoryEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  // Modal state
  const [rejectDocTarget, setRejectDocTarget] = useState<VerificationDocument | null>(null);
  const [rejectDriverOpen, setRejectDriverOpen] = useState(false);
  const [approveDriverOpen, setApproveDriverOpen] = useState(false);

  const isSuperAdmin = user?.role === 'SUPER_ADMIN';

  const showToast = (type: 'success' | 'error', msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 4000);
  };

  const load = useCallback(async () => {
    if (!driverId) {
      setError('Driver ID is missing.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const [detailRes, historyRes] = await Promise.all([
        driverVerificationApi.getDetail(driverId),
        driverVerificationApi.getHistory(driverId),
      ]);
      setDetail(detailRes.data);
      setHistory(historyRes.data.history);
    } catch (err: any) {
      setError(err?.message ?? 'Failed to load driver verification');
    } finally {
      setLoading(false);
    }
  }, [driverId]);

  useEffect(() => {
    if (isSuperAdmin) void load();
    else setLoading(false);
  }, [isSuperAdmin, load]);

  const handleApproveDoc = async (doc: VerificationDocument) => {
    setActionLoading(`approve:${doc.id}`);
    try {
      await driverVerificationApi.approveDocument(driverId, doc.id, {});
      showToast('success', `${doc.documentType.replace(/_/g, ' ')} approved.`);
      await load();
    } catch (err: any) {
      showToast('error', err?.message ?? 'Failed to approve document');
    } finally {
      setActionLoading(null);
    }
  };

  const handleRejectDoc = async (reason: string) => {
    if (!rejectDocTarget) return;
    setActionLoading(`reject:${rejectDocTarget.id}`);
    try {
      await driverVerificationApi.rejectDocument(driverId, rejectDocTarget.id, { reason });
      setRejectDocTarget(null);
      showToast('success', `${rejectDocTarget.documentType.replace(/_/g, ' ')} rejected.`);
      await load();
    } catch (err: any) {
      showToast('error', err?.message ?? 'Failed to reject document');
    } finally {
      setActionLoading(null);
    }
  };

  const handleApproveDriver = async (remarks?: string) => {
    if (!detail?.organizationDriver) return;
    setActionLoading('approve-driver');
    try {
      await driverVerificationApi.approveDriver(driverId, {
        organizationDriverId: detail.organizationDriver.id,
        remarks,
      });
      setApproveDriverOpen(false);
      showToast('success', 'Driver activated successfully.');
      await load();
    } catch (err: any) {
      setApproveDriverOpen(false);
      showToast('error', err?.message ?? 'Failed to activate driver');
    } finally {
      setActionLoading(null);
    }
  };

  const handleRejectDriver = async (reason: string) => {
    if (!detail?.organizationDriver) return;
    setActionLoading('reject-driver');
    try {
      await driverVerificationApi.rejectDriver(driverId, {
        organizationDriverId: detail.organizationDriver.id,
        reason,
      });
      setRejectDriverOpen(false);
      showToast('success', 'Driver compliance rejected. Driver notified.');
      await load();
    } catch (err: any) {
      setRejectDriverOpen(false);
      showToast('error', err?.message ?? 'Failed to reject driver');
    } finally {
      setActionLoading(null);
    }
  };

  if (!isSuperAdmin) {
    return (
      <div className="p-6">
        <Card><CardContent className="p-6 text-sm text-slate-600">Driver verification is only accessible to super admins.</CardContent></Card>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
      </div>
    );
  }

  if (error || !detail) {
    return (
      <div className="p-6">
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          {error || 'Driver not found.'}
        </div>
      </div>
    );
  }

  const { driver, organizationDriver, documents, canApproveProfile, blockReasons, missingRequiredFields, missingRequiredDocuments } = detail;
  const driverStatus = organizationDriver?.status ?? 'PENDING_COMPLIANCE';

  return (
    <div className="min-h-full space-y-6 bg-slate-50 p-5">
      {/* Toast */}
      {toast && (
        <div className={`fixed right-4 top-4 z-50 flex items-center gap-2 rounded-lg px-4 py-3 text-sm shadow-lg ${toast.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'}`}>
          {toast.type === 'success' ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => router.back()} className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>
          <div>
            <h1 className="flex items-center gap-2 text-xl font-bold text-slate-900">
              <UserRound className="h-5 w-5 text-blue-600" />
              {driver.fullName || driver.phone}
            </h1>
            <p className="text-sm text-slate-500">{driver.phone} · {organizationDriver?.organizationName ?? '—'}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge className={`rounded-full border px-3 py-1 text-xs font-semibold ${driverStatusTone(driverStatus)}`}>
            {driverStatus.replace(/_/g, ' ')}
          </Badge>
          <Button size="sm" variant="outline" onClick={() => void load()}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Block reasons */}
      {blockReasons.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="mb-1.5 flex items-center gap-2 text-sm font-semibold text-amber-800">
            <AlertCircle className="h-4 w-4" /> Activation blocked
          </p>
          <ul className="list-disc space-y-0.5 pl-5 text-sm text-amber-700">
            {blockReasons.map((r, i) => <li key={i}>{r}</li>)}
          </ul>
        </div>
      )}

      {/* Previous rejection notice */}
      {organizationDriver?.complianceRejectedAt && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3">
          <p className="mb-1 text-sm font-semibold text-red-800">Previously rejected on {formatDateOnly(organizationDriver.complianceRejectedAt)}</p>
          {organizationDriver.complianceRejectionReason && (
            <p className="text-sm text-red-700">{organizationDriver.complianceRejectionReason}</p>
          )}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        {/* Left column */}
        <div className="space-y-6">
          {/* Driver profile */}
          <Card className="border border-slate-200 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <UserRound className="h-4 w-4 text-blue-600" />
                Driver profile
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <InfoRow label="Full name" value={driver.fullName} />
              <InfoRow label="Phone" value={driver.phone} />
              <InfoRow label="Email" value={driver.email} />
              <InfoRow label="Date of birth" value={formatDateOnly(driver.dob)} />
              <InfoRow label="Gender" value={driver.gender} />
              <InfoRow label="Blood group" value={driver.bloodGroup} />
              <InfoRow label="Preferred language" value={driver.preferredLanguage} />
              <InfoRow label="Emergency contact" value={driver.emergencyContactName} />
              <InfoRow label="Emergency phone" value={driver.emergencyContactPhone} />
              <div className="sm:col-span-2">
                <InfoRow
                  label="Current address"
                  value={driver.currentAddress ? JSON.stringify(driver.currentAddress) : null}
                />
              </div>
              <div className="sm:col-span-2">
                <InfoRow
                  label="Permanent address"
                  value={driver.permanentAddress ? JSON.stringify(driver.permanentAddress) : null}
                />
              </div>
            </CardContent>
          </Card>

          {/* Missing requirements */}
          {(missingRequiredFields.length > 0 || missingRequiredDocuments.length > 0) && (
            <Card className="border border-amber-200 bg-amber-50 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base text-amber-800">
                  <AlertCircle className="h-4 w-4" />
                  Missing requirements
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {missingRequiredFields.length > 0 && (
                  <div>
                    <p className="mb-1 text-xs font-semibold uppercase text-amber-700">Profile fields</p>
                    <ul className="list-disc space-y-0.5 pl-5 text-sm text-amber-800">
                      {missingRequiredFields.map((f) => <li key={f}>{f.replace(/([A-Z])/g, ' $1').toLowerCase()}</li>)}
                    </ul>
                  </div>
                )}
                {missingRequiredDocuments.length > 0 && (
                  <div>
                    <p className="mb-1 text-xs font-semibold uppercase text-amber-700">Documents</p>
                    <ul className="list-disc space-y-0.5 pl-5 text-sm text-amber-800">
                      {missingRequiredDocuments.map((d) => <li key={d}>{d.replace(/_/g, ' ')}</li>)}
                    </ul>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Documents */}
          <Card className="border border-slate-200 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <FileText className="h-4 w-4 text-blue-600" />
                KYC documents ({documents.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {documents.length === 0 ? (
                <p className="text-sm text-slate-500">No documents submitted yet.</p>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  {documents.map((doc) => (
                    <DocumentCard
                      key={doc.id}
                      doc={doc}
                      driverId={driverId}
                      actionLoading={actionLoading}
                      onApprove={handleApproveDoc}
                      onRejectClick={(d) => setRejectDocTarget(d)}
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Verification history */}
          <Card className="border border-slate-200 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <History className="h-4 w-4 text-blue-600" />
                Verification history
              </CardTitle>
            </CardHeader>
            <CardContent>
              {history.length === 0 ? (
                <p className="text-sm text-slate-500">No audit events yet.</p>
              ) : (
                <div className="space-y-4">
                  {history.map((event) => (
                    <HistoryEntry key={event.id} event={event} />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right sidebar — profile approval panel */}
        <div className="space-y-4">
          <Card className="border border-slate-200 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <ShieldCheck className="h-4 w-4 text-blue-600" />
                Compliance decision
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2 text-sm">
                <InfoRow label="Submitted" value={formatDate(organizationDriver?.onboardingSubmittedAt)} />
                {organizationDriver?.activatedAt && (
                  <InfoRow label="Activated" value={formatDate(organizationDriver.activatedAt)} />
                )}
              </div>

              {driverStatus === 'ACTIVE' ? (
                <div className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2.5 text-sm text-emerald-800">
                  <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
                  Driver is active and verified.
                </div>
              ) : (
                <div className="space-y-2">
                  <Button
                    className="w-full bg-emerald-600 hover:bg-emerald-700"
                    disabled={!canApproveProfile || Boolean(actionLoading)}
                    onClick={() => setApproveDriverOpen(true)}
                  >
                    {actionLoading === 'approve-driver' ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <CheckCircle2 className="mr-2 h-4 w-4" />
                    )}
                    Activate driver
                  </Button>
                  <Button
                    variant="destructive"
                    className="w-full"
                    disabled={Boolean(actionLoading)}
                    onClick={() => setRejectDriverOpen(true)}
                  >
                    {actionLoading === 'reject-driver' ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <XCircle className="mr-2 h-4 w-4" />
                    )}
                    Reject compliance
                  </Button>
                  {!canApproveProfile && (
                    <p className="text-center text-xs text-slate-500">
                      Resolve all blocked items above before activating.
                    </p>
                  )}
                </div>
              )}

              {/* Document summary */}
              <div className="space-y-1.5 border-t border-slate-100 pt-3">
                {documents.map((doc) => (
                  <div key={doc.id} className="flex items-center justify-between gap-2 text-xs">
                    <span className="truncate text-slate-600">{doc.documentType.replace(/_/g, ' ')}</span>
                    <span className={`rounded-full px-2 py-0.5 font-semibold ${
                      doc.status === 'APPROVED' ? 'bg-emerald-100 text-emerald-700' :
                      doc.status === 'REJECTED' ? 'bg-red-100 text-red-700' :
                      'bg-amber-100 text-amber-700'
                    }`}>
                      {doc.status}
                    </span>
                  </div>
                ))}
                {documents.length === 0 && (
                  <p className="text-xs text-slate-400">No documents uploaded.</p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* KYC & compliance status */}
          <Card className="border border-slate-200 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm text-slate-700">Status flags</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-slate-600">KYC status</span>
                <Badge className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${driver.kycStatus === 'APPROVED' ? 'bg-emerald-100 text-emerald-800 border-emerald-200' : driver.kycStatus === 'REJECTED' ? 'bg-red-100 text-red-800 border-red-200' : 'bg-amber-100 text-amber-800 border-amber-200'}`}>
                  {driver.kycStatus}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-600">Compliance status</span>
                <Badge className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${driver.complianceStatus === 'CLEAR' ? 'bg-emerald-100 text-emerald-800 border-emerald-200' : 'bg-amber-100 text-amber-800 border-amber-200'}`}>
                  {driver.complianceStatus}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-600">Org status</span>
                <Badge className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${driverStatusTone(driverStatus)}`}>
                  {driverStatus.replace(/_/g, ' ')}
                </Badge>
              </div>
            </CardContent>
          </Card>

          {/* Submitted date */}
          {organizationDriver?.onboardingSubmittedAt && (
            <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-xs text-slate-500 shadow-sm">
              <Clock className="h-4 w-4 flex-shrink-0 text-slate-400" />
              Submitted for review {formatDate(organizationDriver.onboardingSubmittedAt)}
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      <RejectModal
        open={Boolean(rejectDocTarget)}
        title={`Reject ${rejectDocTarget?.documentType.replace(/_/g, ' ') ?? 'document'}`}
        loading={actionLoading === `reject:${rejectDocTarget?.id}`}
        onConfirm={handleRejectDoc}
        onCancel={() => setRejectDocTarget(null)}
      />
      <RejectModal
        open={rejectDriverOpen}
        title="Reject driver compliance"
        loading={actionLoading === 'reject-driver'}
        onConfirm={handleRejectDriver}
        onCancel={() => setRejectDriverOpen(false)}
      />
      <ApproveDriverModal
        open={approveDriverOpen}
        loading={actionLoading === 'approve-driver'}
        onConfirm={handleApproveDriver}
        onCancel={() => setApproveDriverOpen(false)}
      />
    </div>
  );
}
