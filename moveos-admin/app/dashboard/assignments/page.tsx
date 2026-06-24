'use client';

import { useCallback, useEffect, useState } from 'react';
import { DataGrid, type GridColDef, type GridRenderCellParams } from '@mui/x-data-grid';
import {
  AlertCircle,
  Car,
  CheckCircle2,
  ClipboardList,
  Loader2,
  ShieldOff,
  Trash2,
  UserRound,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/lib/AuthContext';
import {
  orgApi,
  vehicleDriverAssignmentApi,
  type AssignmentStatusType,
  type AssignmentType,
  type EligibleDriverItem,
  type Organization,
  type VehicleDriverAssignmentRow,
} from '@/lib/api';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(v?: string | null) {
  if (!v) return '—';
  return new Date(v).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function statusTone(status?: string) {
  if (status === 'ACTIVE') return 'bg-emerald-100 text-emerald-800 border-emerald-200';
  if (status === 'SUSPENDED') return 'bg-orange-100 text-orange-800 border-orange-200';
  if (status === 'ENDED') return 'bg-slate-100 text-slate-600 border-slate-200';
  return 'bg-amber-100 text-amber-800 border-amber-200';
}

function typeTone(type?: string) {
  return type === 'PRIMARY'
    ? 'bg-blue-100 text-blue-800 border-blue-200'
    : 'bg-purple-100 text-purple-800 border-purple-200';
}

// ─── Assign Driver Modal ────────────────────────────────────────────────────

function AssignDriverModal({
  orgId, vehicles, open, onClose, onDone,
}: {
  orgId: string;
  vehicles: Array<{ id: string; plate: string; vehicleNumber?: string | null }>;
  open: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const [vehicleId, setVehicleId] = useState('');
  const [assignmentType, setAssignmentType] = useState<AssignmentType>('PRIMARY');
  const [note, setNote] = useState('');
  const [drivers, setDrivers] = useState<EligibleDriverItem[]>([]);
  const [selectedDriverId, setSelectedDriverId] = useState('');
  const [replaceConfirm, setReplaceConfirm] = useState(false);
  const [replaceVehicleConfirm, setReplaceVehicleConfirm] = useState(false);
  const [conflictingVehiclePlate, setConflictingVehiclePlate] = useState('');
  const [replacementReason, setReplacementReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [driverLoading, setDriverLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) {
      setVehicleId(''); setSelectedDriverId(''); setNote('');
      setReplaceConfirm(false); setReplaceVehicleConfirm(false);
      setConflictingVehiclePlate(''); setReplacementReason(''); setError('');
    }
  }, [open]);

  useEffect(() => {
    if (!vehicleId || !orgId) { setDrivers([]); return; }
    setDriverLoading(true);
    vehicleDriverAssignmentApi.eligibleDrivers(orgId, { vehicleId, assignmentType })
      .then((res) => setDrivers(res.data.items))
      .catch(() => setDrivers([]))
      .finally(() => setDriverLoading(false));
  }, [vehicleId, assignmentType, orgId]);

  const submit = async (opts: { replacePrimary?: boolean; replaceVehicle?: boolean } = {}) => {
    if (!vehicleId || !selectedDriverId) return;
    setLoading(true);
    setError('');
    try {
      await vehicleDriverAssignmentApi.assignDriver(orgId, vehicleId, {
        driverId: selectedDriverId,
        assignmentType,
        note: note || undefined,
        replaceExistingPrimary: opts.replacePrimary || undefined,
        replaceExistingVehicle: opts.replaceVehicle || undefined,
        replacementReason: (opts.replacePrimary || opts.replaceVehicle) && replacementReason ? replacementReason : undefined,
      });
      onClose();
      onDone();
    } catch (err: any) {
      const errCode = err?.error_code ?? err?.code;
      if (errCode === 'primary_driver_conflict' && assignmentType === 'PRIMARY') {
        setReplaceConfirm(true);
      } else if (errCode === 'driver_already_assigned_elsewhere') {
        setConflictingVehiclePlate(err?.existingVehiclePlate ?? err?.existingVehicleId ?? 'another vehicle');
        setReplaceVehicleConfirm(true);
      } else {
        setError(err?.message ?? 'Assignment failed');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Assign driver to vehicle</DialogTitle></DialogHeader>

        {replaceConfirm ? (
          <div className="space-y-4 pt-2">
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-800">
              This vehicle already has an active primary driver. Replace them?
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">Replacement reason (optional)</label>
              <input className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400" value={replacementReason} onChange={(e) => setReplacementReason(e.target.value)} placeholder="e.g. Shift change" />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setReplaceConfirm(false)}>Back</Button>
              <Button size="sm" disabled={loading} className="bg-amber-600 hover:bg-amber-700" onClick={() => void submit({ replacePrimary: true })}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Replace primary driver
              </Button>
            </div>
          </div>
        ) : replaceVehicleConfirm ? (
          <div className="space-y-4 pt-2">
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-800">
              This driver is already assigned to <span className="font-semibold">{conflictingVehiclePlate}</span>. Reassigning will end that assignment.
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">Reason (optional)</label>
              <input className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400" value={replacementReason} onChange={(e) => setReplacementReason(e.target.value)} placeholder="e.g. Vehicle change" />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setReplaceVehicleConfirm(false)}>Back</Button>
              <Button size="sm" disabled={loading} className="bg-amber-600 hover:bg-amber-700" onClick={() => void submit({ replaceVehicle: true })}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Reassign driver
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4 pt-2">
            {error && (
              <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                <AlertCircle className="h-4 w-4 flex-shrink-0" />{error}
              </div>
            )}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700">Vehicle</label>
              <Select value={vehicleId} onValueChange={setVehicleId}>
                <SelectTrigger><SelectValue placeholder="Select vehicle" /></SelectTrigger>
                <SelectContent>
                  {vehicles.map((v) => <SelectItem key={v.id} value={v.id}>{v.plate}{v.vehicleNumber ? ` (${v.vehicleNumber})` : ''}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700">Assignment type</label>
              <Select value={assignmentType} onValueChange={(v) => setAssignmentType(v as AssignmentType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="PRIMARY">Primary driver</SelectItem>
                  <SelectItem value="SECONDARY">Secondary driver</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700">Driver</label>
              {driverLoading ? (
                <div className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />Loading…</div>
              ) : !vehicleId ? (
                <p className="text-sm text-slate-400">Select a vehicle first.</p>
              ) : drivers.length === 0 ? (
                <p className="text-sm text-slate-400">No eligible active drivers found.</p>
              ) : (
                <div className="max-h-52 overflow-y-auto rounded-lg border border-slate-200 divide-y">
                  {drivers.map((d) => {
                    const otherVehicle = d.currentAssignments.find((a) => a.vehicleId !== vehicleId && a.status === 'ACTIVE');
                    const otherVehiclePlate = otherVehicle
                      ? (vehicles.find((v) => v.id === otherVehicle.vehicleId)?.plate ?? otherVehicle.vehicleId)
                      : null;
                    return (
                      <button key={d.driverId} type="button" disabled={!d.eligible} onClick={() => setSelectedDriverId(d.driverId)}
                        className={`flex w-full items-center justify-between px-3 py-2.5 text-left text-sm transition-colors ${selectedDriverId === d.driverId ? 'bg-blue-50' : 'hover:bg-slate-50'} ${!d.eligible ? 'opacity-50 cursor-not-allowed' : ''}`}>
                        <div>
                          <p className="font-medium text-slate-900">{d.fullName || d.phone || d.driverId}</p>
                          {d.phone && <p className="text-xs text-slate-500">{d.phone}</p>}
                          {otherVehiclePlate && <p className="text-xs text-amber-600">Currently on {otherVehiclePlate}</p>}
                          {d.blockReasons.length > 0 && <p className="text-xs text-red-500">{d.blockReasons[0]}</p>}
                        </div>
                        {selectedDriverId === d.driverId && <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-blue-600" />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700">Note (optional)</label>
              <input className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Assignment note…" maxLength={500} />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button size="sm" variant="outline" onClick={onClose}>Cancel</Button>
              <Button size="sm" disabled={!vehicleId || !selectedDriverId || loading} onClick={() => void submit()} className="bg-blue-600 hover:bg-blue-700">
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Assign driver
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Reason Modal ────────────────────────────────────────────────────────────

function ReasonModal({ open, title, reasonRequired, loading, onConfirm, onCancel }: {
  open: boolean; title: string; reasonRequired: boolean; loading: boolean;
  onConfirm: (reason: string) => void; onCancel: () => void;
}) {
  const [reason, setReason] = useState('');
  useEffect(() => { if (!open) setReason(''); }, [open]);
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onCancel()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
        <div className="space-y-4 pt-2">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Reason {reasonRequired && <span className="text-red-500">*</span>}</label>
            <textarea className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400" rows={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Provide a reason…" />
          </div>
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="outline" onClick={onCancel} disabled={loading}>Cancel</Button>
            <Button size="sm" variant="destructive" disabled={loading || (reasonRequired && reason.trim().length === 0)} onClick={() => onConfirm(reason.trim())}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Confirm
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function AssignmentsPage() {
  const { user } = useAuth();
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [orgId, setOrgId] = useState(user?.defaultOrganizationId ?? '');
  const [items, setItems] = useState<VehicleDriverAssignmentRow[]>([]);
  const [vehicles, setVehicles] = useState<Array<{ id: string; plate: string; vehicleNumber?: string | null }>>([]);
  const [total, setTotal] = useState(0);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [typeFilter, setTypeFilter] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const [assignOpen, setAssignOpen] = useState(false);
  const [suspendTarget, setSuspendTarget] = useState<VehicleDriverAssignmentRow | null>(null);
  const [removeTarget, setRemoveTarget] = useState<VehicleDriverAssignmentRow | null>(null);

  const isSuperAdmin = user?.role === 'SUPER_ADMIN';
  const isOrgAdmin = user?.role === 'ORG_ADMIN';
  const canAccess = isSuperAdmin || isOrgAdmin;

  const showToast = (type: 'success' | 'error', msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3500);
  };

  const load = useCallback(async () => {
    if (!canAccess || !orgId) return;
    setLoading(true);
    setError('');
    try {
      const [assignRes, vehicleRes] = await Promise.all([
        vehicleDriverAssignmentApi.list(orgId, { status: statusFilter || undefined, assignmentType: typeFilter || undefined, page: 1, limit: 500 }),
        orgApi.listVehicles(orgId),
      ]);
      setItems(assignRes.data.items);
      setTotal(assignRes.data.pagination.total);
      setVehicles(vehicleRes.data.vehicles.map((v: any) => ({ id: v.vehicleId, plate: v.vehicle?.plate ?? v.vehicleId, vehicleNumber: v.vehicle?.vehicleNumber ?? null })));
    } catch (err: any) {
      setError(err?.message ?? 'Failed to load assignments');
    } finally {
      setLoading(false);
    }
  }, [canAccess, orgId, statusFilter, typeFilter]);

  useEffect(() => {
    if (!canAccess) { setLoading(false); return; }
    void (isSuperAdmin ? orgApi.list() : orgApi.myOrganizations()).then((res) => {
      const orgs = (res.data as any).organizations;
      setOrganizations(orgs);
      if (!orgId && orgs[0]?.id) setOrgId(orgs[0].id);
    }).catch(() => {});
  }, [canAccess, isSuperAdmin]);

  useEffect(() => { void load(); }, [load]);

  const handleSuspend = async (reason: string) => {
    if (!suspendTarget) return;
    setActionLoading(suspendTarget.id);
    try {
      await vehicleDriverAssignmentApi.suspend(orgId, suspendTarget.id, reason);
      setSuspendTarget(null);
      showToast('success', 'Assignment suspended.');
      void load();
    } catch (err: any) { showToast('error', err?.message ?? 'Failed'); }
    finally { setActionLoading(null); }
  };

  const handleRestore = async (a: VehicleDriverAssignmentRow) => {
    setActionLoading(a.id);
    try {
      await vehicleDriverAssignmentApi.restore(orgId, a.id);
      showToast('success', 'Assignment restored.');
      void load();
    } catch (err: any) { showToast('error', err?.message ?? 'Failed'); }
    finally { setActionLoading(null); }
  };

  const handleRemove = async (reason: string) => {
    if (!removeTarget) return;
    setActionLoading(removeTarget.id);
    try {
      await vehicleDriverAssignmentApi.remove(orgId, removeTarget.id, reason || undefined);
      setRemoveTarget(null);
      showToast('success', 'Assignment ended.');
      void load();
    } catch (err: any) { showToast('error', err?.message ?? 'Failed'); }
    finally { setActionLoading(null); }
  };

  const columns: GridColDef<VehicleDriverAssignmentRow>[] = [
    {
      field: 'driver',
      headerName: 'Driver',
      flex: 1.5,
      minWidth: 160,
      renderCell: ({ row }) => (
        <div className="flex items-center gap-2 h-full">
          <UserRound className="h-4 w-4 shrink-0 text-slate-400" />
          <div>
            <p className="font-medium text-slate-900 text-sm leading-tight">{row.driver?.name || row.driverId}</p>
            {row.driver?.phone && <p className="text-xs text-slate-500">{row.driver.phone}</p>}
          </div>
        </div>
      ),
      valueGetter: (_v: any, row: VehicleDriverAssignmentRow) => row.driver?.name ?? row.driverId,
    },
    {
      field: 'vehicle',
      headerName: 'Vehicle',
      flex: 1,
      minWidth: 130,
      renderCell: ({ row }) => (
        <div className="flex items-center gap-2 h-full">
          <Car className="h-4 w-4 shrink-0 text-slate-400" />
          <span className="text-sm text-slate-700">{row.vehicle?.plate || row.vehicleId}</span>
        </div>
      ),
      valueGetter: (_v: any, row: VehicleDriverAssignmentRow) => row.vehicle?.plate ?? row.vehicleId,
    },
    {
      field: 'assignmentType',
      headerName: 'Type',
      width: 120,
      renderCell: ({ value }) => (
        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold leading-none ${typeTone(value as string)}`}>
          {value as string}
        </span>
      ),
    },
    {
      field: 'status',
      headerName: 'Status',
      width: 170,
      renderCell: ({ value }) => (
        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold leading-none ${statusTone(value as string)}`}>
          {(value as string).replace(/_/g, ' ')}
        </span>
      ),
    },
    {
      field: 'assignedAt',
      headerName: 'Assigned',
      width: 130,
      renderCell: ({ value }) => <span className="text-sm text-slate-500">{formatDate(value)}</span>,
    },
    {
      field: 'actions',
      headerName: 'Actions',
      width: 100,
      sortable: false,
      filterable: false,
      renderCell: ({ row }) => {
        const busy = actionLoading === row.id;
        return (
          <div className="flex items-center gap-1 h-full">
            {row.status === 'ACTIVE' && (
              <>
                <button title="Suspend" disabled={busy} onClick={(e) => { e.stopPropagation(); setSuspendTarget(row); }}
                  className="rounded border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-50 disabled:opacity-40">
                  {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldOff className="h-3.5 w-3.5" />}
                </button>
                <button title="End" disabled={busy} onClick={(e) => { e.stopPropagation(); setRemoveTarget(row); }}
                  className="rounded border border-slate-200 p-1.5 text-red-500 hover:bg-red-50 disabled:opacity-40">
                  {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                </button>
              </>
            )}
            {row.status === 'SUSPENDED' && (
              <>
                <button title="Restore" disabled={busy} onClick={(e) => { e.stopPropagation(); void handleRestore(row); }}
                  className="rounded border border-slate-200 p-1.5 text-emerald-600 hover:bg-emerald-50 disabled:opacity-40">
                  {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                </button>
                <button title="End" disabled={busy} onClick={(e) => { e.stopPropagation(); setRemoveTarget(row); }}
                  className="rounded border border-slate-200 p-1.5 text-red-500 hover:bg-red-50 disabled:opacity-40">
                  {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                </button>
              </>
            )}
          </div>
        );
      },
    },
  ];

  if (!canAccess) {
    return <div className="p-6"><Card><CardContent className="p-6 text-sm text-slate-600">Assignments are available from an organization admin account.</CardContent></Card></div>;
  }

  const activeCount = items.filter((a) => a.status === 'ACTIVE').length;

  return (
    <div className="min-h-full space-y-5 bg-slate-50 p-5">
      {/* Toast */}
      {toast && (
        <div className={`fixed right-4 top-4 z-50 flex items-center gap-2 rounded-lg px-4 py-3 text-sm shadow-lg ${toast.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'}`}>
          {toast.type === 'success' ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}{toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-slate-900">
            <ClipboardList className="h-5 w-5 text-blue-600" />Driver-vehicle assignments
          </h1>
          <p className="mt-0.5 text-sm text-slate-500">Assign verified active drivers to active vehicles. One primary driver per vehicle.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {(isSuperAdmin || organizations.length > 1) && (
            <Select value={orgId} onValueChange={(v) => setOrgId(v)}>
              <SelectTrigger className="h-9 w-56 bg-white"><SelectValue placeholder="Select organization" /></SelectTrigger>
              <SelectContent>{organizations.map((org) => <SelectItem key={org.id} value={org.id}>{org.tradeName || org.legalName || org.id}</SelectItem>)}</SelectContent>
            </Select>
          )}
          {orgId && (
            <Button size="sm" className="bg-blue-600 hover:bg-blue-700" onClick={() => setAssignOpen(true)}>
              <UserRound className="mr-2 h-4 w-4" />Assign driver
            </Button>
          )}
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />{error}
        </div>
      )}

      {/* Metrics */}
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          { label: 'Active', value: activeCount },
          { label: 'Total (page)', value: items.length },
          { label: 'All records', value: total },
        ].map(({ label, value }) => (
          <Card key={label} className="border border-slate-200 shadow-sm">
            <CardContent className="flex items-center justify-between p-4">
              <div><p className="text-xs uppercase text-slate-500">{label}</p><p className="text-2xl font-bold">{value}</p></div>
              <ClipboardList className="h-5 w-5 text-slate-400" />
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <Select value={statusFilter || 'ALL'} onValueChange={(v) => setStatusFilter(v === 'ALL' ? '' : v)}>
          <SelectTrigger className="h-9 w-44 bg-white"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All statuses</SelectItem>
            <SelectItem value="ACTIVE">Active</SelectItem>
            <SelectItem value="SUSPENDED">Suspended</SelectItem>
            <SelectItem value="ENDED">Ended</SelectItem>
          </SelectContent>
        </Select>
        <Select value={typeFilter || 'ALL'} onValueChange={(v) => setTypeFilter(v === 'ALL' ? '' : v)}>
          <SelectTrigger className="h-9 w-44 bg-white"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All types</SelectItem>
            <SelectItem value="PRIMARY">Primary</SelectItem>
            <SelectItem value="SECONDARY">Secondary</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* DataGrid */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <DataGrid
          rows={items}
          columns={columns}
          loading={loading}
          rowHeight={60}
          autoHeight
          sx={{ border: 'none' }}
          slots={{
            noRowsOverlay: () => (
              <div className="flex flex-col items-center justify-center gap-3 py-16 text-slate-500">
                <ClipboardList className="h-8 w-8 text-slate-300" />
                <p className="text-sm">No assignments found with current filters.</p>
                {orgId && (
                  <Button size="sm" onClick={() => setAssignOpen(true)} className="bg-blue-600 hover:bg-blue-700">Create first assignment</Button>
                )}
              </div>
            ),
          }}
          disableRowSelectionOnClick
        />
      </div>

      {/* Modals */}
      <AssignDriverModal orgId={orgId} vehicles={vehicles} open={assignOpen} onClose={() => setAssignOpen(false)} onDone={() => void load()} />
      <ReasonModal open={Boolean(suspendTarget)} title={`Suspend assignment${suspendTarget?.driver?.name ? ` — ${suspendTarget.driver.name}` : ''}`} reasonRequired loading={actionLoading === suspendTarget?.id} onConfirm={handleSuspend} onCancel={() => setSuspendTarget(null)} />
      <ReasonModal open={Boolean(removeTarget)} title={`End assignment${removeTarget?.driver?.name ? ` — ${removeTarget.driver.name}` : ''}`} reasonRequired={false} loading={actionLoading === removeTarget?.id} onConfirm={handleRemove} onCancel={() => setRemoveTarget(null)} />
    </div>
  );
}
