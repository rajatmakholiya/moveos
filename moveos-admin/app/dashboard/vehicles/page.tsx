'use client';

import { FormEvent, type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertCircle, Car, FileCheck2, FileText, Loader2, Plus, RefreshCw, Search, ShieldCheck, UserRound } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/lib/AuthContext';
import {
  adminVehiclesApi,
  fileApi,
  orgApi,
  vehiclesApi,
  type AdminVehicleRow,
  type DocStatus,
  type KycRecord,
  type Organization,
  type OrgDriverLink,
  type OrgVehicleLink,
  type VehicleDocument,
  type VehicleDocumentPayload,
  type VehicleDocumentStatus,
  type VehiclePayload,
  type VehicleProfile,
  type VehicleStatus,
} from '@/lib/api';

const vehicleStatuses: Array<VehicleStatus | 'ALL'> = ['ALL', 'ACTIVE', 'INACTIVE', 'OUT_OF_SERVICE'];
const documentStatuses: Array<VehicleDocumentStatus | 'ALL'> = ['ALL', 'MISSING', 'PENDING', 'APPROVED', 'REJECTED', 'EXPIRED'];
const requiredDocumentTypes = ['RC', 'INSURANCE', 'POLLUTION_CERTIFICATE', 'FITNESS_CERTIFICATE', 'PERMIT'];

const emptyVehicleForm: VehiclePayload = {
  vehicleNumber: '',
  vehicleType: '',
  fuelType: '',
  make: '',
  model: '',
  variant: '',
  registrationState: '',
  chassisNumber: '',
  engineNumber: '',
  color: '',
  totalSeats: 4,
  frontSeats: 1,
  backSeats: 3,
  luggageCapacityKg: 0,
  ownershipType: 'ORGANIZATION',
  ownerName: '',
  ownerPhone: '',
  ownerAddress: '',
  commercialPermitNumber: '',
  fitnessCertificateNumber: '',
  pollutionCertificateNumber: '',
  insurancePolicyNumber: '',
};

function statusColor(status?: string) {
  if (status === 'ACTIVE' || status === 'APPROVED' || status === 'CLEAR') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (!status || status === 'MISSING' || status === 'PENDING' || status === 'NOT_SUBMITTED' || status === 'INACTIVE') return 'border-amber-200 bg-amber-50 text-amber-700';
  if (status === 'OUT_OF_SERVICE' || status === 'BLOCKED' || status === 'REJECTED' || status === 'EXPIRED') return 'border-red-200 bg-red-50 text-red-700';
  return 'border-slate-200 bg-slate-50 text-slate-700';
}

function StatusBadge({ status }: { status?: string }) {
  return <Badge className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${statusColor(status)}`}>{(status || 'UNKNOWN').replace(/_/g, ' ')}</Badge>;
}

function formatDate(value?: string | null) {
  return value ? new Date(value).toLocaleDateString() : 'Not captured';
}

function normalizeVehicle(vehicle?: VehicleProfile) {
  return {
    number: vehicle?.vehicleNumber ?? vehicle?.plate ?? '',
    type: vehicle?.vehicleType ?? vehicle?.type ?? '',
    capacity: vehicle?.totalSeats ?? null,
  };
}

function summarizeDocumentStatus(documents: VehicleDocument[] = [], explicit?: VehicleDocumentStatus): VehicleDocumentStatus {
  if (!documents.length) return explicit ?? 'MISSING';
  if (documents.some((document) => document.status === 'REJECTED')) return 'REJECTED';
  if (documents.some((document) => document.status === 'EXPIRED')) return 'EXPIRED';
  if (documents.some((document) => document.status === 'PENDING')) return 'PENDING';
  return 'APPROVED';
}

function summarizeKycStatus(records: KycRecord[] = [], explicit?: string): AdminVehicleRow['kycStatus'] {
  if (!records.length) {
    if (explicit === 'NOT_SUBMITTED' || explicit === 'PENDING' || explicit === 'APPROVED' || explicit === 'REJECTED') return explicit;
    return 'NOT_SUBMITTED';
  }
  if (records.some((record) => record.status === 'REJECTED')) return 'REJECTED';
  if (records.some((record) => record.status === 'PENDING')) return 'PENDING';
  return 'APPROVED';
}

function activeAssignment(link?: OrgVehicleLink) {
  return link?.vehicle?.assignments?.find((assignment) => assignment.active && assignment.status === 'ACTIVE')
    ?? link?.vehicle?.assignments?.find((assignment) => assignment.active)
    ?? null;
}

function orgVehicleToRow(link: OrgVehicleLink, organization?: Organization, kycRecords: KycRecord[] = []): AdminVehicleRow {
  const assignment = activeAssignment(link);
  const vehicle = normalizeVehicle(link.vehicle);
  return {
    id: link.id,
    organizationId: link.organizationId ?? organization?.id ?? '',
    vehicleId: link.vehicleId,
    vehicleNumber: vehicle.number || link.vehicleId,
    type: vehicle.type || 'Vehicle',
    capacity: vehicle.capacity,
    frontSeats: link.vehicle?.frontSeats ?? null,
    backSeats: link.vehicle?.backSeats ?? null,
    luggageCapacityKg: link.vehicle?.luggageCapacityKg ?? null,
    ownerOrganization: organization ? { id: organization.id, name: organization.tradeName || organization.legalName } : null,
    assignedDriver: assignment?.driver
      ? {
          id: assignment.driver.id,
          name: assignment.driver.name,
          phone: assignment.driver.user?.phone,
          assignmentId: assignment.id,
          assignmentStatus: assignment.status,
        }
      : null,
    documentStatus: summarizeDocumentStatus(link.vehicle?.documents, link.vehicle?.documentStatus),
    kycStatus: summarizeKycStatus(kycRecords, link.vehicle?.kycStatus),
    status: link.vehicle?.status ?? 'INACTIVE',
    complianceStatus: link.vehicle?.complianceStatus ?? 'CLEAR',
    ownershipType: link.ownershipType,
    createdAt: link.vehicle?.createdAt,
    organizationLinkCreatedAt: link.startedAt,
    vehicle: link.vehicle,
    documents: link.vehicle?.documents ?? [],
    kycRecords,
  };
}

function vehicleToForm(vehicle?: VehicleProfile | null): VehiclePayload {
  if (!vehicle) return { ...emptyVehicleForm };
  return {
    ...emptyVehicleForm,
    vehicleNumber: vehicle.vehicleNumber ?? vehicle.plate ?? '',
    vehicleType: vehicle.vehicleType ?? vehicle.type ?? '',
    fuelType: vehicle.fuelType ?? '',
    make: vehicle.make ?? '',
    model: vehicle.model ?? '',
    variant: vehicle.variant ?? '',
    manufacturingYear: vehicle.manufacturingYear ?? undefined,
    registrationDate: vehicle.registrationDate?.slice(0, 10),
    registrationState: vehicle.registrationState ?? '',
    chassisNumber: vehicle.chassisNumber ?? '',
    engineNumber: vehicle.engineNumber ?? '',
    color: vehicle.color ?? '',
    totalSeats: vehicle.totalSeats ?? 4,
    frontSeats: vehicle.frontSeats ?? 1,
    backSeats: vehicle.backSeats ?? 3,
    luggageCapacityKg: vehicle.luggageCapacityKg ?? 0,
    ownershipType: vehicle.ownershipType,
    ownerName: vehicle.ownerName ?? '',
    ownerPhone: vehicle.ownerPhone ?? '',
    ownerAddress: vehicle.ownerAddress ?? '',
    commercialPermitNumber: vehicle.commercialPermitNumber ?? '',
    permitValidFrom: vehicle.permitValidFrom?.slice(0, 10),
    permitValidTill: vehicle.permitValidTill?.slice(0, 10),
    fitnessCertificateNumber: vehicle.fitnessCertificateNumber ?? '',
    fitnessValidTill: vehicle.fitnessValidTill?.slice(0, 10),
    pollutionCertificateNumber: vehicle.pollutionCertificateNumber ?? '',
    pollutionValidTill: vehicle.pollutionValidTill?.slice(0, 10),
    insurancePolicyNumber: vehicle.insurancePolicyNumber ?? '',
    insuranceValidTill: vehicle.insuranceValidTill?.slice(0, 10),
  };
}

function cleanPayload(form: VehiclePayload): VehiclePayload {
  const payload: Record<string, unknown> = {};
  Object.entries(form).forEach(([key, value]) => {
    if (value === '' || value === undefined || value === null) return;
    payload[key] = value;
  });
  return payload as VehiclePayload;
}

export default function VehiclesPage() {
  const { user } = useAuth();
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [organizationId, setOrganizationId] = useState('');
  const [vehicles, setVehicles] = useState<AdminVehicleRow[]>([]);
  const [selected, setSelected] = useState<AdminVehicleRow | null>(null);
  const [drivers, setDrivers] = useState<OrgDriverLink[]>([]);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<VehicleStatus | 'ALL'>('ALL');
  const [documentStatus, setDocumentStatus] = useState<VehicleDocumentStatus | 'ALL'>('ALL');
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState('');
  const [vehicleDialog, setVehicleDialog] = useState<{ mode: 'create' | 'edit'; row?: AdminVehicleRow } | null>(null);
  const [documentDialog, setDocumentDialog] = useState<AdminVehicleRow | null>(null);
  const [assignDialog, setAssignDialog] = useState<AdminVehicleRow | null>(null);
  const [busy, setBusy] = useState(false);

  const isSuperAdmin = user?.role === 'SUPER_ADMIN';
  const isOrgAdmin = user?.role === 'ORG_ADMIN';
  const canSelectOrganization = isSuperAdmin;
  const showOrganizationFilter = canSelectOrganization || organizations.length > 1;

  const loadOrganizations = useCallback(async () => {
    if (!user) return;
    if (isSuperAdmin) {
      const res = await orgApi.list();
      setOrganizations(res.data.organizations);
      return;
    }
    if (isOrgAdmin) {
      const res = await orgApi.myOrganizations();
      setOrganizations(res.data.organizations);
      setOrganizationId((current) => current || user.defaultOrganizationId || res.data.organizations[0]?.id || '');
    }
  }, [isOrgAdmin, isSuperAdmin, user]);

  useEffect(() => {
    void loadOrganizations();
  }, [loadOrganizations]);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError('');
    try {
      if (isSuperAdmin) {
        const res = await adminVehiclesApi.list({
          organizationId: organizationId || undefined,
          status: status === 'ALL' ? undefined : status,
          documentStatus: documentStatus === 'ALL' ? undefined : documentStatus,
          type: typeFilter === 'ALL' ? undefined : typeFilter,
        });
        setVehicles(res.data.vehicles);
      } else if (isOrgAdmin) {
        const [vehicleRes, orgRes] = await Promise.all([vehiclesApi.listOrgVehicles(), orgApi.myOrganizations()]);
        setOrganizations(orgRes.data.organizations);
        const org = orgRes.data.organizations.find((item) => item.id === user.defaultOrganizationId) ?? orgRes.data.organizations[0];
        setOrganizationId(org?.id ?? '');
        setVehicles(vehicleRes.data.vehicles.map((link) => orgVehicleToRow(link, org)));
      } else {
        setVehicles([]);
      }
    } catch (err: any) {
      setError(err?.message ?? 'Could not load vehicles.');
      setVehicles([]);
    } finally {
      setLoading(false);
    }
  }, [documentStatus, isOrgAdmin, isSuperAdmin, organizationId, status, typeFilter, user]);

  useEffect(() => {
    void load();
  }, [load]);

  const loadDrivers = useCallback(async (orgId: string) => {
    if (!orgId || !isOrgAdmin) return;
    const res = await orgApi.listDrivers(orgId);
    setDrivers(res.data.links.filter((link) => link.status === 'ACTIVE'));
  }, [isOrgAdmin]);

  const vehicleTypes = useMemo(() => Array.from(new Set(vehicles.map((vehicle) => vehicle.type).filter(Boolean))).sort(), [vehicles]);
  const filteredVehicles = useMemo(() => vehicles.filter((vehicle) => {
    const haystack = `${vehicle.vehicleNumber} ${vehicle.type} ${vehicle.ownerOrganization?.name ?? ''} ${vehicle.assignedDriver?.name ?? ''} ${vehicle.assignedDriver?.phone ?? ''}`.toLowerCase();
    return (
      haystack.includes(search.toLowerCase()) &&
      (isSuperAdmin || status === 'ALL' || vehicle.status === status) &&
      (isSuperAdmin || documentStatus === 'ALL' || vehicle.documentStatus === documentStatus) &&
      (isSuperAdmin || typeFilter === 'ALL' || vehicle.type === typeFilter)
    );
  }), [documentStatus, isSuperAdmin, search, status, typeFilter, vehicles]);

  const openDetail = async (row: AdminVehicleRow) => {
    setSelected(row);
    setDetailLoading(true);
    try {
      if (isSuperAdmin) {
        const res = await adminVehiclesApi.get(row.vehicleId, row.organizationId);
        setSelected(res.data.vehicle);
      } else {
        const res = await vehiclesApi.getOrgVehicle(row.vehicleId);
        setSelected(orgVehicleToRow(res.data.ownership, organizations.find((org) => org.id === row.organizationId), res.data.kycRecords));
      }
    } catch (err: any) {
      setError(err?.message ?? 'Could not load vehicle detail.');
    } finally {
      setDetailLoading(false);
    }
  };

  const refreshSelected = async () => {
    if (!selected) return;
    await openDetail(selected);
    await load();
  };

  const reviewVehicle = async (reviewStatus: DocStatus) => {
    if (!selected || !isSuperAdmin) return;
    const rejectionReason = reviewStatus === 'REJECTED' ? window.prompt('Rejection reason') || undefined : undefined;
    setBusy(true);
    try {
      await adminVehiclesApi.reviewKyc(selected.vehicleId, { status: reviewStatus, rejectionReason });
      toast.success(`Vehicle KYC ${reviewStatus.toLowerCase()}`);
      await refreshSelected();
    } catch (err: any) {
      toast.error(err?.message ?? 'Could not review vehicle KYC');
    } finally {
      setBusy(false);
    }
  };

  const metrics = useMemo(() => ({
    total: vehicles.length,
    active: vehicles.filter((vehicle) => vehicle.status === 'ACTIVE').length,
    pendingDocuments: vehicles.filter((vehicle) => vehicle.documentStatus === 'PENDING' || vehicle.documentStatus === 'MISSING').length,
    assigned: vehicles.filter((vehicle) => vehicle.assignedDriver).length,
  }), [vehicles]);

  if (!user) {
    return <div className="p-6"><Card><CardContent className="p-6 text-sm text-slate-600">Loading admin context...</CardContent></Card></div>;
  }

  if (!isSuperAdmin && !isOrgAdmin) {
    return (
      <div className="p-5">
        <Card className="border border-red-200">
          <CardContent className="flex items-center gap-2 p-6 text-sm text-red-700">
            <AlertCircle className="h-4 w-4" /> You do not have permission to manage organization vehicles.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-full space-y-5 bg-slate-50 p-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-slate-900"><Car className="h-5 w-5 text-blue-600" /> Vehicles</h1>
          <p className="mt-0.5 text-sm text-slate-500">Backend vehicle, organization ownership, document, KYC, and assignment records.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {isOrgAdmin ? (
            <Button size="sm" asChild>
              <Link href="/dashboard/vehicles/new"><Plus className="mr-2 h-4 w-4" /> Add Vehicle</Link>
            </Button>
          ) : null}
          <Button size="sm" variant="outline" onClick={() => void load()} className="w-fit border-slate-200">
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </Button>
        </div>
      </div>

      {error ? <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"><AlertCircle className="h-4 w-4" />{error}</div> : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Total vehicles" value={metrics.total} icon={<Car className="h-5 w-5 text-blue-600" />} />
        <Metric label="Active" value={metrics.active} icon={<ShieldCheck className="h-5 w-5 text-emerald-600" />} />
        <Metric label="Docs pending/missing" value={metrics.pendingDocuments} icon={<FileText className="h-5 w-5 text-amber-600" />} />
        <Metric label="Assigned" value={metrics.assigned} icon={<UserRound className="h-5 w-5 text-blue-600" />} />
      </div>

      <Card className="border border-slate-200 shadow-sm">
        <CardHeader className="space-y-3 pb-3">
          <CardTitle className="text-base">Vehicle Registry</CardTitle>
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-6">
            <div className="relative xl:col-span-2">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <Input className="pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search vehicle, org, driver" />
            </div>
            {showOrganizationFilter ? (
              <Select value={organizationId || (canSelectOrganization ? 'ALL' : '')} onValueChange={(value) => setOrganizationId(value === 'ALL' ? '' : value)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {canSelectOrganization ? <SelectItem value="ALL">All organizations</SelectItem> : null}
                  {organizations.map((org) => <SelectItem key={org.id} value={org.id}>{org.tradeName || org.legalName}</SelectItem>)}
                </SelectContent>
              </Select>
            ) : null}
            <Select value={status} onValueChange={(value) => setStatus(value as VehicleStatus | 'ALL')}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{vehicleStatuses.map((item) => <SelectItem key={item} value={item}>{item === 'ALL' ? 'All statuses' : item.replace(/_/g, ' ')}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={documentStatus} onValueChange={(value) => setDocumentStatus(value as VehicleDocumentStatus | 'ALL')}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{documentStatuses.map((item) => <SelectItem key={item} value={item}>{item === 'ALL' ? 'All document states' : item.replace(/_/g, ' ')}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All vehicle types</SelectItem>
                {vehicleTypes.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">{Array.from({ length: 6 }).map((_, index) => <Skeleton key={index} className="h-12" />)}</div>
          ) : filteredVehicles.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Vehicle number</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Total capacity</TableHead>
                  <TableHead>Owner organization</TableHead>
                  <TableHead>Assigned driver</TableHead>
                  <TableHead>Documents</TableHead>
                  <TableHead>KYC</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredVehicles.map((vehicle) => (
                  <TableRow key={vehicle.id} className="cursor-pointer" onClick={() => void openDetail(vehicle)}>
                    <TableCell className="font-medium text-slate-900">{vehicle.vehicleNumber}</TableCell>
                    <TableCell>{vehicle.type}</TableCell>
                    <TableCell>{vehicle.capacity ?? <span className="text-slate-400">Not captured</span>}</TableCell>
                    <TableCell>{vehicle.ownerOrganization?.name ?? <span className="text-slate-400">Not linked</span>}</TableCell>
                    <TableCell>{vehicle.assignedDriver?.name || vehicle.assignedDriver?.phone || <span className="text-slate-400">Unassigned</span>}</TableCell>
                    <TableCell><StatusBadge status={vehicle.documentStatus} /></TableCell>
                    <TableCell><StatusBadge status={vehicle.kycStatus} /></TableCell>
                    <TableCell><StatusBadge status={vehicle.status} /></TableCell>
                    <TableCell>{formatDate(vehicle.createdAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="py-14 text-center">
              <p className="text-sm font-medium text-slate-700">No vehicles found</p>
              <p className="mt-1 text-sm text-slate-500">No backend vehicles match the current filters.</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Sheet open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
          <SheetHeader>
            <SheetTitle>{selected?.vehicleNumber ?? 'Vehicle detail'}</SheetTitle>
          </SheetHeader>
          {selected ? (
            <div className="mt-5 space-y-5">
              {detailLoading ? <div className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading vehicle detail...</div> : null}
              <div className="flex flex-wrap gap-2">
                {isOrgAdmin ? (
                  <>
                    <Button size="sm" variant="outline" onClick={() => setVehicleDialog({ mode: 'edit', row: selected })}>Edit vehicle</Button>
                    <Button size="sm" variant="outline" onClick={() => setDocumentDialog(selected)}>Upload document</Button>
                    <Button size="sm" variant="outline" disabled={selected.status !== 'ACTIVE' || selected.kycStatus !== 'APPROVED'} onClick={() => { setAssignDialog(selected); void loadDrivers(selected.organizationId); }}>Assign driver</Button>
                  </>
                ) : null}
                {isSuperAdmin && selected.kycStatus !== 'APPROVED' ? (
                  <>
                    <Button size="sm" disabled={busy} onClick={() => void reviewVehicle('APPROVED')}><FileCheck2 className="mr-2 h-4 w-4" /> Approve KYC</Button>
                    <Button size="sm" variant="destructive" disabled={busy} onClick={() => void reviewVehicle('REJECTED')}>Reject KYC</Button>
                  </>
                ) : null}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Detail label="Vehicle number" value={selected.vehicleNumber} />
                <Detail label="Type" value={selected.type} />
                <Detail label="Total capacity" value={selected.capacity ?? 'Not captured'} />
                <Detail label="Front / back seats" value={`${selected.frontSeats ?? 'NA'} / ${selected.backSeats ?? 'NA'}`} />
                <Detail label="Owner organization" value={selected.ownerOrganization?.name ?? 'Not linked'} />
                <Detail label="Assigned driver" value={selected.assignedDriver?.name || selected.assignedDriver?.phone || 'Unassigned'} />
                <Detail label="Created" value={formatDate(selected.createdAt)} />
                <Detail label="Luggage capacity" value={selected.luggageCapacityKg ?? 'Not captured'} />
              </div>
              <div className="flex flex-wrap gap-2">
                <StatusBadge status={selected.status} />
                <StatusBadge status={selected.complianceStatus} />
                <StatusBadge status={selected.documentStatus} />
                <StatusBadge status={selected.kycStatus} />
              </div>
              <section>
                <h3 className="text-sm font-semibold text-slate-900">Full vehicle details</h3>
                <div className="mt-2 grid gap-3 sm:grid-cols-2">
                  {detailFields(selected.vehicle).map((item) => <Detail key={item.label} label={item.label} value={item.value} />)}
                </div>
              </section>
              <section>
                <h3 className="text-sm font-semibold text-slate-900">Documents</h3>
                <RecordList
                  empty="No vehicle documents are stored for this vehicle."
                  rows={(selected.documents ?? []).map((document) => ({
                    id: document.id,
                    title: document.type,
                    status: document.status,
                    subtitle: document.expiresAt ? `Expires ${formatDate(document.expiresAt)}` : 'No expiry captured',
                    url: document.url,
                  }))}
                />
              </section>
              <section>
                <h3 className="text-sm font-semibold text-slate-900">KYC records</h3>
                <RecordList
                  empty="No vehicle KYC records are stored for this vehicle."
                  rows={(selected.kycRecords ?? []).map((record) => ({
                    id: record.id,
                    title: record.documentType,
                    status: record.status,
                    subtitle: record.documentNo || (record.expiresAt ? `Expires ${formatDate(record.expiresAt)}` : 'No document number captured'),
                    url: record.documentUrl,
                  }))}
                />
              </section>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>

      <VehicleFormDialog
        open={Boolean(vehicleDialog)}
        mode={vehicleDialog?.mode ?? 'create'}
        initial={vehicleToForm(vehicleDialog?.row?.vehicle)}
        busy={busy}
        onClose={() => setVehicleDialog(null)}
        onSubmit={async (payload) => {
          setBusy(true);
          try {
            if (vehicleDialog?.mode === 'edit' && vehicleDialog.row) {
              await vehiclesApi.updateOrgVehicle(vehicleDialog.row.vehicleId, cleanPayload(payload));
              toast.success('Vehicle updated');
            } else {
              const res = await vehiclesApi.createOrgVehicle(cleanPayload(payload));
              toast.success('Vehicle created');
              setVehicleDialog(null);
              await load();
              await openDetail(orgVehicleToRow(res.data.ownership, organizations.find((org) => org.id === res.data.ownership.organizationId)));
              return;
            }
            setVehicleDialog(null);
            await refreshSelected();
          } catch (err: any) {
            toast.error(err?.message ?? 'Could not save vehicle');
          } finally {
            setBusy(false);
          }
        }}
      />

      <DocumentDialog
        open={Boolean(documentDialog)}
        busy={busy}
        onClose={() => setDocumentDialog(null)}
        onSubmit={async (payload) => {
          if (!documentDialog) return;
          setBusy(true);
          try {
            let finalPayload = payload;
            if (payload.file instanceof File) {
              const upload = await fileApi.upload('vehicle', documentDialog.vehicleId, payload.type, payload.file);
              finalPayload = { ...payload, url: upload.data.upload.fileUrl, fileUuid: upload.data.upload.fileUuid };
              delete finalPayload.file;
            }
            await vehiclesApi.uploadVehicleDocument(documentDialog.vehicleId, finalPayload);
            toast.success('Vehicle document uploaded');
            setDocumentDialog(null);
            await refreshSelected();
          } catch (err: any) {
            toast.error(err?.message ?? 'Could not upload document');
          } finally {
            setBusy(false);
          }
        }}
      />

      <AssignDriverDialog
        open={Boolean(assignDialog)}
        drivers={drivers}
        busy={busy}
        onClose={() => setAssignDialog(null)}
        onSubmit={async (driverId) => {
          if (!assignDialog) return;
          setBusy(true);
          try {
            await vehiclesApi.assignVehicleDriver(assignDialog.vehicleId, { driverId });
            toast.success('Driver assigned');
            setAssignDialog(null);
            await refreshSelected();
          } catch (err: any) {
            toast.error(err?.message ?? 'Could not assign driver');
          } finally {
            setBusy(false);
          }
        }}
      />
    </div>
  );
}

function VehicleFormDialog({
  open,
  mode,
  initial,
  busy,
  onClose,
  onSubmit,
}: {
  open: boolean;
  mode: 'create' | 'edit';
  initial: VehiclePayload;
  busy: boolean;
  onClose: () => void;
  onSubmit: (payload: VehiclePayload) => Promise<void>;
}) {
  const [form, setForm] = useState<VehiclePayload>(initial);
  const [validation, setValidation] = useState('');

  useEffect(() => {
    setForm(initial);
    setValidation('');
  }, [open]);

  const update = (key: keyof VehiclePayload, value: string) => {
    const numeric = ['manufacturingYear', 'totalSeats', 'frontSeats', 'backSeats', 'luggageCapacityKg'].includes(key);
    setForm((current) => ({ ...current, [key]: numeric ? Number(value || 0) : value }));
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!form.vehicleNumber.trim() || !form.vehicleType.trim()) {
      setValidation('Vehicle number and type are required.');
      return;
    }
    if (!form.totalSeats || form.frontSeats + form.backSeats > form.totalSeats) {
      setValidation('Seat capacity is invalid.');
      return;
    }
    setValidation('');
    await onSubmit(form);
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[92vh] max-w-4xl overflow-y-auto">
        <DialogHeader><DialogTitle>{mode === 'edit' ? 'Edit Vehicle' : 'Add Vehicle'}</DialogTitle></DialogHeader>
        <form className="space-y-5" onSubmit={submit}>
          {validation ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{validation}</div> : null}
          <FormSection title="Basic details">
            <Field label="Vehicle number" value={form.vehicleNumber} onChange={(value) => update('vehicleNumber', value)} required />
            <Field label="Vehicle type" value={form.vehicleType} onChange={(value) => update('vehicleType', value)} required />
            <Field label="Fuel type" value={form.fuelType} onChange={(value) => update('fuelType', value)} />
            <Field label="Make" value={form.make} onChange={(value) => update('make', value)} />
            <Field label="Model" value={form.model} onChange={(value) => update('model', value)} />
            <Field label="Variant" value={form.variant} onChange={(value) => update('variant', value)} />
            <Field label="Manufacturing year" type="number" value={form.manufacturingYear ?? ''} onChange={(value) => update('manufacturingYear', value)} />
            <Field label="Color" value={form.color} onChange={(value) => update('color', value)} />
          </FormSection>
          <FormSection title="Capacity">
            <Field label="Total seats" type="number" value={form.totalSeats} onChange={(value) => update('totalSeats', value)} required />
            <Field label="Front seats" type="number" value={form.frontSeats} onChange={(value) => update('frontSeats', value)} required />
            <Field label="Back seats" type="number" value={form.backSeats} onChange={(value) => update('backSeats', value)} required />
            <Field label="Luggage capacity kg" type="number" value={form.luggageCapacityKg ?? 0} onChange={(value) => update('luggageCapacityKg', value)} />
          </FormSection>
          <FormSection title="Ownership">
            <div className="space-y-1">
              <Label>Ownership type</Label>
              <Select value={form.ownershipType} onValueChange={(value) => update('ownershipType', value)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {['ORGANIZATION', 'INDIVIDUAL', 'LEASED', 'THIRD_PARTY'].map((item) => <SelectItem key={item} value={item}>{item.replace(/_/g, ' ')}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Field label="Owner name" value={form.ownerName} onChange={(value) => update('ownerName', value)} />
            <Field label="Owner phone" value={form.ownerPhone} onChange={(value) => update('ownerPhone', value)} />
            <div className="space-y-1 md:col-span-2">
              <Label>Owner address</Label>
              <Textarea value={form.ownerAddress ?? ''} onChange={(event) => update('ownerAddress', event.target.value)} />
            </div>
          </FormSection>
          <FormSection title="Registration and permit details">
            <Field label="Registration date" type="date" value={form.registrationDate ?? ''} onChange={(value) => update('registrationDate', value)} />
            <Field label="Registration state" value={form.registrationState} onChange={(value) => update('registrationState', value)} />
            <Field label="Chassis number" value={form.chassisNumber} onChange={(value) => update('chassisNumber', value)} />
            <Field label="Engine number" value={form.engineNumber} onChange={(value) => update('engineNumber', value)} />
            <Field label="Permit number" value={form.commercialPermitNumber} onChange={(value) => update('commercialPermitNumber', value)} />
            <Field label="Permit valid from" type="date" value={form.permitValidFrom ?? ''} onChange={(value) => update('permitValidFrom', value)} />
            <Field label="Permit valid till" type="date" value={form.permitValidTill ?? ''} onChange={(value) => update('permitValidTill', value)} />
          </FormSection>
          <FormSection title="Insurance / fitness / pollution validity">
            <Field label="Insurance policy number" value={form.insurancePolicyNumber} onChange={(value) => update('insurancePolicyNumber', value)} />
            <Field label="Insurance valid till" type="date" value={form.insuranceValidTill ?? ''} onChange={(value) => update('insuranceValidTill', value)} />
            <Field label="Fitness certificate number" value={form.fitnessCertificateNumber} onChange={(value) => update('fitnessCertificateNumber', value)} />
            <Field label="Fitness valid till" type="date" value={form.fitnessValidTill ?? ''} onChange={(value) => update('fitnessValidTill', value)} />
            <Field label="Pollution certificate number" value={form.pollutionCertificateNumber} onChange={(value) => update('pollutionCertificateNumber', value)} />
            <Field label="Pollution valid till" type="date" value={form.pollutionValidTill ?? ''} onChange={(value) => update('pollutionValidTill', value)} />
          </FormSection>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={busy}>{busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}{mode === 'edit' ? 'Save changes' : 'Create vehicle'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DocumentDialog({ open, busy, onClose, onSubmit }: { open: boolean; busy: boolean; onClose: () => void; onSubmit: (payload: VehicleDocumentPayload & { file?: File }) => Promise<void> }) {
  const [form, setForm] = useState<VehicleDocumentPayload & { file?: File }>({ type: requiredDocumentTypes[0], url: '', fileUuid: '', documentNo: '', expiresAt: '' });
  const [validation, setValidation] = useState('');

  useEffect(() => {
    if (open) {
      setForm({ type: requiredDocumentTypes[0], url: '', fileUuid: '', documentNo: '', expiresAt: '' });
      setValidation('');
    }
  }, [open]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!form.file && !form.url && !form.fileUuid) {
      setValidation('Select a file, document URL, or file UUID.');
      return;
    }
    setValidation('');
    await onSubmit(cleanDocumentPayload(form));
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Upload vehicle document</DialogTitle></DialogHeader>
        <form className="space-y-4" onSubmit={submit}>
          {validation ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{validation}</div> : null}
          <div className="space-y-1">
            <Label>Document type</Label>
            <Select value={form.type} onValueChange={(value) => setForm((current) => ({ ...current, type: value }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{requiredDocumentTypes.map((item) => <SelectItem key={item} value={item}>{item.replace(/_/g, ' ')}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <Field label="Document URL" value={form.url} onChange={(value) => setForm((current) => ({ ...current, url: value }))} />
          <Field label="File UUID" value={form.fileUuid} onChange={(value) => setForm((current) => ({ ...current, fileUuid: value }))} />
          <div className="space-y-1">
            <Label>Upload file</Label>
            <Input type="file" accept="image/*,.pdf" onChange={(event) => setForm((current) => ({ ...current, file: event.target.files?.[0] }))} />
          </div>
          <Field label="Document number" value={form.documentNo} onChange={(value) => setForm((current) => ({ ...current, documentNo: value }))} />
          <Field label="Expires at" type="date" value={form.expiresAt ?? ''} onChange={(value) => setForm((current) => ({ ...current, expiresAt: value }))} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={busy}>{busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Upload</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AssignDriverDialog({ open, drivers, busy, onClose, onSubmit }: { open: boolean; drivers: OrgDriverLink[]; busy: boolean; onClose: () => void; onSubmit: (driverId: string) => Promise<void> }) {
  const [driverId, setDriverId] = useState('');

  useEffect(() => {
    if (open) setDriverId('');
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Assign driver</DialogTitle></DialogHeader>
        <div className="space-y-4">
          {drivers.length ? (
            <div className="space-y-1">
              <Label>Active organization driver</Label>
              <Select value={driverId} onValueChange={setDriverId}>
                <SelectTrigger><SelectValue placeholder="Select driver" /></SelectTrigger>
                <SelectContent>
                  {drivers.map((link) => <SelectItem key={link.driverId} value={link.driverId}>{link.driver?.name ?? link.driver?.user?.phone ?? link.driverId}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">No active drivers are available in this organization.</div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button disabled={busy || !driverId} onClick={() => void onSubmit(driverId)}>{busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Assign</Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function cleanDocumentPayload(form: VehicleDocumentPayload & { file?: File }): VehicleDocumentPayload & { file?: File } {
  const payload: VehicleDocumentPayload & { file?: File } = { type: form.type };
  if (form.url) payload.url = form.url;
  if (form.fileUuid) payload.fileUuid = form.fileUuid;
  if (form.documentNo) payload.documentNo = form.documentNo;
  if (form.expiresAt) payload.expiresAt = form.expiresAt;
  if (form.file) payload.file = form.file;
  return payload;
}

function FormSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="mb-3 text-sm font-semibold text-slate-900">{title}</h3>
      <div className="grid gap-3 md:grid-cols-2">{children}</div>
    </section>
  );
}

function Field({ label, value, onChange, type = 'text', required }: { label: string; value: string | number | undefined; onChange: (value: string) => void; type?: string; required?: boolean }) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      <Input required={required} type={type} value={value ?? ''} onChange={(event) => onChange(event.target.value)} />
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

function Detail({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-100 p-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 font-medium text-slate-900">{value}</p>
    </div>
  );
}

function detailFields(vehicle?: VehicleProfile) {
  return [
    { label: 'Make / model', value: [vehicle?.make, vehicle?.model, vehicle?.variant].filter(Boolean).join(' ') || 'Not captured' },
    { label: 'Fuel type', value: vehicle?.fuelType || 'Not captured' },
    { label: 'Manufacturing year', value: vehicle?.manufacturingYear || 'Not captured' },
    { label: 'Registration state', value: vehicle?.registrationState || 'Not captured' },
    { label: 'Registration date', value: formatDate(vehicle?.registrationDate) },
    { label: 'Chassis number', value: vehicle?.chassisNumber || 'Not captured' },
    { label: 'Engine number', value: vehicle?.engineNumber || 'Not captured' },
    { label: 'Permit number', value: vehicle?.commercialPermitNumber || 'Not captured' },
    { label: 'Permit valid till', value: formatDate(vehicle?.permitValidTill) },
    { label: 'Insurance policy', value: vehicle?.insurancePolicyNumber || 'Not captured' },
    { label: 'Insurance valid till', value: formatDate(vehicle?.insuranceValidTill) },
    { label: 'Fitness valid till', value: formatDate(vehicle?.fitnessValidTill) },
    { label: 'Pollution valid till', value: formatDate(vehicle?.pollutionValidTill) },
    { label: 'Owner', value: vehicle?.ownerName || 'Not captured' },
    { label: 'Owner phone', value: vehicle?.ownerPhone || 'Not captured' },
    { label: 'Owner address', value: vehicle?.ownerAddress || 'Not captured' },
  ];
}

function RecordList({ rows, empty }: { rows: Array<{ id: string; title: string; status: string; subtitle: string; url?: string }>; empty: string }) {
  if (!rows.length) {
    return <p className="mt-2 rounded-lg bg-slate-50 p-4 text-sm text-slate-500">{empty}</p>;
  }
  return (
    <div className="mt-2 divide-y divide-slate-100 rounded-lg border border-slate-200">
      {rows.map((row) => (
        <div key={row.id} className="flex items-start justify-between gap-3 p-3">
          <div>
            <p className="font-medium text-slate-900">{row.title.replace(/_/g, ' ')}</p>
            <p className="text-sm text-slate-500">{row.subtitle}</p>
            {row.url ? <a href={row.url} target="_blank" rel="noreferrer" className="text-sm font-medium text-blue-600 hover:underline">Open file</a> : null}
          </div>
          <StatusBadge status={row.status} />
        </div>
      ))}
    </div>
  );
}
