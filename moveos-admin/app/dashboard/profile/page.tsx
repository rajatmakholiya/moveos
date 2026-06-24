'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { AlertCircle, Building2, Car, Edit, Loader2, Mail, Phone, Shield, User, Users } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/lib/AuthContext';
import { orgApi, type Organization, type OrgMember } from '@/lib/api';

function statusColor(status?: string) {
  if (status === 'ACTIVE' || status === 'OWNER' || status === 'ADMIN') return 'bg-emerald-100 text-emerald-800 border-emerald-200';
  if (!status || status.includes('PENDING') || status === 'DRAFT') return 'bg-amber-100 text-amber-800 border-amber-200';
  if (status === 'SUSPENDED' || status === 'REJECTED') return 'bg-red-100 text-red-800 border-red-200';
  return 'bg-slate-100 text-slate-700 border-slate-200';
}

function StatusBadge({ status }: { status?: string }) {
  return <Badge className={`border rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusColor(status)}`}>{(status || 'UNKNOWN').replace(/_/g, ' ')}</Badge>;
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

function initials(name?: string, fallback = 'AD') {
  const source = name?.trim() || fallback;
  return source.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase();
}

function EditOrganizationDialog({ org, onDone }: { org: Organization; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [tradeName, setTradeName] = useState(org.tradeName ?? '');
  const [primaryPhone, setPrimaryPhone] = useState(org.primaryPhone ?? '');
  const [primaryEmail, setPrimaryEmail] = useState(org.primaryEmail ?? '');
  const [gstin, setGstin] = useState(org.gstin ?? '');
  const [pan, setPan] = useState(org.pan ?? '');
  const [taxId, setTaxId] = useState(org.taxId ?? '');
  const [registrationNo, setRegistrationNo] = useState(org.registrationNo ?? '');
  const [regions, setRegions] = useState(Array.isArray(org.operatingRegions) ? org.operatingRegions.join(', ') : '');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setTradeName(org.tradeName ?? '');
    setPrimaryPhone(org.primaryPhone ?? '');
    setPrimaryEmail(org.primaryEmail ?? '');
    setGstin(org.gstin ?? '');
    setPan(org.pan ?? '');
    setTaxId(org.taxId ?? '');
    setRegistrationNo(org.registrationNo ?? '');
    setRegions(Array.isArray(org.operatingRegions) ? org.operatingRegions.join(', ') : '');
  }, [org]);

  const submit = async () => {
    const validationError = validateTaxFields({ gstin, pan, taxId, registrationNo });
    if (validationError) {
      toast.error(validationError);
      return;
    }
    setLoading(true);
    try {
      await orgApi.updateDetails(org.id, {
        tradeName: tradeName || undefined,
        primaryPhone: primaryPhone || undefined,
        primaryEmail: primaryEmail || undefined,
        gstin: gstin.trim().toUpperCase() || undefined,
        pan: pan.trim().toUpperCase() || undefined,
        taxId: taxId.trim() || undefined,
        registrationNo: registrationNo.trim() || undefined,
        operatingRegions: regions.split(',').map((item) => item.trim()).filter(Boolean),
      });
      toast.success('Organization profile updated');
      setOpen(false);
      onDone();
    } catch (err: any) {
      toast.error(err?.message ?? 'Profile update failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm" variant="outline" className="border-slate-200"><Edit className="mr-2 h-4 w-4" /> Edit org</Button></DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Organization profile</DialogTitle></DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2"><Label className="text-xs text-slate-600">Trade name</Label><Input value={tradeName} onChange={(event) => setTradeName(event.target.value)} /></div>
          <div className="space-y-1.5"><Label className="text-xs text-slate-600">Phone</Label><Input value={primaryPhone} onChange={(event) => setPrimaryPhone(event.target.value)} /></div>
          <div className="space-y-1.5"><Label className="text-xs text-slate-600">Email</Label><Input value={primaryEmail} onChange={(event) => setPrimaryEmail(event.target.value)} /></div>
          <div className="space-y-1.5"><Label className="text-xs text-slate-600">GSTIN (15 characters)</Label><Input value={gstin} onChange={(event) => setGstin(event.target.value.toUpperCase())} placeholder="05ABCDE1234F1Z5" /></div>
          <div className="space-y-1.5"><Label className="text-xs text-slate-600">PAN (10 characters)</Label><Input value={pan} onChange={(event) => setPan(event.target.value.toUpperCase())} placeholder="ABCDE1234F" /></div>
          <div className="space-y-1.5"><Label className="text-xs text-slate-600">Tax ID</Label><Input value={taxId} onChange={(event) => setTaxId(event.target.value)} placeholder="Local tax identifier" /></div>
          <div className="space-y-1.5"><Label className="text-xs text-slate-600">Registration number</Label><Input value={registrationNo} onChange={(event) => setRegistrationNo(event.target.value)} placeholder="Company/permit registration" /></div>
          <div className="space-y-1.5 sm:col-span-2"><Label className="text-xs text-slate-600">Operating regions</Label><Textarea value={regions} onChange={(event) => setRegions(event.target.value)} rows={3} placeholder="Delhi NCR, Gurgaon, Noida" /></div>
        </div>
        <Button disabled={loading} onClick={() => void submit()} className="bg-blue-600 hover:bg-blue-700">{loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save changes</Button>
      </DialogContent>
    </Dialog>
  );
}

export default function ProfilePage() {
  const { user } = useAuth();
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [memberships, setMemberships] = useState<OrgMember[]>([]);
  const [selectedOrgId, setSelectedOrgId] = useState(user?.defaultOrganizationId ?? '');
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      if (user?.role === 'ORG_ADMIN') {
        const membershipsRes = await orgApi.myOrganizations();
        setOrganizations(membershipsRes.data.organizations);
        setMemberships(membershipsRes.data.memberships);
        const nextOrgId = selectedOrgId || membershipsRes.data.organizations[0]?.id || '';
        setSelectedOrgId(nextOrgId);
        if (nextOrgId) {
          const orgRes = await orgApi.getScoped(nextOrgId);
          setOrganization(orgRes.data.organization);
        }
      } else {
        setOrganizations([]);
        setMemberships([]);
        setOrganization(null);
      }
    } catch (err: any) {
      setError(err?.message ?? 'Failed to load profile');
    } finally {
      setLoading(false);
    }
  }, [selectedOrgId, user?.role]);

  useEffect(() => {
    void load();
  }, [load]);

  const currentMembership = useMemo(() => memberships.find((membership) => membership.organizationId === selectedOrgId), [memberships, selectedOrgId]);
  const accountName = user?.name || 'Admin user';
  const roleLabel = currentMembership?.role || user?.role || 'ADMIN';

  return (
    <div className="min-h-full space-y-5 bg-slate-50 p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-slate-900"><User className="h-5 w-5 text-blue-600" /> Profile</h1>
          <p className="mt-0.5 text-sm text-slate-500">Account, role, organization, and operational access context.</p>
        </div>
        {organizations.length > 1 && (
          <Select value={selectedOrgId} onValueChange={setSelectedOrgId}>
            <SelectTrigger className="h-9 w-60 bg-white"><SelectValue /></SelectTrigger>
            <SelectContent>{organizations.map((org) => <SelectItem key={org.id} value={org.id}>{org.tradeName || org.legalName}</SelectItem>)}</SelectContent>
          </Select>
        )}
      </div>

      {error && <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"><AlertCircle className="h-4 w-4" />{error}</div>}

      {loading ? (
        <div className="grid gap-5 lg:grid-cols-[0.8fr_1.2fr]"><Skeleton className="h-80" /><Skeleton className="h-80" /></div>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[0.8fr_1.2fr]">
          <Card className="border border-slate-200 shadow-sm">
            <CardContent className="p-5">
              <div className="flex items-center gap-4">
                <Avatar className="h-16 w-16"><AvatarFallback className="bg-blue-600 text-lg font-bold text-white">{initials(accountName, user?.role === 'ORG_ADMIN' ? 'OA' : 'SA')}</AvatarFallback></Avatar>
                <div className="min-w-0">
                  <h2 className="truncate text-lg font-bold text-slate-900">{accountName}</h2>
                  <p className="text-sm text-slate-500">{user?.phone || 'No phone on account'}</p>
                  <div className="mt-2 flex flex-wrap gap-2"><StatusBadge status={user?.role} /><StatusBadge status={roleLabel} /></div>
                </div>
              </div>

              <div className="mt-5 space-y-3 text-sm">
                <div className="flex items-center gap-2 rounded-lg border border-slate-100 p-3"><Phone className="h-4 w-4 text-slate-400" /><span>{user?.phone || 'Not available'}</span></div>
                <div className="flex items-center gap-2 rounded-lg border border-slate-100 p-3"><Mail className="h-4 w-4 text-slate-400" /><span>{organization?.primaryEmail || 'No account email exposed by auth'}</span></div>
                <div className="flex items-center gap-2 rounded-lg border border-slate-100 p-3"><Shield className="h-4 w-4 text-slate-400" /><span>{currentMembership ? `Member since ${new Date(currentMembership.createdAt).toLocaleDateString()}` : 'Platform administrator'}</span></div>
              </div>
            </CardContent>
          </Card>

          <Card className="border border-slate-200 shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-3">
                <CardTitle className="flex items-center gap-2 text-base"><Building2 className="h-4 w-4 text-slate-500" /> Organization context</CardTitle>
                {organization && <EditOrganizationDialog org={organization} onDone={() => void load()} />}
              </div>
            </CardHeader>
            <CardContent>
              {organization ? (
                <div className="space-y-4">
                  <div>
                    <h2 className="text-xl font-bold text-slate-900">{organization.tradeName || organization.legalName}</h2>
                    <p className="text-sm text-slate-500">{organization.legalName}</p>
                    <div className="mt-2 flex flex-wrap gap-2"><StatusBadge status={organization.status} /><StatusBadge status={organization.planTier} /></div>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-lg border border-slate-100 p-3"><p className="text-xs text-slate-500">Role</p><p className="font-medium text-slate-900">{currentMembership?.role || 'Unknown'}</p></div>
                    <div className="rounded-lg border border-slate-100 p-3"><p className="text-xs text-slate-500">Membership</p><StatusBadge status={currentMembership?.status} /></div>
                    <div className="rounded-lg border border-slate-100 p-3"><p className="text-xs text-slate-500">Phone</p><p className="font-medium text-slate-900">{organization.primaryPhone || 'Not set'}</p></div>
                    <div className="rounded-lg border border-slate-100 p-3"><p className="text-xs text-slate-500">Email</p><p className="font-medium text-slate-900">{organization.primaryEmail || 'Not set'}</p></div>
                    <div className="rounded-lg border border-slate-100 p-3"><p className="text-xs text-slate-500">GSTIN</p><p className="font-medium text-slate-900">{organization.gstin || 'Not set'}</p></div>
                    <div className="rounded-lg border border-slate-100 p-3"><p className="text-xs text-slate-500">PAN</p><p className="font-medium text-slate-900">{organization.pan || 'Not set'}</p></div>
                    <div className="rounded-lg border border-slate-100 p-3"><p className="text-xs text-slate-500">Tax ID</p><p className="font-medium text-slate-900">{organization.taxId || 'Not set'}</p></div>
                    <div className="rounded-lg border border-slate-100 p-3"><p className="text-xs text-slate-500">Registration number</p><p className="font-medium text-slate-900">{organization.registrationNo || 'Not set'}</p></div>
                    <div className="rounded-lg border border-slate-100 p-3"><p className="text-xs text-slate-500">Drivers</p><p className="flex items-center gap-1 font-medium text-slate-900"><Users className="h-4 w-4" />{organization._count?.drivers ?? organization.drivers?.length ?? 0}</p></div>
                    <div className="rounded-lg border border-slate-100 p-3"><p className="text-xs text-slate-500">Vehicles</p><p className="flex items-center gap-1 font-medium text-slate-900"><Car className="h-4 w-4" />{organization._count?.vehicles ?? organization.vehicles?.length ?? 0}</p></div>
                  </div>
                  <div className="rounded-lg bg-slate-50 p-3">
                    <p className="text-xs font-medium uppercase text-slate-500">Operating regions</p>
                    <p className="mt-1 text-sm text-slate-700">{Array.isArray(organization.operatingRegions) && organization.operatingRegions.length ? organization.operatingRegions.join(', ') : 'No regions configured'}</p>
                  </div>
                </div>
              ) : (
                <div className="rounded-lg bg-slate-50 p-6 text-sm text-slate-500">No organization context is linked to this account, or you are signed in as a platform administrator.</div>
              )}
            </CardContent>
          </Card>

          <Card className="border border-slate-200 shadow-sm lg:col-span-2">
            <CardHeader className="pb-3"><CardTitle className="text-base">Security and account status</CardTitle></CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-3">
              <div className="rounded-lg border border-slate-100 p-3"><p className="text-xs text-slate-500">Authentication</p><p className="font-medium text-slate-900">OTP based</p></div>
              <div className="rounded-lg border border-slate-100 p-3"><p className="text-xs text-slate-500">Session</p><p className="font-medium text-slate-900">JWT access token</p></div>
              <div className="rounded-lg border border-slate-100 p-3"><p className="text-xs text-slate-500">Password changes</p><p className="font-medium text-slate-900">Not supported by current API</p></div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
