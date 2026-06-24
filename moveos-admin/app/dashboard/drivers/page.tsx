'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { AlertCircle, Car, FileText, Loader2, Plus, RefreshCw, Search, ShieldCheck, UserRound, Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/lib/AuthContext';
import {
  adminDriverApi,
  orgApi,
  type AdminDriverFilters,
  type AdminDriverRow,
  type ComplianceStatus,
  type DriverProfile,
  type DriverStatus,
  type DriverVehicleAssignment,
  type KycDocumentType,
  type KycRecord,
  type KycStatus,
  type OrgDriverStatus,
  type OrgDriverLink,
  type Organization,
  type OrgVehicleLink,
} from '@/lib/api';

const driverStatuses: DriverStatus[] = ['OFFLINE', 'ONLINE', 'BUSY'];
const kycStatuses: KycStatus[] = ['PENDING', 'APPROVED', 'REJECTED'];
const complianceStatuses: ComplianceStatus[] = ['CLEAR', 'BLOCKED'];
const driverDocs: Array<{ type: string; label: string; kyc: KycDocumentType }> = [
  { type: 'DRIVING_LICENSE', label: 'Driving license', kyc: 'DRIVING_LICENSE' },
  { type: 'AADHAAR', label: 'Aadhaar', kyc: 'AADHAAR' },
  { type: 'PAN_CARD', label: 'PAN card', kyc: 'PAN_CARD' },
];

function statusColor(status?: string) {
  if (status === 'ACTIVE' || status === 'APPROVED' || status === 'CLEAR' || status === 'ONLINE') return 'bg-emerald-100 text-emerald-800 border-emerald-200';
  if (!status || status.includes('PENDING') || status === 'OFFLINE' || status === 'INVITED') return 'bg-amber-100 text-amber-800 border-amber-200';
  if (status === 'SUSPENDED' || status === 'REJECTED' || status === 'BLOCKED' || status === 'REMOVED') return 'bg-red-100 text-red-800 border-red-200';
  return 'bg-slate-100 text-slate-700 border-slate-200';
}

function StatusBadge({ status }: { status?: string }) {
  return <Badge className={`border rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusColor(status)}`}>{(status || 'UNKNOWN').replace(/_/g, ' ')}</Badge>;
}

function useOrgSelection() {
  const { user } = useAuth();
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [orgId, setOrgId] = useState(user?.defaultOrganizationId ?? '');

  const loadOrganizations = useCallback(async () => {
    if (user?.role !== 'ORG_ADMIN') return;
    const res = await orgApi.myOrganizations();
    setOrganizations(res.data.organizations);
    setOrgId((current) => current || res.data.organizations[0]?.id || '');
  }, [user?.role]);

  useEffect(() => {
    void loadOrganizations();
  }, [loadOrganizations]);

  return { user, orgId, setOrgId, organizations };
}

function activeVehicle(driver?: DriverProfile) {
  return driver?.vehicles?.find((assignment) => assignment.active && assignment.status === 'ACTIVE') ?? driver?.vehicles?.find((assignment) => assignment.active);
}

function DriverDialog({ orgId, driver, onDone }: { orgId: string; driver?: DriverProfile; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(driver?.name ?? '');
  const [phone, setPhone] = useState(driver?.user?.phone ?? '');
  const [email, setEmail] = useState(driver?.user?.email ?? '');
  const [status, setStatus] = useState<DriverStatus>(driver?.status ?? 'OFFLINE');
  const [kycStatus, setKycStatus] = useState<KycStatus>(driver?.kycStatus ?? 'PENDING');
  const [complianceStatus, setComplianceStatus] = useState<ComplianceStatus>(driver?.complianceStatus ?? 'CLEAR');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setName(driver?.name ?? '');
    setPhone(driver?.user?.phone ?? '');
    setEmail(driver?.user?.email ?? '');
    setStatus(driver?.status ?? 'OFFLINE');
    setKycStatus(driver?.kycStatus ?? 'PENDING');
    setComplianceStatus(driver?.complianceStatus ?? 'CLEAR');
  }, [driver]);

  const submit = async () => {
    setLoading(true);
    try {
      if (driver) {
        await orgApi.updateDriver(orgId, driver.id, { name, email: email || undefined, status, kycStatus, complianceStatus });
        toast.success('Driver updated');
      } else {
        await orgApi.createDriver(orgId, { name, phone, email: email || undefined });
        toast.success('Driver added');
        setName('');
        setPhone('');
        setEmail('');
      }
      setOpen(false);
      onDone();
    } catch (err: any) {
      toast.error(err?.message ?? 'Driver save failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant={driver ? 'outline' : 'default'} className={driver ? 'border-slate-200' : 'bg-blue-600 hover:bg-blue-700'}>
          {driver ? 'Edit' : <><Plus className="mr-2 h-4 w-4" /> Add driver</>}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{driver ? 'Edit driver' : 'Add driver'}</DialogTitle></DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5"><Label className="text-xs text-slate-600">Name</Label><Input value={name} onChange={(event) => setName(event.target.value)} /></div>
          <div className="space-y-1.5"><Label className="text-xs text-slate-600">Phone</Label><Input value={phone} disabled={Boolean(driver)} onChange={(event) => setPhone(event.target.value)} placeholder="+919876540101" /></div>
          <div className="space-y-1.5 sm:col-span-2"><Label className="text-xs text-slate-600">Email</Label><Input value={email} onChange={(event) => setEmail(event.target.value)} /></div>
          {driver && (
            <>
              <div className="space-y-1.5"><Label className="text-xs text-slate-600">Availability</Label><Select value={status} onValueChange={(value) => setStatus(value as DriverStatus)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{driverStatuses.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent></Select></div>
              <div className="space-y-1.5"><Label className="text-xs text-slate-600">KYC</Label><Select value={kycStatus} onValueChange={(value) => setKycStatus(value as KycStatus)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{kycStatuses.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent></Select></div>
              <div className="space-y-1.5"><Label className="text-xs text-slate-600">Compliance</Label><Select value={complianceStatus} onValueChange={(value) => setComplianceStatus(value as ComplianceStatus)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{complianceStatuses.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent></Select></div>
            </>
          )}
        </div>
        <p className="text-xs text-slate-500">Address, emergency contact, profile image, and license number are not direct fields in the current driver schema. License and KYC evidence are stored as documents/KYC records.</p>
        <Button disabled={!name || (!driver && !phone) || loading} onClick={() => void submit()} className="bg-blue-600 hover:bg-blue-700">
          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Save driver
        </Button>
      </DialogContent>
    </Dialog>
  );
}

function DriverDocumentDialog({ orgId, driverId, onDone }: { orgId: string; driverId: string; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState(driverDocs[0].type);
  const [url, setUrl] = useState('');
  const [documentNo, setDocumentNo] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setLoading(true);
    try {
      const doc = driverDocs.find((item) => item.type === type);
      await orgApi.createDriverDocument(orgId, driverId, { type, url: url || undefined, expiresAt: expiresAt || undefined });
      if (url && doc) {
        await orgApi.submitDriverKyc(orgId, driverId, { documentType: doc.kyc, documentUrl: url, documentNo: documentNo || undefined, expiresAt: expiresAt || undefined });
      }
      toast.success('Driver document added');
      setOpen(false);
      setUrl('');
      setDocumentNo('');
      setExpiresAt('');
      onDone();
    } catch (err: any) {
      toast.error(err?.message ?? 'Document save failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm" variant="outline" className="border-slate-200"><FileText className="mr-2 h-4 w-4" /> Add document</Button></DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Add driver document</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <Select value={type} onValueChange={setType}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{driverDocs.map((doc) => <SelectItem key={doc.type} value={doc.type}>{doc.label}</SelectItem>)}</SelectContent></Select>
          <Input value={url} onChange={(event) => setUrl(event.target.value)} placeholder="Document URL or storage link" />
          <Input value={documentNo} onChange={(event) => setDocumentNo(event.target.value)} placeholder="Document number" />
          <Input type="date" value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} />
          <Button disabled={loading} onClick={() => void submit()} className="w-full bg-blue-600 hover:bg-blue-700">{loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save document</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AssignVehicleDialog({ orgId, driverId, vehicles, onDone }: { orgId: string; driverId: string; vehicles: OrgVehicleLink[]; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [vehicleId, setVehicleId] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setLoading(true);
    try {
      const res = await orgApi.createAssignment(orgId, { driverId, vehicleId, policy: 'PERMANENT', startsAt: new Date().toISOString() });
      await orgApi.updateAssignment(orgId, res.data.assignment.id, { status: 'ACTIVE', reason: 'Activated from driver detail' });
      toast.success('Vehicle assigned');
      setOpen(false);
      setVehicleId('');
      onDone();
    } catch (err: any) {
      toast.error(err?.message ?? 'Assignment failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm" variant="outline" className="border-slate-200"><Car className="mr-2 h-4 w-4" /> Assign vehicle</Button></DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Assign vehicle</DialogTitle></DialogHeader>
        <Select value={vehicleId} onValueChange={setVehicleId}><SelectTrigger><SelectValue placeholder="Select vehicle" /></SelectTrigger><SelectContent>{vehicles.map((link) => <SelectItem key={link.vehicleId} value={link.vehicleId}>{link.vehicle?.plate || link.vehicleId}</SelectItem>)}</SelectContent></Select>
        <Button disabled={!vehicleId || loading} onClick={() => void submit()} className="bg-blue-600 hover:bg-blue-700">{loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Assign and activate</Button>
      </DialogContent>
    </Dialog>
  );
}

const ORG_LINK_STATUSES: OrgDriverStatus[] = ['INVITED', 'PENDING_DRIVER_ACCEPTANCE', 'PENDING_COMPLIANCE', 'ACTIVE', 'SUSPENDED', 'REMOVED'];

function SuperAdminDriversView() {
  const [drivers, setDrivers] = useState<AdminDriverRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState<AdminDriverFilters>({});
  const [advancingId, setAdvancingId] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await adminDriverApi.list(filters);
      setDrivers(res.data.drivers);
    } catch (err: any) {
      setError(err?.message ?? 'Failed to load drivers');
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => { void load(); }, [load]);

  const pendingLinks = (driver: AdminDriverRow) =>
    driver.organizationLinks.filter((l) => l.status === 'PENDING_DRIVER_ACCEPTANCE' || l.status === 'PENDING_COMPLIANCE');

  const isIndependentPending = (driver: AdminDriverRow) =>
    driver.organizationLinks.length === 0 && driver.kycStatus === 'PENDING';

  const advance = async (driver: AdminDriverRow) => {
    const links = pendingLinks(driver);
    if (!links.length) return;
    setAdvancingId(driver.id);
    try {
      await Promise.all(links.map((link) => adminDriverApi.advanceLinkStatus(link.organizationId, driver.id, 'ACTIVE')));
      toast.success('Driver link advanced to ACTIVE');
      void load();
    } catch (err: any) {
      toast.error(err?.message ?? 'Advance failed');
    } finally {
      setAdvancingId('');
    }
  };

  const approveIndependent = async (driver: AdminDriverRow) => {
    setAdvancingId(driver.id);
    try {
      await adminDriverApi.approveIndependentKyc(driver.id, 'APPROVED');
      toast.success('Independent driver KYC approved');
      void load();
    } catch (err: any) {
      toast.error(err?.message ?? 'Approval failed');
    } finally {
      setAdvancingId('');
    }
  };

  const metrics = {
    total: drivers.length,
    kycApproved: drivers.filter((d) => d.kycStatus === 'APPROVED').length,
    pending: drivers.filter((d) => d.organizationLinks.some((l) => l.status === 'PENDING_DRIVER_ACCEPTANCE')).length,
    activeVehicles: drivers.reduce((sum, d) => sum + d._count.vehicles, 0),
  };

  return (
    <div className="min-h-full space-y-5 bg-slate-50 p-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-slate-900"><Users className="h-5 w-5 text-blue-600" /> Drivers</h1>
          <p className="mt-0.5 text-sm text-slate-500">All drivers across all organizations.</p>
        </div>
        <Button size="sm" variant="outline" onClick={() => void load()} className="border-slate-200">
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </Button>
      </div>

      {error && <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"><AlertCircle className="h-4 w-4" />{error}</div>}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'Total', value: metrics.total, Icon: Users },
          { label: 'KYC approved', value: metrics.kycApproved, Icon: ShieldCheck },
          { label: 'Pending acceptance', value: metrics.pending, Icon: UserRound },
          { label: 'Active vehicles', value: metrics.activeVehicles, Icon: Car },
        ].map(({ label, value, Icon }) => (
          <Card key={label} className="border border-slate-200 shadow-sm">
            <CardContent className="flex items-center justify-between p-4">
              <div><p className="text-xs uppercase text-slate-500">{label}</p><p className="text-2xl font-bold text-slate-900">{value}</p></div>
              <Icon className="h-5 w-5 text-blue-600" />
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="border border-slate-200 shadow-sm">
        <CardHeader className="space-y-3 pb-3">
          <CardTitle className="text-base">Filter drivers</CardTitle>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <Input
                className="pl-9"
                placeholder="Search name or phone"
                value={filters.search ?? ''}
                onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value || undefined }))}
              />
            </div>
            <Select value={filters.kycStatus ?? ''} onValueChange={(v) => setFilters((f) => ({ ...f, kycStatus: (v || undefined) as KycStatus | undefined }))}>
              <SelectTrigger><SelectValue placeholder="KYC status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="">All KYC</SelectItem>
                {kycStatuses.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filters.driverStatus ?? ''} onValueChange={(v) => setFilters((f) => ({ ...f, driverStatus: (v || undefined) as DriverStatus | undefined }))}>
              <SelectTrigger><SelectValue placeholder="Driver status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="">All availability</SelectItem>
                {driverStatuses.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filters.orgLinkStatus ?? ''} onValueChange={(v) => setFilters((f) => ({ ...f, orgLinkStatus: (v || undefined) as OrgDriverStatus | undefined }))}>
              <SelectTrigger><SelectValue placeholder="Org link status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="">All org statuses</SelectItem>
                {ORG_LINK_STATUSES.map((s) => <SelectItem key={s} value={s}>{s.replace(/_/g, ' ')}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
          ) : drivers.length === 0 ? (
            <div className="py-12 text-center text-sm text-slate-500">No drivers match these filters.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Driver</TableHead>
                  <TableHead>KYC / Compliance</TableHead>
                  <TableHead>Organizations</TableHead>
                  <TableHead>Vehicles</TableHead>
                  <TableHead>Active trips</TableHead>
                  <TableHead>Since</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {drivers.map((driver) => {
                  const hasPending = pendingLinks(driver).length > 0;
                  const isIndependent = isIndependentPending(driver);
                  return (
                    <TableRow key={driver.id}>
                      <TableCell>
                        <p className="font-medium text-slate-900">{driver.name}</p>
                        <p className="text-xs text-slate-500">{driver.user.phone}</p>
                        {driver.user.email && <p className="text-xs text-slate-400">{driver.user.email}</p>}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          <StatusBadge status={driver.kycStatus} />
                          <StatusBadge status={driver.complianceStatus} />
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          {driver.organizationLinks.length === 0 ? (
                            <span className="text-xs text-slate-400 italic">Independent</span>
                          ) : driver.organizationLinks.map((link) => (
                            <span key={link.id} className="flex flex-wrap items-center gap-1">
                              <span className="text-xs text-slate-700">{link.organization.tradeName || link.organization.legalName}</span>
                              <StatusBadge status={link.status} />
                            </span>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-slate-700">{driver._count.vehicles}</TableCell>
                      <TableCell className="text-sm text-slate-700">{driver._count.scheduledTrips}</TableCell>
                      <TableCell className="text-xs text-slate-500">{driver.createdAt ? new Date(driver.createdAt).toLocaleDateString() : '—'}</TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          {hasPending && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                              disabled={advancingId === driver.id}
                              onClick={() => void advance(driver)}
                            >
                              {advancingId === driver.id && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                              Accept
                            </Button>
                          )}
                          {isIndependent && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                              disabled={advancingId === driver.id}
                              onClick={() => void approveIndependent(driver)}
                            >
                              {advancingId === driver.id && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                              Approve KYC
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function DriversPage() {
  const { user, orgId, setOrgId, organizations } = useOrgSelection();
  const [drivers, setDrivers] = useState<OrgDriverLink[]>([]);
  const [vehicles, setVehicles] = useState<OrgVehicleLink[]>([]);
  const [selected, setSelected] = useState<OrgDriverLink | null>(null);
  const [kycRecords, setKycRecords] = useState<KycRecord[]>([]);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'ALL' | DriverStatus>('ALL');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    setError('');
    try {
      const [driverRes, vehicleRes] = await Promise.all([orgApi.listDrivers(orgId), orgApi.listVehicles(orgId)]);
      setDrivers(driverRes.data.links);
      setVehicles(vehicleRes.data.vehicles);
      const currentId = selected?.driverId ?? driverRes.data.links[0]?.driverId;
      const current = driverRes.data.links.find((item) => item.driverId === currentId) ?? driverRes.data.links[0] ?? null;
      setSelected(current);
      if (current) {
        const detail = await orgApi.getDriver(orgId, current.driverId);
        setSelected(detail.data.link);
        setKycRecords(detail.data.kycRecords);
      } else {
        setKycRecords([]);
      }
    } catch (err: any) {
      setError(err?.message ?? 'Failed to load drivers');
    } finally {
      setLoading(false);
    }
  }, [orgId, selected?.driverId]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => drivers.filter((link) => {
    const driver = link.driver;
    const vehicle = activeVehicle(driver)?.vehicle;
    const haystack = `${driver?.name ?? ''} ${driver?.user?.phone ?? ''} ${driver?.user?.email ?? ''} ${vehicle?.plate ?? ''}`.toLowerCase();
    return haystack.includes(search.toLowerCase()) && (status === 'ALL' || driver?.status === status);
  }), [drivers, search, status]);

  const metrics = useMemo(() => ({
    total: drivers.length,
    active: drivers.filter((link) => link.status === 'ACTIVE').length,
    verified: drivers.filter((link) => link.driver?.kycStatus === 'APPROVED').length,
    assigned: drivers.filter((link) => activeVehicle(link.driver)).length,
  }), [drivers]);

  if (user?.role === 'SUPER_ADMIN') {
    return <div className="p-6"><Card><CardContent className="p-6 text-sm text-slate-600">Driver operations are currently scoped to organization admin accounts.</CardContent></Card></div>;
  }

  if (user?.role !== 'ORG_ADMIN') {
    return <div className="p-6"><Card><CardContent className="p-6 text-sm text-slate-600">Driver operations are available from an organization admin account.</CardContent></Card></div>;
  }

  return (
    <div className="min-h-full space-y-5 bg-slate-50 p-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-slate-900"><Users className="h-5 w-5 text-blue-600" /> Drivers</h1>
          <p className="mt-0.5 text-sm text-slate-500">Driver profiles, availability, KYC documents, and vehicle assignments.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {organizations.length > 1 && <Select value={orgId} onValueChange={setOrgId}><SelectTrigger className="h-9 w-56 bg-white"><SelectValue /></SelectTrigger><SelectContent>{organizations.map((org) => <SelectItem key={org.id} value={org.id}>{org.tradeName || org.legalName}</SelectItem>)}</SelectContent></Select>}
          <Button size="sm" variant="outline" onClick={() => void load()} className="border-slate-200"><RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh</Button>
          {orgId && <DriverDialog orgId={orgId} onDone={() => void load()} />}
        </div>
      </div>

      {error && <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"><AlertCircle className="h-4 w-4" />{error}</div>}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'Total', value: metrics.total, Icon: Users },
          { label: 'Org active', value: metrics.active, Icon: UserRound },
          { label: 'KYC approved', value: metrics.verified, Icon: ShieldCheck },
          { label: 'Assigned', value: metrics.assigned, Icon: Car },
        ].map(({ label, value, Icon }) => <Card key={label} className="border border-slate-200 shadow-sm"><CardContent className="flex items-center justify-between p-4"><div><p className="text-xs uppercase text-slate-500">{label}</p><p className="text-2xl font-bold text-slate-900">{value}</p></div><Icon className="h-5 w-5 text-blue-600" /></CardContent></Card>)}
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
        <Card className="border border-slate-200 shadow-sm">
          <CardHeader className="space-y-3 pb-3">
            <CardTitle className="text-base">Driver list</CardTitle>
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="relative flex-1"><Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" /><Input className="pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name, phone, email, vehicle" /></div>
              <Select value={status} onValueChange={(value) => setStatus(value as 'ALL' | DriverStatus)}><SelectTrigger className="w-full sm:w-48"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ALL">All statuses</SelectItem>{driverStatuses.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent></Select>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? <div className="space-y-2">{Array.from({ length: 5 }).map((_, index) => <Skeleton key={index} className="h-12" />)}</div> : filtered.length ? (
              <Table>
                <TableHeader><TableRow><TableHead>Driver</TableHead><TableHead>Org status</TableHead><TableHead>Vehicle</TableHead><TableHead>KYC</TableHead></TableRow></TableHeader>
                <TableBody>{filtered.map((link) => {
                  const assignment = activeVehicle(link.driver);
                  return <TableRow key={link.id} className="cursor-pointer" onClick={() => setSelected(link)}><TableCell><p className="font-medium text-slate-900">{link.driver?.name || link.driverId}</p><p className="text-xs text-slate-500">{link.driver?.user?.phone || 'No phone'}</p></TableCell><TableCell><StatusBadge status={link.status} /></TableCell><TableCell className="text-sm text-slate-600">{assignment?.vehicle?.plate || 'Unassigned'}</TableCell><TableCell><StatusBadge status={link.driver?.kycStatus} /></TableCell></TableRow>;
                })}</TableBody>
              </Table>
            ) : <div className="py-12 text-center text-sm text-slate-500">No drivers match this view.</div>}
          </CardContent>
        </Card>

        <Card className="border border-slate-200 shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between gap-3">
              <CardTitle className="text-base">Driver detail</CardTitle>
              {selected?.driver && <DriverDialog orgId={orgId} driver={selected.driver} onDone={() => void load()} />}
            </div>
          </CardHeader>
          <CardContent>
            {selected?.driver ? (
              <Tabs defaultValue="profile">
                <TabsList className="grid w-full grid-cols-4 bg-slate-100"><TabsTrigger value="profile">Profile</TabsTrigger><TabsTrigger value="vehicle">Vehicle</TabsTrigger><TabsTrigger value="docs">Docs</TabsTrigger><TabsTrigger value="history">History</TabsTrigger></TabsList>
                <TabsContent value="profile" className="space-y-3 pt-3">
                  <div><p className="text-2xl font-bold text-slate-900">{selected.driver.name}</p><p className="text-sm text-slate-500">{selected.driver.user?.phone} {selected.driver.user?.email ? `· ${selected.driver.user.email}` : ''}</p></div>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="rounded-lg border border-slate-100 p-3"><p className="text-xs text-slate-500">Availability</p><StatusBadge status={selected.driver.status} /></div>
                    <div className="rounded-lg border border-slate-100 p-3"><p className="text-xs text-slate-500">Organization status</p><StatusBadge status={selected.status} /></div>
                    <div className="rounded-lg border border-slate-100 p-3"><p className="text-xs text-slate-500">KYC</p><StatusBadge status={selected.driver.kycStatus} /></div>
                    <div className="rounded-lg border border-slate-100 p-3"><p className="text-xs text-slate-500">Compliance</p><StatusBadge status={selected.driver.complianceStatus} /></div>
                  </div>
                </TabsContent>
                <TabsContent value="vehicle" className="space-y-3 pt-3">
                  {activeVehicle(selected.driver) ? <div className="rounded-lg border border-slate-200 p-3"><p className="font-medium text-slate-900">{activeVehicle(selected.driver)?.vehicle?.plate}</p><p className="text-sm text-slate-500">{activeVehicle(selected.driver)?.vehicle?.type}</p><StatusBadge status={activeVehicle(selected.driver)?.status} /></div> : <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-500">No active vehicle is assigned.</p>}
                  <AssignVehicleDialog orgId={orgId} driverId={selected.driver.id} vehicles={vehicles} onDone={() => void load()} />
                </TabsContent>
                <TabsContent value="docs" className="space-y-3 pt-3">
                  <DriverDocumentDialog orgId={orgId} driverId={selected.driver.id} onDone={() => void load()} />
                  <div className="divide-y divide-slate-100">
                    {selected.driver.documents?.length ? selected.driver.documents.map((doc) => <div key={doc.id} className="flex items-center justify-between py-3"><div><p className="text-sm font-medium">{doc.type}</p><p className="text-xs text-slate-500">{doc.expiresAt ? `Expires ${new Date(doc.expiresAt).toLocaleDateString()}` : 'No expiry'}</p></div><StatusBadge status={doc.status} /></div>) : <p className="py-5 text-sm text-slate-500">No local driver documents.</p>}
                  </div>
                  <div className="divide-y divide-slate-100 rounded-lg bg-slate-50 px-3">{kycRecords.length ? kycRecords.map((record) => <div key={record.id} className="flex items-center justify-between py-3"><p className="text-sm">{record.documentType.replace(/_/g, ' ')}</p><StatusBadge status={record.status} /></div>) : <p className="py-3 text-xs text-slate-500">No KYC records submitted for this driver.</p>}</div>
                </TabsContent>
                <TabsContent value="history" className="space-y-2 pt-3">
                  {selected.driver.vehicles?.length ? selected.driver.vehicles.map((assignment: DriverVehicleAssignment) => <div key={assignment.id} className="rounded-lg border border-slate-200 p-3"><div className="flex justify-between gap-3"><p className="text-sm font-medium">{assignment.vehicle?.plate || assignment.vehicleId}</p><StatusBadge status={assignment.status} /></div><p className="mt-1 text-xs text-slate-500">{assignment.startsAt ? new Date(assignment.startsAt).toLocaleString() : 'No start'} - {assignment.endsAt ? new Date(assignment.endsAt).toLocaleString() : 'Current'}</p></div>) : <p className="py-5 text-sm text-slate-500">No assignment history.</p>}
                </TabsContent>
              </Tabs>
            ) : <div className="py-12 text-center text-sm text-slate-500">Select a driver to inspect details.</div>}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
