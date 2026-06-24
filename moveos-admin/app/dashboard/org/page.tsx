'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Building2,
  Car,
  ClipboardList,
  Copy,
  FileText,
  Loader2,
  RefreshCw,
  Send,
  ShieldAlert,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/lib/AuthContext';
import {
  orgApi,
  type AuditEvent,
  type KycDocumentType,
  type KycRecord,
  type OrgDriverLink,
  type OrgInvitation,
  type Organization,
  type OrgVehicleLink,
  type RouteRecord,
  type ScheduledTrip,
  type SeatBooking,
  type VehicleOwnershipType,
} from '@/lib/api';

function statusColor(status: string) {
  if (status === 'ACTIVE' || status === 'APPROVED' || status === 'CLEAR') return 'bg-emerald-100 text-emerald-800 border-emerald-200';
  if (status.includes('PENDING') || status === 'INVITED' || status === 'DRAFT') return 'bg-amber-100 text-amber-800 border-amber-200';
  if (status === 'SUSPENDED' || status === 'REJECTED' || status === 'BLOCKED') return 'bg-red-100 text-red-800 border-red-200';
  return 'bg-slate-100 text-slate-700 border-slate-200';
}

function StatusBadge({ status }: { status: string }) {
  return <Badge className={`border rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusColor(status)}`}>{status.replace(/_/g, ' ')}</Badge>;
}

function validateTaxFields(form: { gstin?: string; pan?: string; taxId?: string; registrationNo?: string }) {
  const gstin = form.gstin?.trim().toUpperCase();
  const pan = form.pan?.trim().toUpperCase();
  if (gstin && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(gstin)) return 'GSTIN must be a valid 15-character Indian GST number.';
  if (pan && !/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan)) return 'PAN must be a valid 10-character Indian PAN.';
  if (form.taxId && form.taxId.trim().length > 32) return 'Tax ID must be 32 characters or fewer.';
  if (form.registrationNo && form.registrationNo.trim().length > 64) return 'Registration number must be 64 characters or fewer.';
  return '';
}

function ComingSoonNotice({ feature, detail }: { feature: string; detail?: string }) {
  return (
    <div className="flex flex-col items-center gap-2 py-10 text-center">
      <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">Coming soon</span>
      <p className="text-sm font-medium text-slate-600">{feature} is not yet available</p>
      {detail && <p className="max-w-sm text-xs text-slate-400">{detail}</p>}
    </div>
  );
}

function Metric({ label, value, tone }: { label: string; value: number | string; tone: string }) {
  return (
    <Card className="border border-slate-200 shadow-sm">
      <CardContent className="p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
        <p className={`mt-1 text-2xl font-bold ${tone}`}>{value}</p>
      </CardContent>
    </Card>
  );
}

function InviteDialog({ orgId, onDone }: { orgId: string; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState('DRIVER');
  const [inviteToken, setInviteToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await orgApi.createInvitation(orgId, { phone, role });
      setInviteToken(res.data.inviteToken);
      setPhone('');
      onDone();
    } catch (err: any) {
      setError(err?.message ?? 'Failed to create invitation');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (!next) setInviteToken(''); }}>
      <DialogTrigger asChild>
        <Button size="sm" className="bg-blue-600 hover:bg-blue-700">
          <Send className="mr-2 h-4 w-4" />
          Invite
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Create invitation</DialogTitle>
        </DialogHeader>
        {inviteToken ? (
          <div className="space-y-3">
            <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">Invitation created.</p>
            <code className="block break-all rounded bg-slate-100 px-2 py-1.5 text-xs">/organization-invite/{inviteToken}</code>
            <Button variant="outline" className="w-full" onClick={() => setOpen(false)}>Close</Button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-600">Phone</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+919876540199" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-600">Role</Label>
              <Select value={role} onValueChange={setRole}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="DRIVER">Driver</SelectItem>
                  <SelectItem value="FLEET_MANAGER">Fleet manager</SelectItem>
                  <SelectItem value="VIEWER">Viewer</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {error && <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
            <Button disabled={!phone || loading} onClick={() => void submit()} className="w-full bg-blue-600 hover:bg-blue-700">
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create invitation
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function KycDialog({ orgId, onDone }: { orgId: string; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [documentType, setDocumentType] = useState<KycDocumentType>('GST_CERTIFICATE');
  const [documentUrl, setDocumentUrl] = useState('');
  const [documentNo, setDocumentNo] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    setLoading(true);
    setError('');
    try {
      await orgApi.submitKyc(orgId, { documentType, documentUrl, documentNo: documentNo || undefined });
      setOpen(false);
      setDocumentUrl('');
      setDocumentNo('');
      onDone();
    } catch (err: any) {
      setError(err?.message ?? 'Failed to submit KYC');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="border-slate-200">
          <FileText className="mr-2 h-4 w-4" />
          Submit KYC
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Submit organization KYC</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs text-slate-600">Document type</Label>
            <Select value={documentType} onValueChange={(v) => setDocumentType(v as KycDocumentType)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="GST_CERTIFICATE">GST certificate</SelectItem>
                <SelectItem value="PAN_CARD">PAN card</SelectItem>
                <SelectItem value="BANK_ACCOUNT">Bank account</SelectItem>
                <SelectItem value="INCORPORATION_CERTIFICATE">Incorporation certificate</SelectItem>
                <SelectItem value="OTHER">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-slate-600">Document URL</Label>
            <Input value={documentUrl} onChange={(e) => setDocumentUrl(e.target.value)} placeholder="https://storage.moveos.local/docs/file.pdf" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-slate-600">Document number</Label>
            <Input value={documentNo} onChange={(e) => setDocumentNo(e.target.value)} placeholder="Optional" />
          </div>
          {error && <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
          <Button disabled={!documentUrl || loading} onClick={() => void submit()} className="w-full bg-blue-600 hover:bg-blue-700">
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Submit for review
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AddDriverDialog({ orgId, onDone }: { orgId: string; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    setLoading(true);
    setError('');
    try {
      await orgApi.createDriver(orgId, { name, phone, email: email || undefined });
      setOpen(false);
      setName('');
      setPhone('');
      setEmail('');
      onDone();
    } catch (err: any) {
      setError(err?.message ?? 'Failed to create driver');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="border-slate-200">
          <Users className="mr-2 h-4 w-4" />
          Add driver
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add driver profile</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs text-slate-600">Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-slate-600">Phone</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+919876540101" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-slate-600">Email</Label>
            <Input value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          {error && <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
          <Button disabled={!name || !phone || loading} onClick={() => void submit()} className="w-full bg-blue-600 hover:bg-blue-700">
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Create driver
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AddVehicleDialog({ orgId, onDone }: { orgId: string; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [plate, setPlate] = useState('');
  const [type, setType] = useState('');
  const [ownershipType, setOwnershipType] = useState<VehicleOwnershipType>('ORGANIZATION');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    setLoading(true);
    setError('');
    try {
      await orgApi.createVehicle(orgId, { plate, type, ownershipType });
      setOpen(false);
      setPlate('');
      setType('');
      onDone();
    } catch (err: any) {
      setError(err?.message ?? 'Failed to add vehicle');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="border-slate-200">
          <Car className="mr-2 h-4 w-4" />
          Add vehicle
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add vehicle</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-600">Plate</Label>
              <Input value={plate} onChange={(e) => setPlate(e.target.value)} placeholder="UK05TA9001" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-600">Type</Label>
              <Input value={type} onChange={(e) => setType(e.target.value)} placeholder="Bolero" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-slate-600">Ownership</Label>
            <Select value={ownershipType} onValueChange={(value) => setOwnershipType(value as VehicleOwnershipType)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ORGANIZATION">Organization</SelectItem>
                <SelectItem value="LEASED">Leased</SelectItem>
                <SelectItem value="THIRD_PARTY">Third party</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {error && <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
          <Button disabled={!plate || !type || loading} onClick={() => void submit()} className="w-full bg-blue-600 hover:bg-blue-700">
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Add vehicle
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ScheduleTripDialog({
  orgId,
  routes,
  drivers,
  vehicles,
  onDone,
}: {
  orgId: string;
  routes: RouteRecord[];
  drivers: OrgDriverLink[];
  vehicles: OrgVehicleLink[];
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [routeId, setRouteId] = useState('');
  const [driverId, setDriverId] = useState('');
  const [vehicleId, setVehicleId] = useState('');
  const [departureAt, setDepartureAt] = useState('');
  const [departurePoint, setDeparturePoint] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    setLoading(true);
    setError('');
    try {
      await orgApi.createScheduledTrip(orgId, {
        routeId,
        driverId,
        vehicleId,
        departureAt: new Date(departureAt).toISOString(),
        departurePoint,
        frontSeatsTotal: 1,
        backSeatsTotal: 4,
      });
      setOpen(false);
      setRouteId('');
      setDriverId('');
      setVehicleId('');
      setDepartureAt('');
      setDeparturePoint('');
      onDone();
    } catch (err: any) {
      setError(err?.message ?? 'Failed to schedule trip. Make sure the driver and vehicle have an ACTIVE assignment.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="bg-blue-600 hover:bg-blue-700">Schedule trip</Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Schedule trip</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-600">Route</Label>
              <Select value={routeId} onValueChange={setRouteId}>
                <SelectTrigger><SelectValue placeholder="Select route" /></SelectTrigger>
                <SelectContent>
                  {routes.map((route) => <SelectItem key={route.id} value={route.id}>{route.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-600">Departure</Label>
              <Input type="datetime-local" value={departureAt} onChange={(e) => setDepartureAt(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-600">Driver</Label>
              <Select value={driverId} onValueChange={setDriverId}>
                <SelectTrigger><SelectValue placeholder="Select driver" /></SelectTrigger>
                <SelectContent>
                  {drivers.map((link) => <SelectItem key={link.driverId} value={link.driverId}>{link.driver?.name || link.driverId}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-600">Vehicle</Label>
              <Select value={vehicleId} onValueChange={setVehicleId}>
                <SelectTrigger><SelectValue placeholder="Select vehicle" /></SelectTrigger>
                <SelectContent>
                  {vehicles.map((link) => <SelectItem key={link.vehicleId} value={link.vehicleId}>{link.vehicle?.plate || link.vehicleId}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-slate-600">Departure point</Label>
            <Input value={departurePoint} onChange={(e) => setDeparturePoint(e.target.value)} />
          </div>
          {error && <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
          <Button disabled={!routeId || !driverId || !vehicleId || !departureAt || !departurePoint || loading} onClick={() => void submit()} className="w-full bg-blue-600 hover:bg-blue-700">
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Create schedule
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AssignmentDialog({
  orgId,
  drivers,
  vehicles,
  onDone,
}: {
  orgId: string;
  drivers: OrgDriverLink[];
  vehicles: OrgVehicleLink[];
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [driverId, setDriverId] = useState('');
  const [vehicleId, setVehicleId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await orgApi.createAssignment(orgId, {
        driverId,
        vehicleId,
        policy: 'PERMANENT',
        startsAt: new Date().toISOString(),
      });
      await orgApi.updateAssignment(orgId, res.data.assignment.id, { status: 'ACTIVE', reason: 'Activated by organization admin' });
      setOpen(false);
      setDriverId('');
      setVehicleId('');
      onDone();
    } catch (err: any) {
      setError(err?.message ?? 'Failed to assign vehicle');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="border-slate-200">Assign vehicle</Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Map driver to vehicle</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs text-slate-600">Driver</Label>
            <Select value={driverId} onValueChange={setDriverId}>
              <SelectTrigger><SelectValue placeholder="Select driver" /></SelectTrigger>
              <SelectContent>
                {drivers.map((link) => <SelectItem key={link.driverId} value={link.driverId}>{link.driver?.name || link.driverId}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-slate-600">Vehicle</Label>
            <Select value={vehicleId} onValueChange={setVehicleId}>
              <SelectTrigger><SelectValue placeholder="Select vehicle" /></SelectTrigger>
              <SelectContent>
                {vehicles.map((link) => <SelectItem key={link.vehicleId} value={link.vehicleId}>{link.vehicle?.plate || link.vehicleId}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {error && <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
          <Button disabled={!driverId || !vehicleId || loading} onClick={() => void submit()} className="w-full bg-blue-600 hover:bg-blue-700">
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Assign and activate
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ProfileDialog({ org, onDone }: { org: Organization; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [tradeName, setTradeName] = useState(org.tradeName ?? '');
  const [primaryEmail, setPrimaryEmail] = useState(org.primaryEmail ?? '');
  const [primaryPhone, setPrimaryPhone] = useState(org.primaryPhone ?? '');
  const [gstin, setGstin] = useState(org.gstin ?? '');
  const [pan, setPan] = useState(org.pan ?? '');
  const [taxId, setTaxId] = useState(org.taxId ?? '');
  const [registrationNo, setRegistrationNo] = useState(org.registrationNo ?? '');
  const [regions, setRegions] = useState(Array.isArray(org.operatingRegions) ? org.operatingRegions.join(', ') : '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setTradeName(org.tradeName ?? '');
    setPrimaryEmail(org.primaryEmail ?? '');
    setPrimaryPhone(org.primaryPhone ?? '');
    setGstin(org.gstin ?? '');
    setPan(org.pan ?? '');
    setTaxId(org.taxId ?? '');
    setRegistrationNo(org.registrationNo ?? '');
    setRegions(Array.isArray(org.operatingRegions) ? org.operatingRegions.join(', ') : '');
  }, [org]);

  const submit = async () => {
    setLoading(true);
    setError('');
    try {
      const validationError = validateTaxFields({ gstin, pan, taxId, registrationNo });
      if (validationError) {
        setError(validationError);
        return;
      }
      await orgApi.updateDetails(org.id, {
        tradeName,
        primaryEmail,
        primaryPhone,
        gstin: gstin.trim().toUpperCase() || undefined,
        pan: pan.trim().toUpperCase() || undefined,
        taxId: taxId.trim() || undefined,
        registrationNo: registrationNo.trim() || undefined,
        operatingRegions: regions.split(',').map((r) => r.trim()).filter(Boolean),
      });
      setOpen(false);
      onDone();
    } catch (err: any) {
      setError(err?.message ?? 'Failed to update profile');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="border-slate-200">Edit profile</Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Organization profile</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs text-slate-600">Trade name</Label>
            <Input value={tradeName} onChange={(e) => setTradeName(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-600">Phone</Label>
              <Input value={primaryPhone} onChange={(e) => setPrimaryPhone(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-600">Email</Label>
              <Input value={primaryEmail} onChange={(e) => setPrimaryEmail(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-600">GSTIN (15 characters)</Label>
              <Input value={gstin} onChange={(e) => setGstin(e.target.value.toUpperCase())} placeholder="05ABCDE1234F1Z5" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-600">PAN (10 characters)</Label>
              <Input value={pan} onChange={(e) => setPan(e.target.value.toUpperCase())} placeholder="ABCDE1234F" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-600">Tax ID</Label>
              <Input value={taxId} onChange={(e) => setTaxId(e.target.value)} placeholder="Local tax identifier" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-600">Registration number</Label>
              <Input value={registrationNo} onChange={(e) => setRegistrationNo(e.target.value)} placeholder="Company/permit registration" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-slate-600">Operating regions</Label>
            <Textarea value={regions} onChange={(e) => setRegions(e.target.value)} rows={3} />
          </div>
          {error && <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
          <Button disabled={loading} onClick={() => void submit()} className="w-full bg-blue-600 hover:bg-blue-700">
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save changes
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function InvitationRow({ invitation, orgId }: { invitation: OrgInvitation; orgId: string }) {
  const [copying, setCopying] = useState(false);

  const copyLink = async () => {
    setCopying(true);
    try {
      const res = await orgApi.refreshInviteLink(orgId, invitation.id);
      const pwaBase = process.env.NEXT_PUBLIC_PWA_URL ?? 'http://localhost:3010';
      await navigator.clipboard.writeText(pwaBase + res.data.inviteUrl);
    } catch {
      // fallback: ignore clipboard errors
    } finally {
      setCopying(false);
    }
  };

  return (
    <div className="flex items-center justify-between gap-3 py-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-slate-900">{invitation.phone}</p>
        <p className="text-xs text-slate-500">{invitation.role}</p>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <StatusBadge status={invitation.status} />
        {invitation.status === 'INVITED' && (
          <Button size="sm" variant="ghost" className="h-7 px-2 text-blue-600 hover:bg-blue-50" disabled={copying} onClick={() => void copyLink()} title="Copy invite link">
            {copying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Copy className="h-3.5 w-3.5" />}
          </Button>
        )}
      </div>
    </div>
  );
}

export default function OrgWorkspacePage() {
  const { user } = useAuth();
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [selectedOrgId, setSelectedOrgId] = useState(user?.defaultOrganizationId ?? '');
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [drivers, setDrivers] = useState<OrgDriverLink[]>([]);
  const [vehicles, setVehicles] = useState<OrgVehicleLink[]>([]);
  const [kyc, setKyc] = useState<KycRecord[]>([]);
  const [invitations, setInvitations] = useState<OrgInvitation[]>([]);
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [routes, setRoutes] = useState<RouteRecord[]>([]);
  const [trips, setTrips] = useState<ScheduledTrip[]>([]);
  const [bookings, setBookings] = useState<SeatBooking[]>([]);
  const [clusters, setClusters] = useState<Array<{ id: string; name: string; status: string }>>([]);
  const [challans, setChallans] = useState<Array<{ id: string; vehicleId?: string; status: string; amount?: number }>>([]);
  const [tracking, setTracking] = useState<Array<{ driverId: string; name: string; phone: string; status: string; activeVehicle?: any; lastLocation?: any }>>([]);
  const [clustersNotImpl, setClustersNotImpl] = useState(false);
  const [challansNotImpl, setChallansNotImpl] = useState(false);
  const [trackingNotImpl, setTrackingNotImpl] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadMemberships = useCallback(async () => {
    const res = await orgApi.myOrganizations();
    setOrganizations(res.data.organizations);
    if (!selectedOrgId && res.data.organizations[0]) {
      setSelectedOrgId(res.data.organizations[0].id);
    }
  }, [selectedOrgId]);

  const loadOrg = useCallback(async () => {
    if (!selectedOrgId) return;
    setLoading(true);
    setError('');
    try {
      const [orgRes, driverRes, vehicleRes, kycRes, inviteRes, auditRes, routeRes, tripRes, bookingRes] = await Promise.all([
        orgApi.getScoped(selectedOrgId),
        orgApi.listDrivers(selectedOrgId),
        orgApi.listVehicles(selectedOrgId),
        orgApi.listKyc(selectedOrgId),
        orgApi.listInvitations(selectedOrgId),
        orgApi.auditLog(selectedOrgId),
        orgApi.listRoutes(selectedOrgId),
        orgApi.listScheduledTrips(selectedOrgId),
        orgApi.listBookings(selectedOrgId),
      ]);
      setOrganization(orgRes.data.organization);
      setDrivers(driverRes.data.links);
      setVehicles(vehicleRes.data.vehicles);
      setKyc(kycRes.data.kycRecords);
      setInvitations(inviteRes.data.invitations);
      setEvents(auditRes.data.events);
      setRoutes(routeRes.data.routes);
      setTrips(tripRes.data.trips);
      setBookings(bookingRes.data.bookings);

      // Stub endpoints — expected to return 501 until implemented
      const [clusterRes, challanRes, trackingRes] = await Promise.allSettled([
        orgApi.listClusters(selectedOrgId),
        orgApi.listChallans(selectedOrgId),
        orgApi.liveTracking(selectedOrgId),
      ]);
      if (clusterRes.status === 'fulfilled') {
        setClusters(clusterRes.value.data.clusters);
        setClustersNotImpl(false);
      } else {
        setClusters([]);
        setClustersNotImpl((clusterRes.reason as any)?.status === 501);
      }
      if (challanRes.status === 'fulfilled') {
        setChallans(challanRes.value.data.challans);
        setChallansNotImpl(false);
      } else {
        setChallans([]);
        setChallansNotImpl((challanRes.reason as any)?.status === 501);
      }
      if (trackingRes.status === 'fulfilled') {
        // New endpoint returns trips[]; derive a per-driver summary from each.
        const trips: any[] = (trackingRes.value.data as any).trips ?? (trackingRes.value.data as any).drivers ?? [];
        setTracking(trips.map((t: any) => ({
          driverId: t.driver?.id ?? t.driverId,
          name: t.driver?.name ?? t.name ?? '',
          phone: t.driver?.phone ?? t.phone ?? '',
          status: t.status ?? 'ACTIVE',
          activeVehicle: t.vehicle ?? t.activeVehicle,
          lastLocation: t.location ?? t.lastLocation,
        })));
        setTrackingNotImpl(false);
      } else {
        setTracking([]);
        setTrackingNotImpl((trackingRes.reason as any)?.status === 501);
      }
    } catch (err: any) {
      setError(err?.message ?? 'Failed to load organization workspace');
    } finally {
      setLoading(false);
    }
  }, [selectedOrgId]);

  useEffect(() => { void loadMemberships(); }, []);
  useEffect(() => { void loadOrg(); }, [loadOrg]);

  const insights = useMemo(() => {
    const activeDrivers = drivers.filter((d) => d.status === 'ACTIVE').length;
    const pendingDrivers = drivers.filter((d) => d.status.includes('PENDING')).length;
    const activeVehicles = vehicles.filter((v) => v.vehicle?.status === 'ACTIVE' || v.status === 'ACTIVE').length;
    const pendingKyc = kyc.filter((k) => k.status === 'PENDING').length;
    const pendingInvites = invitations.filter((i) => i.status === 'INVITED').length;
    const activeAssignments = vehicles.reduce((sum, link) => sum + (link.vehicle?.assignments?.filter((a) => a.active).length ?? 0), 0);
    return { activeDrivers, pendingDrivers, activeVehicles, pendingKyc, pendingInvites, activeAssignments };
  }, [drivers, vehicles, kyc, invitations]);

  if (user?.role !== 'ORG_ADMIN') {
    return (
      <div className="p-6">
        <Card className="border border-amber-200 bg-amber-50">
          <CardContent className="flex items-center gap-2 p-4 text-sm text-amber-800">
            <ShieldAlert className="h-4 w-4" />
            This workspace is only available to organization admins.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-full space-y-5 bg-slate-50 p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-slate-900">
            <Building2 className="h-5 w-5 text-blue-600" />
            Organization insights
          </h1>
          <p className="mt-0.5 text-sm text-slate-500">Fleet, compliance, and onboarding visibility for your organization.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {organizations.length > 1 && (
            <Select value={selectedOrgId} onValueChange={setSelectedOrgId}>
              <SelectTrigger className="h-9 w-56 border-slate-200 bg-white text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {organizations.map((org) => (
                  <SelectItem key={org.id} value={org.id}>{org.tradeName || org.legalName}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button size="sm" variant="outline" onClick={() => void loadOrg()} className="border-slate-200">
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          {organization && <ProfileDialog org={organization} onDone={() => void loadOrg()} />}
          {organization && <AddDriverDialog orgId={organization.id} onDone={() => void loadOrg()} />}
          {organization && <AddVehicleDialog orgId={organization.id} onDone={() => void loadOrg()} />}
          {organization && <AssignmentDialog orgId={organization.id} drivers={drivers} vehicles={vehicles} onDone={() => void loadOrg()} />}
          {organization && <KycDialog orgId={organization.id} onDone={() => void loadOrg()} />}
          {organization && <InviteDialog orgId={organization.id} onDone={() => void loadOrg()} />}
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
          <AlertCircle className="h-4 w-4" />
          {error}
        </div>
      )}

      {loading && !organization ? (
        <div className="flex justify-center py-24">
          <Loader2 className="h-7 w-7 animate-spin text-blue-600" />
        </div>
      ) : organization ? (
        <>
          <Card className="border border-slate-200 shadow-sm">
            <CardContent className="flex flex-col gap-4 p-5 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-lg font-bold text-slate-900">{organization.tradeName || organization.legalName}</h2>
                  <StatusBadge status={organization.status} />
                  <StatusBadge status={organization.planTier} />
                </div>
                <p className="mt-1 text-sm text-slate-500">{organization.legalName}</p>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                  {organization.primaryPhone && <span>{organization.primaryPhone}</span>}
                  {organization.primaryEmail && <span>{organization.primaryEmail}</span>}
                  {organization.gstin && <span>GSTIN {organization.gstin}</span>}
                  {organization.pan && <span>PAN {organization.pan}</span>}
                  {organization.taxId && <span>Tax ID {organization.taxId}</span>}
                  {organization.registrationNo && <span>Registration {organization.registrationNo}</span>}
                </div>
              </div>
              <div className="grid min-w-[260px] grid-cols-2 gap-2 text-xs">
                <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                  <p className="text-slate-400">Pending KYC</p>
                  <p className="text-base font-bold text-amber-700">{insights.pendingKyc}</p>
                </div>
                <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                  <p className="text-slate-400">Open invites</p>
                  <p className="text-base font-bold text-blue-700">{insights.pendingInvites}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
            <Metric label="Active drivers" value={insights.activeDrivers} tone="text-emerald-700" />
            <Metric label="Pending drivers" value={insights.pendingDrivers} tone="text-amber-700" />
            <Metric label="Vehicles" value={vehicles.length} tone="text-slate-900" />
            <Metric label="Active vehicles" value={insights.activeVehicles} tone="text-blue-700" />
            <Metric label="Trips" value={trips.length} tone="text-indigo-700" />
            <Metric label="Bookings" value={bookings.length} tone="text-slate-900" />
          </div>

          <Tabs defaultValue="schedule" className="space-y-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <TabsList className="grid h-auto grid-cols-3 bg-white p-1 shadow-sm sm:grid-cols-6">
                <TabsTrigger value="schedule" className="text-xs">Schedule</TabsTrigger>
                <TabsTrigger value="bookings" className="text-xs">Bookings</TabsTrigger>
                <TabsTrigger value="tracking" className="text-xs">Tracking</TabsTrigger>
                <TabsTrigger value="compliance" className="text-xs">Compliance</TabsTrigger>
                <TabsTrigger value="challans" className="text-xs">Challans</TabsTrigger>
                <TabsTrigger value="clusters" className="text-xs">Clusters</TabsTrigger>
              </TabsList>
              <ScheduleTripDialog orgId={organization.id} routes={routes} drivers={drivers} vehicles={vehicles} onDone={() => void loadOrg()} />
            </div>

            <TabsContent value="schedule">
              <Card className="border border-slate-200 shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Scheduled trips</CardTitle>
                </CardHeader>
                <CardContent className="divide-y divide-slate-100">
                  {trips.length ? trips.map((trip) => (
                    <div key={trip.id} className="grid gap-3 py-3 md:grid-cols-[1.2fr_1fr_1fr_auto] md:items-center">
                      <div>
                        <p className="text-sm font-medium text-slate-900">{trip.route?.name || trip.routeId}</p>
                        <p className="text-xs text-slate-500">{new Date(trip.departureAt).toLocaleString()} · {trip.departurePoint}</p>
                      </div>
                      <p className="text-sm text-slate-600">{trip.driver?.name || trip.driverId}</p>
                      <p className="text-sm text-slate-600">{trip.vehicle?.plate || trip.vehicleId}</p>
                      <StatusBadge status={trip.status} />
                    </div>
                  )) : <p className="py-6 text-sm text-slate-400">No trips scheduled yet.</p>}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="bookings">
              <Card className="border border-slate-200 shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Organization bookings</CardTitle>
                </CardHeader>
                <CardContent className="divide-y divide-slate-100">
                  {bookings.length ? bookings.map((booking) => (
                    <div key={booking.id} className="grid gap-3 py-3 md:grid-cols-[1fr_1fr_1fr_auto] md:items-center">
                      <div>
                        <p className="text-sm font-medium text-slate-900">{booking.passengerName}</p>
                        <p className="text-xs text-slate-500">{booking.passengerPhone}</p>
                      </div>
                      <p className="text-sm text-slate-600">{booking.trip?.route?.name || booking.trip?.routeId}</p>
                      <p className="text-sm text-slate-600">Rs {booking.totalFare} · {booking.paymentMethod}</p>
                      <StatusBadge status={booking.status} />
                    </div>
                  )) : <p className="py-6 text-sm text-slate-400">No bookings for this organization yet.</p>}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="tracking">
              <Card className="border border-slate-200 shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Live tracking</CardTitle>
                </CardHeader>
                <CardContent className="divide-y divide-slate-100">
                  {trackingNotImpl ? (
                    <ComingSoonNotice feature="Live tracking" detail="Requires telemetry WebSocket integration." />
                  ) : tracking.length ? (
                    tracking.map((driver) => (
                      <div key={driver.driverId} className="flex items-center justify-between gap-3 py-3">
                        <div>
                          <p className="text-sm font-medium text-slate-900">{driver.name}</p>
                          <p className="text-xs text-slate-500">{driver.phone} · {driver.activeVehicle?.plate || 'No active vehicle'}</p>
                        </div>
                        <StatusBadge status={driver.status} />
                      </div>
                    ))
                  ) : (
                    <p className="py-6 text-sm text-slate-400">No active driver locations available.</p>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="compliance">
              <Card className="border border-slate-200 shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Vehicle compliance and local documents</CardTitle>
                </CardHeader>
                <CardContent className="divide-y divide-slate-100">
                  {vehicles.length ? vehicles.map((link) => (
                    <div key={link.id} className="flex items-center justify-between gap-3 py-3">
                      <div>
                        <p className="text-sm font-medium text-slate-900">{link.vehicle?.plate || link.vehicleId}</p>
                        <p className="text-xs text-slate-500">{link.vehicle?.documents?.length ?? 0} stored documents · {link.vehicle?.type}</p>
                      </div>
                      <StatusBadge status={link.vehicle?.complianceStatus || link.status} />
                    </div>
                  )) : <p className="py-6 text-sm text-slate-400">No vehicles registered yet.</p>}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="challans">
              <Card className="border border-slate-200 shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Challans</CardTitle>
                </CardHeader>
                <CardContent>
                  {challansNotImpl ? (
                    <ComingSoonNotice feature="Challan tracking" detail="Traffic challan integration is not yet implemented." />
                  ) : challans.length ? (
                    challans.map((challan) => (
                      <div key={challan.id} className="flex items-center justify-between border-b border-slate-100 py-3 last:border-0">
                        <span className="text-sm text-slate-700">{challan.id}</span>
                        <StatusBadge status={challan.status} />
                      </div>
                    ))
                  ) : (
                    <p className="py-6 text-sm text-slate-400">No challans recorded for this organization.</p>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="clusters">
              <Card className="border border-slate-200 shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Operating clusters</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {clustersNotImpl ? (
                    <div className="col-span-4">
                      <ComingSoonNotice feature="Cluster management" detail="Geographic cluster configuration is not yet implemented." />
                    </div>
                  ) : clusters.length ? (
                    clusters.map((cluster) => (
                      <div key={cluster.id} className="rounded-xl border border-slate-200 bg-white p-3">
                        <p className="text-sm font-medium text-slate-900">{cluster.name}</p>
                        <StatusBadge status={cluster.status} />
                      </div>
                    ))
                  ) : (
                    <p className="col-span-4 py-6 text-sm text-slate-400">No clusters configured.</p>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          <div className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
            <Card className="border border-slate-200 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Users className="h-4 w-4 text-slate-500" />
                  Drivers
                </CardTitle>
              </CardHeader>
              <CardContent className="divide-y divide-slate-100">
                {drivers.length ? drivers.map((link) => (
                  <div key={link.id} className="flex items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-900">{link.driver?.name || link.driver?.user?.name || link.driverId}</p>
                      <p className="text-xs text-slate-500">{link.driver?.user?.phone ?? 'No phone'}</p>
                    </div>
                    <StatusBadge status={link.status} />
                  </div>
                )) : <p className="py-6 text-sm text-slate-400">No drivers linked yet.</p>}
              </CardContent>
            </Card>

            <Card className="border border-slate-200 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Car className="h-4 w-4 text-slate-500" />
                  Vehicles
                </CardTitle>
              </CardHeader>
              <CardContent className="divide-y divide-slate-100">
                {vehicles.length ? vehicles.map((link) => (
                  <div key={link.id} className="flex items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-900">{link.vehicle?.plate ?? link.vehicleId}</p>
                      <p className="text-xs text-slate-500">{link.vehicle?.type ?? 'Vehicle'} · {link.ownershipType ?? 'ORGANIZATION'}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <StatusBadge status={link.vehicle?.status ?? link.status} />
                      <span className="text-[10px] text-slate-400">{link.vehicle?.assignments?.filter((a) => a.active).length ?? 0} active assignments</span>
                    </div>
                  </div>
                )) : <p className="py-6 text-sm text-slate-400">No vehicles registered yet.</p>}
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-5 xl:grid-cols-3">
            <Card className="border border-slate-200 shadow-sm">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <ShieldCheck className="h-4 w-4 text-slate-500" />
                    KYC and compliance
                  </CardTitle>
                  {organization && <KycDialog orgId={organization.id} onDone={() => void loadOrg()} />}
                </div>
              </CardHeader>
              <CardContent className="divide-y divide-slate-100">
                {kyc.length ? kyc.map((record) => (
                  <div key={record.id} className="flex items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-900">{record.documentType.replace(/_/g, ' ')}</p>
                      <p className="text-xs text-slate-500">{record.documentNo || 'No document number'}</p>
                    </div>
                    <StatusBadge status={record.status} />
                  </div>
                )) : <p className="py-6 text-sm text-slate-400">No KYC records submitted.</p>}
              </CardContent>
            </Card>

            <Card className="border border-slate-200 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Send className="h-4 w-4 text-slate-500" />
                  Invitations
                </CardTitle>
              </CardHeader>
              <CardContent className="divide-y divide-slate-100">
                {invitations.length ? invitations.slice(0, 8).map((invitation) => (
                  <InvitationRow key={invitation.id} invitation={invitation} orgId={selectedOrgId} />
                )) : <p className="py-6 text-sm text-slate-400">No invitations yet.</p>}
              </CardContent>
            </Card>

            <Card className="border border-slate-200 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <ClipboardList className="h-4 w-4 text-slate-500" />
                  Recent activity
                </CardTitle>
              </CardHeader>
              <CardContent className="divide-y divide-slate-100">
                {events.length ? events.slice(0, 8).map((event) => (
                  <div key={event.id} className="py-3">
                    <p className="text-xs font-medium text-slate-900">{event.action}</p>
                    <p className="mt-0.5 text-[10px] text-slate-400">{new Date(event.createdAt).toLocaleString()}</p>
                  </div>
                )) : <p className="py-6 text-sm text-slate-400">No activity yet.</p>}
              </CardContent>
            </Card>
          </div>
        </>
      ) : (
        <Card className="border border-slate-200 shadow-sm">
          <CardContent className="p-8 text-center text-sm text-slate-500">No active organization memberships found for this account.</CardContent>
        </Card>
      )}
    </div>
  );
}
