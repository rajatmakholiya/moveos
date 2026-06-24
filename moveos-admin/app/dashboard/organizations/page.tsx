'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Building2,
  Car,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Copy,
  FileText,
  Link2,
  Loader2,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Search,
  Send,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Users,
  XCircle,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { orgApi, type AuditEvent, type DocStatus, type KycRecord, type OrgDocument, type OrgDriverLink, type OrgInvitation, type OrgStatus, type Organization } from '@/lib/api';

// ─── Status helpers ───────────────────────────────────────────────────────────

function statusColor(status: string) {
  if (status === 'ACTIVE' || status === 'APPROVED') return 'bg-emerald-100 text-emerald-800 border-emerald-200';
  if (status.includes('PENDING')) return 'bg-amber-100 text-amber-800 border-amber-200';
  if (status === 'DRAFT') return 'bg-slate-100 text-slate-700 border-slate-200';
  if (status === 'SUSPENDED' || status === 'REJECTED' || status === 'REMOVED') return 'bg-red-100 text-red-800 border-red-200';
  return 'bg-slate-100 text-slate-700 border-slate-200';
}

function StatusBadge({ status }: { status: string }) {
  return (
    <Badge className={`border text-[10px] font-semibold px-2 py-0.5 rounded-full ${statusColor(status)}`}>
      {status.replace(/_/g, ' ')}
    </Badge>
  );
}

function PlanBadge({ tier }: { tier: string }) {
  const color = tier === 'ENTERPRISE' ? 'bg-purple-100 text-purple-800 border-purple-200' : tier === 'GROWTH' ? 'bg-blue-100 text-blue-800 border-blue-200' : 'bg-slate-100 text-slate-600 border-slate-200';
  return <Badge className={`border text-[10px] font-semibold px-2 py-0.5 rounded-full ${color}`}>{tier}</Badge>;
}

// ─── Metric card ──────────────────────────────────────────────────────────────

function Metric({ label, value, icon: Icon, color = 'text-blue-600' }: { label: string; value: number; icon: typeof Building2; color?: string }) {
  return (
    <Card className="border border-slate-200 shadow-sm">
      <CardContent className="flex items-center justify-between p-4">
        <div>
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">{label}</p>
          <p className="text-2xl font-bold text-slate-900 mt-0.5">{value}</p>
        </div>
        <div className={`p-2.5 rounded-xl bg-slate-50 ${color}`}>
          <Icon className="h-5 w-5" />
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Section collapsible ──────────────────────────────────────────────────────

function Section({ title, icon: Icon, children, defaultOpen = false }: { title: string; icon: typeof Users; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Card className="border border-slate-200 shadow-sm">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-5 py-3.5 text-left hover:bg-slate-50 transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <Icon className="h-4 w-4 text-slate-500" />
          <span className="text-sm font-semibold text-slate-800">{title}</span>
        </div>
        {open ? <ChevronDown className="h-4 w-4 text-slate-400" /> : <ChevronRight className="h-4 w-4 text-slate-400" />}
      </button>
      {open && <div className="border-t border-slate-100 px-5 py-4">{children}</div>}
    </Card>
  );
}

// ─── Create org dialog ────────────────────────────────────────────────────────

function CreateOrgDialog({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ legalName: '', tradeName: '', ownerPhone: '', ownerEmail: '', ownerName: '', gstin: '', pan: '', taxId: '', registrationNo: '', planTier: 'SOLO' as const });

  const set = (k: keyof typeof form) => (v: string) => setForm((p) => ({ ...p, [k]: v }));

  const submit = async () => {
    setError('');
    const validationError = validateTaxFields(form);
    if (validationError) {
      setError(validationError);
      return;
    }
    setLoading(true);
    try {
      await orgApi.create({
        legalName: form.legalName,
        tradeName: form.tradeName || undefined,
        ownerPhone: form.ownerPhone,
        ownerEmail: form.ownerEmail || undefined,
        ownerName: form.ownerName || undefined,
        gstin: form.gstin || undefined,
        pan: form.pan || undefined,
        taxId: form.taxId || undefined,
        registrationNo: form.registrationNo || undefined,
        planTier: form.planTier,
      });
      setOpen(false);
      setForm({ legalName: '', tradeName: '', ownerPhone: '', ownerEmail: '', ownerName: '', gstin: '', pan: '', taxId: '', registrationNo: '', planTier: 'SOLO' });
      onCreated();
    } catch (err: any) {
      setError(err?.message ?? 'Failed to create organization');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="bg-blue-600 hover:bg-blue-700 text-white shadow-sm">
          <Plus className="mr-2 h-4 w-4" />
          New Organization
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Create organization</DialogTitle>
          <DialogDescription>Creates the org in DRAFT status. Assign an owner and submit for review.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 mt-2">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Legal name *" value={form.legalName} onChange={set('legalName')} />
            <Field label="Trade name" value={form.tradeName} onChange={set('tradeName')} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Owner phone * (E.164)" value={form.ownerPhone} onChange={set('ownerPhone')} placeholder="+919876543210" />
            <Field label="Owner email" value={form.ownerEmail} onChange={set('ownerEmail')} />
          </div>
          <Field label="Owner name" value={form.ownerName} onChange={set('ownerName')} />
          <div className="grid grid-cols-2 gap-3">
            <Field label="GSTIN (15 characters)" value={form.gstin} onChange={(value) => set('gstin')(value.toUpperCase())} placeholder="05ABCDE1234F1Z5" />
            <Field label="PAN (10 characters)" value={form.pan} onChange={(value) => set('pan')(value.toUpperCase())} placeholder="ABCDE1234F" />
            <Field label="Tax ID" value={form.taxId} onChange={set('taxId')} placeholder="Local tax identifier" />
            <Field label="Registration number" value={form.registrationNo} onChange={set('registrationNo')} placeholder="Company/permit registration" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-slate-700">Plan tier</Label>
            <Select value={form.planTier} onValueChange={(v) => set('planTier')(v)}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="SOLO">SOLO</SelectItem>
                <SelectItem value="GROWTH">GROWTH</SelectItem>
                <SelectItem value="ENTERPRISE">ENTERPRISE</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
          <Button onClick={() => void submit()} disabled={!form.legalName || !form.ownerPhone || loading} className="mt-1 bg-blue-600 hover:bg-blue-700">
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Create organization
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-slate-700">{label}</Label>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-9 text-sm border-slate-200 focus:border-blue-400"
      />
    </div>
  );
}

function validateTaxFields(form: { gstin?: string; pan?: string; taxId?: string; registrationNo?: string }) {
  const gstin = form.gstin?.trim().toUpperCase();
  const pan = form.pan?.trim().toUpperCase();
  if (gstin && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(gstin)) {
    return 'GSTIN must be a valid 15-character Indian GST number.';
  }
  if (pan && !/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan)) {
    return 'PAN must be a valid 10-character Indian PAN.';
  }
  if (form.taxId && form.taxId.trim().length > 32) {
    return 'Tax ID must be 32 characters or fewer.';
  }
  if (form.registrationNo && form.registrationNo.trim().length > 64) {
    return 'Registration number must be 64 characters or fewer.';
  }
  return '';
}

function EditOrganizationTaxDialog({ org, onDone }: { org: Organization; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    gstin: org.gstin ?? '',
    pan: org.pan ?? '',
    taxId: org.taxId ?? '',
    registrationNo: org.registrationNo ?? '',
  });

  useEffect(() => {
    setForm({
      gstin: org.gstin ?? '',
      pan: org.pan ?? '',
      taxId: org.taxId ?? '',
      registrationNo: org.registrationNo ?? '',
    });
  }, [org]);

  const set = (key: keyof typeof form) => (value: string) => setForm((current) => ({ ...current, [key]: value }));

  const submit = async () => {
    setError('');
    const validationError = validateTaxFields(form);
    if (validationError) {
      setError(validationError);
      return;
    }
    setLoading(true);
    try {
      await orgApi.updateDetails(org.id, {
        gstin: form.gstin.trim().toUpperCase() || undefined,
        pan: form.pan.trim().toUpperCase() || undefined,
        taxId: form.taxId.trim() || undefined,
        registrationNo: form.registrationNo.trim() || undefined,
      });
      setOpen(false);
      onDone();
    } catch (err: any) {
      setError(err?.message ?? 'Failed to update tax registration details');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm" variant="outline" className="border-slate-200">Edit tax details</Button></DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>GST / tax registration</DialogTitle>
          <DialogDescription>Update statutory tax identifiers used for organization compliance review.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="GSTIN (15 characters)" value={form.gstin} onChange={(value) => set('gstin')(value.toUpperCase())} placeholder="05ABCDE1234F1Z5" />
          <Field label="PAN (10 characters)" value={form.pan} onChange={(value) => set('pan')(value.toUpperCase())} placeholder="ABCDE1234F" />
          <Field label="Tax ID" value={form.taxId} onChange={set('taxId')} placeholder="Local tax identifier" />
          <Field label="Registration number" value={form.registrationNo} onChange={set('registrationNo')} placeholder="Company/permit registration" />
        </div>
        {error ? <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p> : null}
        <Button onClick={() => void submit()} disabled={loading} className="bg-blue-600 hover:bg-blue-700">
          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Save tax details
        </Button>
      </DialogContent>
    </Dialog>
  );
}

// ─── Invite driver dialog ─────────────────────────────────────────────────────

function InviteDriverDialog({ orgId, onDone }: { orgId: string; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ inviteToken: string; inviteUrl: string } | null>(null);
  const [error, setError] = useState('');

  const submit = async () => {
    setError('');
    setLoading(true);
    try {
      const res = await orgApi.createInvitation(orgId, { phone, role: 'DRIVER' });
      setResult({ inviteToken: res.data.inviteToken, inviteUrl: res.data.invitation.id });
      setPhone('');
      onDone();
    } catch (err: any) {
      setError(err?.message ?? 'Failed to send invite');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setResult(null); }}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="text-xs border-slate-200">
          <Send className="mr-1.5 h-3.5 w-3.5" /> Invite driver
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Invite driver</DialogTitle>
        </DialogHeader>
        {result ? (
          <div className="space-y-3">
            <p className="text-sm text-emerald-700 bg-emerald-50 rounded-lg px-3 py-2">Invite created successfully.</p>
            <div className="space-y-1">
              <Label className="text-xs text-slate-500">Invite link</Label>
              <code className="block text-xs bg-slate-100 rounded px-2 py-1.5 break-all">/organization-invite/{result.inviteToken}</code>
            </div>
            <Button variant="outline" className="w-full text-xs" onClick={() => setOpen(false)}>Close</Button>
          </div>
        ) : (
          <div className="space-y-3">
            <Field label="Driver phone (E.164)" value={phone} onChange={setPhone} placeholder="+919876543210" />
            {error && <p className="text-xs text-red-600">{error}</p>}
            <Button onClick={() => void submit()} disabled={!phone || loading} className="w-full bg-blue-600 hover:bg-blue-700">
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Send invitation
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Status change actions ────────────────────────────────────────────────────

function StatusActions({ org, onRefresh }: { org: Organization; onRefresh: () => void }) {
  const [loading, setLoading] = useState<OrgStatus | null>(null);
  const [reasonOpen, setReasonOpen] = useState<OrgStatus | null>(null);
  const [reason, setReason] = useState('');

  const apply = async (status: OrgStatus, r?: string) => {
    setLoading(status);
    try {
      await orgApi.updateStatus(org.id, { status, reason: r });
      onRefresh();
    } finally {
      setLoading(null);
      setReasonOpen(null);
      setReason('');
    }
  };

  const allActions: Array<{ status: OrgStatus; label: string; className: string; needsReason?: boolean }> = [
    { status: 'ACTIVE', label: 'Approve', className: 'bg-emerald-600 hover:bg-emerald-700 text-white' },
    { status: 'SUSPENDED', label: 'Suspend', className: 'bg-amber-600 hover:bg-amber-700 text-white', needsReason: true },
    { status: 'REJECTED', label: 'Reject', className: 'bg-red-600 hover:bg-red-700 text-white', needsReason: true },
  ];
  const actions = allActions.filter((a) => a.status !== org.status);

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {actions.map((a) => (
          <Button
            key={a.status}
            size="sm"
            className={`text-xs h-8 ${a.className}`}
            disabled={!!loading}
            onClick={() => a.needsReason ? setReasonOpen(a.status) : void apply(a.status)}
          >
            {loading === a.status && <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />}
            {a.label}
          </Button>
        ))}
      </div>
      <Dialog open={!!reasonOpen} onOpenChange={(v) => !v && setReasonOpen(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{reasonOpen === 'REJECTED' ? 'Reject' : 'Suspend'} organization</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Textarea placeholder="Reason (optional)" value={reason} onChange={(e) => setReason(e.target.value)} rows={3} className="text-sm" />
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1 text-xs" onClick={() => setReasonOpen(null)}>Cancel</Button>
              <Button className="flex-1 text-xs bg-red-600 hover:bg-red-700 text-white" disabled={!!loading} onClick={() => void apply(reasonOpen!, reason || undefined)}>
                {loading && <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />}
                Confirm
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── Document review row ──────────────────────────────────────────────────────

function DocReviewRow({ doc, orgId, onRefresh }: { doc: OrgDocument; orgId: string; onRefresh: () => void }) {
  const [loading, setLoading] = useState<DocStatus | null>(null);
  const approve = async () => {
    setLoading('APPROVED');
    try { await orgApi.reviewDocument(orgId, doc.id, { status: 'APPROVED' }); onRefresh(); } finally { setLoading(null); }
  };
  const reject = async () => {
    const note = window.prompt('Rejection note (optional):') ?? undefined;
    setLoading('REJECTED');
    try { await orgApi.reviewDocument(orgId, doc.id, { status: 'REJECTED', rejectionNote: note }); onRefresh(); } finally { setLoading(null); }
  };
  return (
    <div className="flex items-center justify-between gap-3 py-2.5 border-b border-slate-100 last:border-0">
      <div className="min-w-0">
        <p className="text-sm font-medium text-slate-800 truncate">{doc.type.replace(/_/g, ' ')}</p>
        {doc.expiresAt && <p className="text-xs text-slate-400">Expires {new Date(doc.expiresAt).toLocaleDateString()}</p>}
        {doc.rejectionNote && <p className="text-xs text-red-500">{doc.rejectionNote}</p>}
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <StatusBadge status={doc.status} />
        {doc.status === 'PENDING' && (
          <>
            <Button size="sm" variant="ghost" className="h-7 px-2 text-emerald-600 hover:bg-emerald-50" disabled={!!loading} onClick={() => void approve()}>
              {loading === 'APPROVED' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
            </Button>
            <Button size="sm" variant="ghost" className="h-7 px-2 text-red-500 hover:bg-red-50" disabled={!!loading} onClick={() => void reject()}>
              {loading === 'REJECTED' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <XCircle className="h-3.5 w-3.5" />}
            </Button>
          </>
        )}
        <a href={doc.url} target="_blank" rel="noreferrer" className="text-xs text-blue-500 hover:underline">View</a>
      </div>
    </div>
  );
}

// ─── KYC review row ───────────────────────────────────────────────────────────

function KycRow({ kyc, onRefresh }: { kyc: KycRecord; onRefresh: () => void }) {
  const [loading, setLoading] = useState<DocStatus | null>(null);
  const review = async (status: DocStatus) => {
    const reason = status === 'REJECTED' ? window.prompt('Rejection reason:') ?? undefined : undefined;
    setLoading(status);
    try { await orgApi.reviewKyc(kyc.id, { status, rejectionReason: reason }); onRefresh(); } finally { setLoading(null); }
  };
  return (
    <div className="flex items-center justify-between gap-3 py-2.5 border-b border-slate-100 last:border-0">
      <div className="min-w-0">
        <p className="text-sm font-medium text-slate-800">{kyc.documentType.replace(/_/g, ' ')}</p>
        {kyc.documentNo && <p className="text-xs text-slate-400">No: {kyc.documentNo}</p>}
        {kyc.expiresAt && <p className="text-xs text-slate-400">Exp: {new Date(kyc.expiresAt).toLocaleDateString()}</p>}
        {kyc.rejectionReason && <p className="text-xs text-red-500">{kyc.rejectionReason}</p>}
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <StatusBadge status={kyc.status} />
        {kyc.status === 'PENDING' && (
          <>
            <Button size="sm" variant="ghost" className="h-7 px-2 text-emerald-600 hover:bg-emerald-50" disabled={!!loading} onClick={() => void review('APPROVED')}>
              {loading === 'APPROVED' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}
            </Button>
            <Button size="sm" variant="ghost" className="h-7 px-2 text-red-500 hover:bg-red-50" disabled={!!loading} onClick={() => void review('REJECTED')}>
              {loading === 'REJECTED' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <XCircle className="h-3.5 w-3.5" />}
            </Button>
          </>
        )}
        <a href={kyc.documentUrl} target="_blank" rel="noreferrer" className="text-xs text-blue-500 hover:underline">View</a>
      </div>
    </div>
  );
}

// ─── Driver compliance row ────────────────────────────────────────────────────

function DriverComplianceRow({ link, orgId, onRefresh }: { link: OrgDriverLink; orgId: string; onRefresh: () => void }) {
  const [loading, setLoading] = useState(false);
  const approve = async () => {
    setLoading(true);
    try { await orgApi.reviewDriverCompliance(orgId, link.driverId, { status: 'ACTIVE' }); onRefresh(); } finally { setLoading(false); }
  };
  const suspend = async () => {
    const reason = window.prompt('Reason (optional):') ?? undefined;
    setLoading(true);
    try { await orgApi.reviewDriverCompliance(orgId, link.driverId, { status: 'SUSPENDED', reason }); onRefresh(); } finally { setLoading(false); }
  };
  const name = link.driver?.name ?? link.driver?.user?.name ?? 'Driver';
  const phone = link.driver?.user?.phone ?? '—';
  return (
    <div className="flex items-center justify-between gap-3 py-2.5 border-b border-slate-100 last:border-0">
      <div className="min-w-0">
        <p className="text-sm font-medium text-slate-800">{name}</p>
        <p className="text-xs text-slate-400">{phone}</p>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <StatusBadge status={link.status} />
        {link.status === 'PENDING_COMPLIANCE' && (
          <>
            <Button size="sm" variant="ghost" className="h-7 px-2 text-emerald-600 hover:bg-emerald-50" disabled={loading} onClick={() => void approve()}>
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}
            </Button>
            <Button size="sm" variant="ghost" className="h-7 px-2 text-red-500 hover:bg-red-50" disabled={loading} onClick={() => void suspend()}>
              <XCircle className="h-3.5 w-3.5" />
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Audit log ────────────────────────────────────────────────────────────────

function AuditLog({ events }: { events: AuditEvent[] }) {
  if (!events.length) return <p className="text-sm text-slate-400">No events yet.</p>;
  return (
    <div className="space-y-0 divide-y divide-slate-100">
      {events.map((ev) => (
        <div key={ev.id} className="py-2 flex items-start gap-3">
          <div className="mt-0.5 h-2 w-2 rounded-full bg-blue-400 flex-shrink-0 mt-1.5" />
          <div className="min-w-0">
            <p className="text-xs font-mono text-slate-700">{ev.action}</p>
            {ev.reason && <p className="text-xs text-slate-400 italic">{ev.reason}</p>}
            <p className="text-[10px] text-slate-300 mt-0.5">{new Date(ev.createdAt).toLocaleString()}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Org invitation row with share link ──────────────────────────────────────

function OrgInvitationRow({ invitation, orgId, onRefresh: _onRefresh }: { invitation: OrgInvitation; orgId: string; onRefresh: () => void }) {
  const [copying, setCopying] = useState(false);

  const copyLink = async () => {
    setCopying(true);
    try {
      const res = await orgApi.refreshInviteLink(orgId, invitation.id);
      const pwaBase = process.env.NEXT_PUBLIC_PWA_URL ?? 'http://localhost:3010';
      await navigator.clipboard.writeText(pwaBase + res.data.inviteUrl);
    } catch {
      // ignore clipboard errors
    } finally {
      setCopying(false);
    }
  };

  return (
    <div className="flex items-center justify-between py-2.5 border-b border-slate-100 last:border-0">
      <div>
        <p className="text-sm font-medium text-slate-800">{invitation.phone}</p>
        <p className="text-xs text-slate-400">{invitation.role} · expires {new Date(invitation.expiresAt).toLocaleDateString()}</p>
      </div>
      <div className="flex items-center gap-2">
        <StatusBadge status="INVITED" />
        <Button size="sm" variant="ghost" className="h-7 px-2 text-blue-600 hover:bg-blue-50" disabled={copying} onClick={() => void copyLink()} title="Copy invite link">
          {copying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Copy className="h-3.5 w-3.5" />}
        </Button>
      </div>
    </div>
  );
}

// ─── Org detail panel ─────────────────────────────────────────────────────────

function OrgDetailPanel({ orgId, onStatusChange }: { orgId: string; onStatusChange: () => void }) {
  const [data, setData] = useState<{ org: Organization; kyc: KycRecord[] } | null>(null);
  const [invitations, setInvitations] = useState<OrgInvitation[]>([]);
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [orgRes, auditRes, invRes] = await Promise.all([
        orgApi.get(orgId),
        orgApi.auditLog(orgId),
        orgApi.listInvitations(orgId),
      ]);
      setData({ org: orgRes.data.organization, kyc: orgRes.data.kycRecords });
      setAuditEvents(auditRes.data.events);
      setInvitations(invRes.data.invitations);
    } catch (err: any) {
      setError(err?.message ?? 'Failed to load organization');
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => { void load(); }, [load]);

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-blue-500" /></div>;
  if (error) return <div className="flex items-center gap-2 p-4 text-red-600 text-sm"><AlertCircle className="h-4 w-4" /> {error}</div>;
  if (!data) return null;

  const { org, kyc } = data;
  const pendingDocs = org.documents?.filter((d) => d.status === 'PENDING') ?? [];
  const pendingKyc = kyc.filter((k) => k.status === 'PENDING');
  const pendingDrivers = org.drivers?.filter((d) => d.status === 'PENDING_COMPLIANCE') ?? [];

  return (
    <div className="space-y-4">
      {/* Header */}
      <Card className="border border-slate-200 shadow-sm">
        <CardContent className="p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg font-bold text-slate-900">{org.tradeName || org.legalName}</h2>
                <StatusBadge status={org.status} />
                <PlanBadge tier={org.planTier} />
              </div>
              <p className="text-sm text-slate-500 mt-0.5">{org.legalName}</p>
              <div className="flex items-center gap-4 mt-2 text-xs text-slate-400 flex-wrap">
                {org.primaryPhone && <span>{org.primaryPhone}</span>}
                {org.primaryEmail && <span>{org.primaryEmail}</span>}
                {org.gstin && <span>GSTIN: {org.gstin}</span>}
                {org.pan && <span>PAN: {org.pan}</span>}
                {org.taxId && <span>Tax ID: {org.taxId}</span>}
                {org.registrationNo && <span>Registration: {org.registrationNo}</span>}
              </div>
              {org.rejectionReason && (
                <p className="mt-2 text-xs text-red-500 bg-red-50 rounded px-2 py-1">Rejection: {org.rejectionReason}</p>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <EditOrganizationTaxDialog org={org} onDone={() => { void load(); onStatusChange(); }} />
              <StatusActions org={org} onRefresh={() => { void load(); onStatusChange(); }} />
            </div>
          </div>

          {/* Counters */}
          <div className="mt-4 grid grid-cols-3 gap-3">
            {[
              { label: 'Drivers', value: org.drivers?.length ?? 0, icon: Users },
              { label: 'Vehicles', value: org.vehicles?.length ?? 0, icon: Car },
              { label: 'Documents', value: org.documents?.length ?? 0, icon: FileText },
            ].map((s) => (
              <div key={s.label} className="rounded-xl bg-slate-50 border border-slate-100 p-3 flex items-center gap-2.5">
                <s.icon className="h-4 w-4 text-slate-400 flex-shrink-0" />
                <div>
                  <p className="text-[10px] text-slate-400 uppercase tracking-wide">{s.label}</p>
                  <p className="text-base font-bold text-slate-900">{s.value}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Pending review alerts */}
      {(pendingDocs.length > 0 || pendingKyc.length > 0 || pendingDrivers.length > 0) && (
        <div className="flex items-start gap-2 rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
          <ShieldAlert className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <span>
            Awaiting review: {[
              pendingDocs.length ? `${pendingDocs.length} document${pendingDocs.length > 1 ? 's' : ''}` : '',
              pendingKyc.length ? `${pendingKyc.length} KYC record${pendingKyc.length > 1 ? 's' : ''}` : '',
              pendingDrivers.length ? `${pendingDrivers.length} driver${pendingDrivers.length > 1 ? 's' : ''}` : '',
            ].filter(Boolean).join(', ')}
          </span>
        </div>
      )}

      {/* KYC Documents */}
      <Section title={`KYC / Compliance (${kyc.length})`} icon={Shield} defaultOpen={pendingKyc.length > 0}>
        {kyc.length ? (
          kyc.map((k) => <KycRow key={k.id} kyc={k} onRefresh={() => void load()} />)
        ) : (
          <p className="text-sm text-slate-400">No KYC documents submitted yet.</p>
        )}
      </Section>

      {/* Org documents */}
      <Section title={`Organization documents (${org.documents?.length ?? 0})`} icon={FileText} defaultOpen={pendingDocs.length > 0}>
        {org.documents?.length ? (
          org.documents.map((d) => <DocReviewRow key={d.id} doc={d} orgId={org.id} onRefresh={() => void load()} />)
        ) : (
          <p className="text-sm text-slate-400">No documents uploaded yet.</p>
        )}
      </Section>

      {/* Drivers */}
      <Section title={`Drivers (${org.drivers?.length ?? 0})`} icon={Users} defaultOpen={pendingDrivers.length > 0}>
        <div className="flex justify-between items-center mb-3">
          <span />
          <InviteDriverDialog orgId={org.id} onDone={() => void load()} />
        </div>
        {org.drivers?.length ? (
          org.drivers.map((link) => <DriverComplianceRow key={link.id} link={link} orgId={org.id} onRefresh={() => void load()} />)
        ) : (
          <p className="text-sm text-slate-400">No drivers linked yet.</p>
        )}
      </Section>

      {/* Vehicles */}
      <Section title={`Vehicles (${org.vehicles?.length ?? 0})`} icon={Car}>
        {org.vehicles?.length ? (
          org.vehicles.map((v) => (
            <div key={v.id} className="flex items-center justify-between py-2.5 border-b border-slate-100 last:border-0">
              <div>
                <p className="text-sm font-medium text-slate-800">{v.vehicle?.plate ?? v.vehicleId}</p>
                <p className="text-xs text-slate-400">{v.vehicle?.type} · {v.vehicle?.complianceStatus}</p>
              </div>
              <StatusBadge status={v.status} />
            </div>
          ))
        ) : (
          <p className="text-sm text-slate-400">No vehicles registered yet.</p>
        )}
      </Section>

      {/* Invitations */}
      <Section title={`Pending invitations (${invitations.filter((i) => i.status === 'INVITED').length})`} icon={Send}>
        {invitations.filter((i) => i.status === 'INVITED').length ? (
          invitations.filter((i) => i.status === 'INVITED').map((inv) => (
            <OrgInvitationRow key={inv.id} invitation={inv} orgId={org.id} onRefresh={() => void load()} />
          ))
        ) : (
          <p className="text-sm text-slate-400">No pending invitations.</p>
        )}
      </Section>

      {/* Audit log */}
      <Section title="Activity log" icon={ClipboardList}>
        <AuditLog events={auditEvents} />
      </Section>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function OrganizationsPage() {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<OrgStatus | 'ALL'>('ALL');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const loadOrgs = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await orgApi.list(statusFilter !== 'ALL' ? { status: statusFilter } : undefined);
      setOrganizations(res.data.organizations);
      if (!selectedId && res.data.organizations.length > 0) {
        setSelectedId(res.data.organizations[0].id);
      }
    } catch (err: any) {
      setError(err?.message ?? 'Failed to load organizations');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, selectedId]);

  useEffect(() => { void loadOrgs(); }, [statusFilter]);

  const filtered = useMemo(
    () =>
      organizations.filter((org) => {
        const q = search.toLowerCase();
        return org.legalName.toLowerCase().includes(q) || (org.tradeName ?? '').toLowerCase().includes(q);
      }),
    [organizations, search],
  );

  const stats = useMemo(() => ({
    total: organizations.length,
    active: organizations.filter((o) => o.status === 'ACTIVE').length,
    pending: organizations.filter((o) => o.status === 'PENDING_REVIEW').length,
    draft: organizations.filter((o) => o.status === 'DRAFT').length,
  }), [organizations]);

  return (
    <div className="p-5 space-y-5 min-h-full bg-slate-50">
      {/* Page header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-slate-900">
            <Building2 className="h-5 w-5 text-blue-600" />
            Organizations
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">Onboard fleet operators, review KYC, and manage compliance.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => void loadOrgs()} className="text-xs border-slate-200 text-slate-600">
            <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <CreateOrgDialog onCreated={() => void loadOrgs()} />
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <Metric label="Total" value={stats.total} icon={Building2} />
        <Metric label="Active" value={stats.active} icon={CheckCircle2} color="text-emerald-600" />
        <Metric label="Pending review" value={stats.pending} icon={ShieldAlert} color="text-amber-600" />
        <Metric label="Draft" value={stats.draft} icon={MoreHorizontal} color="text-slate-500" />
      </div>

      {error && (
        <div className="flex items-center gap-2 text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm">
          <AlertCircle className="h-4 w-4 flex-shrink-0" /> {error}
        </div>
      )}

      {/* Main grid */}
      <div className="grid gap-5 lg:grid-cols-[300px_1fr]">
        {/* List panel */}
        <div className="space-y-3">
          <Card className="border border-slate-200 shadow-sm">
            <CardContent className="p-3 space-y-2.5">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
                <Input
                  className="pl-8 h-8 text-sm border-slate-200 focus:border-blue-400"
                  placeholder="Search organizations…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as OrgStatus | 'ALL')}>
                <SelectTrigger className="h-8 text-xs border-slate-200">
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All statuses</SelectItem>
                  <SelectItem value="DRAFT">Draft</SelectItem>
                  <SelectItem value="PENDING_REVIEW">Pending review</SelectItem>
                  <SelectItem value="ACTIVE">Active</SelectItem>
                  <SelectItem value="SUSPENDED">Suspended</SelectItem>
                  <SelectItem value="REJECTED">Rejected</SelectItem>
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-blue-500" /></div>
          ) : filtered.length === 0 ? (
            <Card className="border border-slate-200 shadow-sm">
              <CardContent className="p-4 text-center text-sm text-slate-400">
                {search ? 'No matches' : 'No organizations yet'}
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-1.5">
              {filtered.map((org) => (
                <button
                  key={org.id}
                  type="button"
                  onClick={() => setSelectedId(org.id)}
                  className={`w-full rounded-xl border p-3 text-left transition-all ${
                    selectedId === org.id
                      ? 'border-blue-400 bg-blue-50 shadow-sm'
                      : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900 truncate">{org.tradeName || org.legalName}</p>
                      <p className="text-xs text-slate-400 truncate mt-0.5">{org.primaryPhone}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1 flex-shrink-0">
                      <StatusBadge status={org.status} />
                      <PlanBadge tier={org.planTier} />
                    </div>
                  </div>
                  {org._count && (
                    <div className="mt-2 flex items-center gap-3 text-[10px] text-slate-400">
                      <span className="flex items-center gap-1"><Users className="h-3 w-3" />{org._count.drivers}</span>
                      <span className="flex items-center gap-1"><Car className="h-3 w-3" />{org._count.vehicles}</span>
                      <span className="flex items-center gap-1"><FileText className="h-3 w-3" />{org._count.documents}</span>
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Detail panel */}
        <div className="min-w-0">
          {selectedId ? (
            <OrgDetailPanel key={selectedId} orgId={selectedId} onStatusChange={() => void loadOrgs()} />
          ) : (
            <Card className="border border-slate-200 shadow-sm h-full">
              <CardContent className="flex flex-col items-center justify-center py-24 text-center gap-3">
                <Building2 className="h-10 w-10 text-slate-300" />
                <p className="text-sm text-slate-400">Select an organization to view details</p>
                <p className="text-xs text-slate-300">Or create a new one using the button above</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
