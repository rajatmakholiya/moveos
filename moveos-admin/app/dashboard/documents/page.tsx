'use client';

import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Building2,
  Car,
  CheckCircle2,
  ExternalLink,
  Eye,
  FileText,
  Loader2,
  Pencil,
  RefreshCw,
  ShieldCheck,
  UserRound,
  XCircle,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/lib/AuthContext';
import { orgApi, type DocStatus, type KycRecord, type Organization } from '@/lib/api';

type DocumentItem = {
  id: string;
  orgId: string;
  orgLabel: string;
  category: 'organization' | 'vehicle' | 'driver' | 'kyc';
  ownerLabel: string;
  document: string;
  documentNo?: string;
  status: DocStatus;
  expiresAt?: string;
  createdAt?: string;
  url?: string;
};

const categories = [
  { key: 'organization', title: 'Organization Documents', icon: Building2, empty: 'No organization documents uploaded.' },
  { key: 'vehicle', title: 'Vehicle Documents', icon: Car, empty: 'No vehicle documents uploaded.' },
  { key: 'driver', title: 'Driver Documents', icon: UserRound, empty: 'No driver documents uploaded.' },
  { key: 'kyc', title: 'KYC Review Records', icon: ShieldCheck, empty: 'No KYC records submitted.' },
] as const;

function StatusBadge({ status }: { status?: string }) {
  const tone = status === 'APPROVED'
    ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
    : status === 'REJECTED' || status === 'EXPIRED'
      ? 'bg-red-100 text-red-800 border-red-200'
      : 'bg-amber-100 text-amber-800 border-amber-200';
  return <Badge className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${tone}`}>{(status || 'UNKNOWN').replace(/_/g, ' ')}</Badge>;
}

function formatDate(value?: string | null) {
  return value ? new Date(value).toLocaleDateString() : 'Not captured';
}

function isImage(url?: string) {
  return Boolean(url && /\.(png|jpg|jpeg|webp|gif)(\?|$)/i.test(url));
}

function isPdf(url?: string) {
  return Boolean(url && /\.pdf(\?|$)/i.test(url));
}

function orgLabel(org?: Organization) {
  return org?.tradeName || org?.legalName || 'Organization';
}

export default function DocumentsPage() {
  const { user } = useAuth();
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [orgId, setOrgId] = useState(user?.defaultOrganizationId ?? '');
  const [items, setItems] = useState<DocumentItem[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<DocumentItem['category'] | null>(null);
  const [selectedDocument, setSelectedDocument] = useState<DocumentItem | null>(null);
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [editingDoc, setEditingDoc] = useState<DocumentItem | null>(null);
  const [editForm, setEditForm] = useState({ documentNo: '', expiresAt: '', url: '' });
  const [editSaving, setEditSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const isSuperAdmin = user?.role === 'SUPER_ADMIN';
  const isOrgAdmin = user?.role === 'ORG_ADMIN';
  const canAccess = isSuperAdmin || isOrgAdmin;

  const buildItems = useCallback(async (orgs: Organization[], targetOrgIds: string[]) => {
    const results = await Promise.all(targetOrgIds.map(async (targetOrgId) => {
      const org = orgs.find((item) => item.id === targetOrgId);
      const label = orgLabel(org);
      const res = await orgApi.documentCenter(targetOrgId);
      return [
        ...res.data.organizationDocuments.map((doc) => ({
          id: doc.id,
          orgId: targetOrgId,
          orgLabel: label,
          category: 'organization' as const,
          ownerLabel: label,
          document: doc.type,
          documentNo: doc.documentNo,
          status: doc.status,
          expiresAt: doc.expiresAt,
          createdAt: doc.createdAt,
          url: doc.url,
        })),
        ...res.data.vehicleDocuments.map((doc) => ({
          id: doc.id,
          orgId: targetOrgId,
          orgLabel: label,
          category: 'vehicle' as const,
          ownerLabel: `${label} / Vehicle ${doc.vehicleId?.slice(-6) ?? ''}`.trim(),
          document: doc.type,
          documentNo: doc.documentNo,
          status: doc.status,
          expiresAt: doc.expiresAt,
          createdAt: doc.createdAt,
          url: doc.url,
        })),
        ...res.data.driverDocuments.map((doc) => ({
          id: doc.id,
          orgId: targetOrgId,
          orgLabel: label,
          category: 'driver' as const,
          ownerLabel: `${label} / Driver ${doc.driverId?.slice(-6) ?? ''}`.trim(),
          document: doc.type,
          documentNo: doc.documentNo,
          status: doc.status,
          expiresAt: doc.expiresAt,
          createdAt: doc.createdAt,
          url: doc.url,
        })),
        ...res.data.kycRecords.map((record: KycRecord) => ({
          id: record.id,
          orgId: targetOrgId,
          orgLabel: label,
          category: 'kyc' as const,
          ownerLabel: `${label} / ${record.entityType} ${record.entityId.slice(-6)}`,
          document: record.documentType,
          documentNo: record.documentNo,
          status: record.status,
          expiresAt: record.expiresAt,
          createdAt: record.createdAt,
          url: record.documentUrl,
        })),
      ];
    }));
    return results.flat();
  }, []);

  const load = useCallback(async () => {
    if (!canAccess) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');
    try {
      const orgRes = isSuperAdmin ? await orgApi.list() : await orgApi.myOrganizations();
      const orgs = orgRes.data.organizations;
      setOrganizations(orgs);

      const nextOrgId = orgId || orgs[0]?.id || '';
      setOrgId(nextOrgId);

      const targetOrgIds = nextOrgId ? [nextOrgId] : [];

      setItems(targetOrgIds.length ? await buildItems(orgs, targetOrgIds) : []);
    } catch (err: any) {
      setError(err?.message ?? 'Failed to load documents');
    } finally {
      setLoading(false);
    }
  }, [buildItems, canAccess, isSuperAdmin, orgId]);

  useEffect(() => {
    void load();
  }, [load]);

  const grouped = useMemo(() => Object.fromEntries(categories.map((category) => [
    category.key,
    items.filter((item) => item.category === category.key),
  ])) as Record<DocumentItem['category'], DocumentItem[]>, [items]);

  const metrics = useMemo(() => ({
    total: items.length,
    pending: items.filter((item) => item.status === 'PENDING').length,
    approved: items.filter((item) => item.status === 'APPROVED').length,
  }), [items]);

  const selectedOrganization = useMemo(
    () => organizations.find((org) => org.id === orgId),
    [orgId, organizations],
  );

  const reviewDocument = async (doc: DocumentItem, status: 'APPROVED' | 'REJECTED') => {
    const reason = status === 'REJECTED' ? window.prompt('Rejection reason:') ?? undefined : undefined;
    setReviewingId(`${doc.category}:${doc.id}:${status}`);
    try {
      if (doc.category === 'organization') {
        await orgApi.reviewDocument(doc.orgId, doc.id, { status, rejectionNote: reason });
      } else if (doc.category === 'vehicle') {
        await orgApi.reviewVehicleDocument(doc.id, { status, rejectionNote: reason });
      } else if (doc.category === 'driver') {
        await orgApi.reviewDriverDocument(doc.id, { status, rejectionNote: reason });
      } else if (doc.category === 'kyc') {
        await orgApi.reviewKyc(doc.id, { status, rejectionReason: reason });
      }
      setSelectedDocument(null);
      await load();
    } finally {
      setReviewingId(null);
    }
  };

  const openEdit = (doc: DocumentItem) => {
    setEditingDoc(doc);
    setEditForm({
      documentNo: doc.documentNo ?? '',
      expiresAt: doc.expiresAt ? doc.expiresAt.slice(0, 10) : '',
      url: doc.url ?? '',
    });
  };

  const saveEdit = async () => {
    if (!editingDoc) return;
    setEditSaving(true);
    try {
      const body = {
        documentNo: editForm.documentNo || undefined,
        expiresAt: editForm.expiresAt || undefined,
        url: editForm.url || undefined,
      };
      if (editingDoc.category === 'vehicle') {
        await orgApi.updateVehicleDocument(editingDoc.id, body);
      } else if (editingDoc.category === 'driver') {
        await orgApi.updateDriverDocument(editingDoc.id, body);
      }
      setEditingDoc(null);
      await load();
    } finally {
      setEditSaving(false);
    }
  };

  if (!canAccess) {
    return <div className="p-6"><Card><CardContent className="p-6 text-sm text-slate-600">Documents are available from an organization admin or super admin account.</CardContent></Card></div>;
  }

  return (
    <div className="min-h-full space-y-5 bg-slate-50 p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-slate-900"><FileText className="h-5 w-5 text-blue-600" /> Documents / KYC</h1>
          <p className="mt-0.5 text-sm text-slate-500">{isSuperAdmin ? 'Select an organization to review only its submitted documents.' : 'Uploaded organization, vehicle, driver, and KYC documents grouped for review.'}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {(isSuperAdmin || organizations.length > 1) && (
            <Select value={orgId} onValueChange={setOrgId}>
              <SelectTrigger className="h-9 w-64 bg-white"><SelectValue /></SelectTrigger>
              <SelectContent>
                {organizations.map((org) => <SelectItem key={org.id} value={org.id}>{orgLabel(org)}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          <Button size="sm" variant="outline" onClick={() => void load()} className="border-slate-200"><RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh</Button>
        </div>
      </div>

      {error ? <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"><AlertCircle className="h-4 w-4" />{error}</div> : null}

      {isSuperAdmin ? (
        <Card className="border border-slate-200 shadow-sm">
          <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase text-slate-500">Selected organization</p>
              <p className="truncate text-lg font-semibold text-slate-900">{selectedOrganization ? orgLabel(selectedOrganization) : 'No organization selected'}</p>
              {selectedOrganization ? (
                <p className="mt-0.5 text-sm text-slate-500">
                  {[selectedOrganization.primaryPhone, selectedOrganization.primaryEmail, selectedOrganization.gstin].filter(Boolean).join(' · ') || selectedOrganization.id}
                </p>
              ) : null}
            </div>
            <StatusBadge status={selectedOrganization?.status} />
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-3">
        <Metric label="Total documents" value={metrics.total} icon={<FileText className="h-5 w-5 text-blue-600" />} />
        <Metric label="Pending review" value={metrics.pending} icon={<ShieldCheck className="h-5 w-5 text-amber-600" />} />
        <Metric label="Approved" value={metrics.approved} icon={<ShieldCheck className="h-5 w-5 text-emerald-600" />} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {categories.map((category) => {
          const Icon = category.icon;
          const docs = grouped[category.key];
          return (
            <button key={category.key} type="button" onClick={() => setSelectedCategory(category.key)} className="text-left">
              <Card className="h-full border border-slate-200 shadow-sm transition hover:border-blue-200 hover:shadow-md">
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="flex items-center gap-2 text-base"><Icon className="h-5 w-5 text-blue-600" />{category.title}</CardTitle>
                  <Badge variant="outline">{docs.length}</Badge>
                </CardHeader>
                <CardContent>
                  {loading ? (
                    <div className="py-8 text-center text-sm text-slate-500">Loading...</div>
                  ) : docs.length ? (
                    <div className="space-y-2">
                      {docs.slice(0, 3).map((doc) => (
                        <div key={doc.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 p-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-slate-900">{doc.document.replace(/_/g, ' ')}</p>
                            <p className="truncate text-xs text-slate-500">{doc.ownerLabel}</p>
                          </div>
                          <StatusBadge status={doc.status} />
                        </div>
                      ))}
                      {docs.length > 3 ? <p className="text-xs text-slate-500">Open to view {docs.length - 3} more.</p> : null}
                    </div>
                  ) : (
                    <div className="py-8 text-center text-sm text-slate-500">{category.empty}</div>
                  )}
                </CardContent>
              </Card>
            </button>
          );
        })}
      </div>

      <Dialog open={Boolean(selectedCategory)} onOpenChange={(open) => !open && setSelectedCategory(null)}>
        <DialogContent className="h-[92vh] max-w-6xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{categories.find((category) => category.key === selectedCategory)?.title ?? 'Documents'}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {(selectedCategory ? grouped[selectedCategory] : []).map((doc) => (
              <DocumentCard
                key={`${doc.category}:${doc.id}:${doc.orgId}`}
                doc={doc}
                reviewingId={reviewingId}
                canReview={isSuperAdmin}
                canEdit={isOrgAdmin}
                onOpen={() => setSelectedDocument(doc)}
                onReview={reviewDocument}
                onEdit={openEdit}
              />
            ))}
            {selectedCategory && !grouped[selectedCategory].length ? <p className="text-sm text-slate-500">No documents in this category.</p> : null}
          </div>
        </DialogContent>
      </Dialog>

      <DocumentPreviewDialog
        doc={selectedDocument}
        reviewingId={reviewingId}
        canReview={isSuperAdmin}
        canEdit={isOrgAdmin}
        onClose={() => setSelectedDocument(null)}
        onReview={reviewDocument}
        onEdit={openEdit}
      />

      <Dialog open={Boolean(editingDoc)} onOpenChange={(open) => !open && setEditingDoc(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit document details</DialogTitle>
          </DialogHeader>
          {editingDoc ? (
            <div className="space-y-4 py-2">
              <p className="text-sm text-slate-500">{editingDoc.document.replace(/_/g, ' ')} · {editingDoc.ownerLabel}</p>
              <div className="space-y-1">
                <Label htmlFor="edit-doc-no">Document number</Label>
                <Input id="edit-doc-no" value={editForm.documentNo} onChange={(e) => setEditForm((f) => ({ ...f, documentNo: e.target.value }))} placeholder="e.g. MH01AB1234" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="edit-expiry">Expiry date</Label>
                <Input id="edit-expiry" type="date" value={editForm.expiresAt} onChange={(e) => setEditForm((f) => ({ ...f, expiresAt: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="edit-url">Document URL</Label>
                <Input id="edit-url" value={editForm.url} onChange={(e) => setEditForm((f) => ({ ...f, url: e.target.value }))} placeholder="https://..." />
              </div>
              <p className="text-xs text-slate-500">Saving will reset status to PENDING for re-review.</p>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingDoc(null)}>Cancel</Button>
            <Button onClick={() => void saveEdit()} disabled={editSaving}>
              {editSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Save changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DocumentCard({
  doc,
  canReview,
  canEdit,
  reviewingId,
  onOpen,
  onReview,
  onEdit,
}: {
  doc: DocumentItem;
  canReview: boolean;
  canEdit: boolean;
  reviewingId: string | null;
  onOpen: () => void;
  onReview: (doc: DocumentItem, status: 'APPROVED' | 'REJECTED') => Promise<void>;
  onEdit: (doc: DocumentItem) => void;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
      <button type="button" className="flex h-44 w-full items-center justify-center bg-slate-100 text-left" onClick={onOpen}>
        {isImage(doc.url) ? (
          <img src={doc.url} alt={doc.document} className="h-full w-full object-cover" />
        ) : (
          <div className="text-center text-sm text-slate-500">
            <FileText className="mx-auto mb-2 h-8 w-8 text-slate-400" />
            <span className="inline-flex items-center gap-1 font-medium text-blue-600"><Eye className="h-4 w-4" /> Preview document</span>
          </div>
        )}
      </button>
      <div className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate font-semibold text-slate-900">{doc.document.replace(/_/g, ' ')}</p>
            <p className="truncate text-sm text-slate-500">{doc.ownerLabel}</p>
          </div>
          <StatusBadge status={doc.status} />
        </div>
        <div className="grid gap-2 text-sm">
          <Info label="Document number" value={doc.documentNo || 'Not provided'} />
          <Info label="Expiry" value={formatDate(doc.expiresAt)} />
          <Info label="Uploaded on" value={formatDate(doc.createdAt)} />
        </div>
        <DocumentActions doc={doc} canReview={canReview} canEdit={canEdit} reviewingId={reviewingId} onOpen={onOpen} onReview={onReview} onEdit={onEdit} />
      </div>
    </div>
  );
}

function DocumentPreviewDialog({
  doc,
  canReview,
  canEdit,
  reviewingId,
  onClose,
  onReview,
  onEdit,
}: {
  doc: DocumentItem | null;
  canReview: boolean;
  canEdit: boolean;
  reviewingId: string | null;
  onClose: () => void;
  onReview: (doc: DocumentItem, status: 'APPROVED' | 'REJECTED') => Promise<void>;
  onEdit: (doc: DocumentItem) => void;
}) {
  return (
    <Dialog open={Boolean(doc)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="h-[92vh] max-w-5xl overflow-hidden p-0">
        {doc ? (
          <div className="flex h-full flex-col">
            <DialogHeader className="border-b border-slate-200 px-5 py-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <DialogTitle>{doc.document.replace(/_/g, ' ')}</DialogTitle>
                  <p className="mt-1 text-sm text-slate-500">{doc.ownerLabel}</p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={doc.status} />
                  {doc.url ? <Button size="sm" variant="outline" asChild><a href={doc.url} target="_blank" rel="noreferrer"><ExternalLink className="mr-2 h-4 w-4" />Open</a></Button> : null}
                </div>
              </div>
            </DialogHeader>
            <div className="grid min-h-0 flex-1 lg:grid-cols-[1fr_280px]">
              <div className="min-h-0 bg-slate-100 p-4">
                <DocumentPreview doc={doc} />
              </div>
              <aside className="space-y-3 border-t border-slate-200 p-4 lg:border-l lg:border-t-0">
                <Info label="Organization" value={doc.orgLabel} />
                <Info label="Document number" value={doc.documentNo || 'Not provided'} />
                <Info label="Expiry" value={formatDate(doc.expiresAt)} />
                <Info label="Uploaded on" value={formatDate(doc.createdAt)} />
                <DocumentActions doc={doc} canReview={canReview} canEdit={canEdit} reviewingId={reviewingId} onOpen={() => undefined} onReview={onReview} onEdit={onEdit} hideView />
              </aside>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function DocumentPreview({ doc }: { doc: DocumentItem }) {
  if (!doc.url) {
    return (
      <div className="flex h-full min-h-80 items-center justify-center rounded-lg bg-white text-sm text-slate-500">
        No file URL is stored for this document.
      </div>
    );
  }

  if (isImage(doc.url)) {
    return <img src={doc.url} alt={doc.document} className="mx-auto h-full max-h-full rounded-lg bg-white object-contain" />;
  }

  if (isPdf(doc.url)) {
    return <iframe title={doc.document} src={doc.url} className="h-full min-h-80 w-full rounded-lg bg-white" />;
  }

  return (
    <div className="flex h-full min-h-80 flex-col items-center justify-center rounded-lg bg-white text-center text-sm text-slate-500">
      <FileText className="mb-3 h-10 w-10 text-slate-400" />
      <p>This file type cannot be previewed inline.</p>
      <Button size="sm" variant="outline" asChild className="mt-3">
        <a href={doc.url} target="_blank" rel="noreferrer"><ExternalLink className="mr-2 h-4 w-4" />Open document</a>
      </Button>
    </div>
  );
}

function DocumentActions({
  doc,
  canReview,
  canEdit,
  reviewingId,
  onOpen,
  onReview,
  onEdit,
  hideView = false,
}: {
  doc: DocumentItem;
  canReview: boolean;
  canEdit: boolean;
  reviewingId: string | null;
  onOpen: () => void;
  onReview: (doc: DocumentItem, status: 'APPROVED' | 'REJECTED') => Promise<void>;
  onEdit: (doc: DocumentItem) => void;
  hideView?: boolean;
}) {
  const reviewable = canReview && doc.status === 'PENDING';
  const editable = canEdit && (doc.category === 'vehicle' || doc.category === 'driver');
  const approving = reviewingId === `${doc.category}:${doc.id}:APPROVED`;
  const rejecting = reviewingId === `${doc.category}:${doc.id}:REJECTED`;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {!hideView ? <Button size="sm" variant="outline" onClick={onOpen}><Eye className="mr-2 h-4 w-4" />View</Button> : null}
      {doc.url ? <Button size="sm" variant="outline" asChild><a href={doc.url} target="_blank" rel="noreferrer"><ExternalLink className="mr-2 h-4 w-4" />Open</a></Button> : null}
      {editable ? (
        <Button size="sm" variant="outline" onClick={() => onEdit(doc)}>
          <Pencil className="mr-2 h-4 w-4" />Edit
        </Button>
      ) : null}
      {reviewable ? (
        <>
          <Button size="sm" disabled={Boolean(reviewingId)} onClick={() => void onReview(doc, 'APPROVED')} className="bg-emerald-600 hover:bg-emerald-700">
            {approving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
            Approve
          </Button>
          <Button size="sm" variant="destructive" disabled={Boolean(reviewingId)} onClick={() => void onReview(doc, 'REJECTED')}>
            {rejecting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <XCircle className="mr-2 h-4 w-4" />}
            Reject
          </Button>
        </>
      ) : null}
    </div>
  );
}

function Metric({ label, value, icon }: { label: string; value: number; icon: ReactNode }) {
  return (
    <Card className="border border-slate-200 shadow-sm">
      <CardContent className="flex items-center justify-between p-4">
        <div>
          <p className="text-xs uppercase text-slate-500">{label}</p>
          <p className="text-2xl font-bold text-slate-900">{value}</p>
        </div>
        {icon}
      </CardContent>
    </Card>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-slate-50 px-3 py-2">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="break-words font-medium text-slate-900">{value}</p>
    </div>
  );
}
