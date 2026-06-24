'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { TimePicker } from '@mui/x-date-pickers/TimePicker';
import type { Dayjs } from 'dayjs';
import dayjs from 'dayjs';
import { format } from 'date-fns';
import { toast } from 'sonner';
import {
  AlertCircle,
  Calendar as CalendarIcon,
  Car,
  CheckCircle2,
  Clock,
  IndianRupee,
  Loader2,
  MapPin,
  Navigation,
  Package,
  Phone,
  Plus,
  RefreshCw,
  Route,
  Search,
  User,
  Users,
  XCircle,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/lib/AuthContext';
import {
  adminRidesApi,
  adminTransportRequestsApi,
  adminTripsApi,
  orgApi,
  type AdminBookingFilters,
  type AdminBookingRow,
  type AdminTransportRequest,
  type BookingStatus,
  type OrgDriverLink,
  type OrgVehicleLink,
  type Organization,
  type PaymentMethod,
  type PaymentStatus,
  type RouteRecord,
  type ScheduledTrip,
  type SeatBooking,
  type TripEvent,
  type TripStatus,
} from '@/lib/api';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function rupees(paise: number) {
  return `₹${(paise / 100).toLocaleString('en-IN')}`;
}

function shortId(id: string) {
  return id.slice(-8).toUpperCase();
}

// ─── Lifecycle classification (Upcoming / Ongoing / Past) ──────────────────────

export type Lifecycle = 'upcoming' | 'ongoing' | 'past';

export const LIFECYCLE_TABS: [Lifecycle, string][] = [
  ['upcoming', 'Upcoming'],
  ['ongoing', 'Ongoing'],
  ['past', 'Past'],
];

// A trip's lifecycle by status: OPEN → upcoming, DEPARTED → ongoing, COMPLETED/CANCELLED → past.
export function tripLifecycle(status?: string): Lifecycle {
  if (status === 'DEPARTED') return 'ongoing';
  if (status === 'COMPLETED' || status === 'CANCELLED') return 'past';
  return 'upcoming';
}

// A booking's lifecycle follows its trip; terminal booking states fall back to past.
export function bookingLifecycle(tripStatus?: string, bookingStatus?: string): Lifecycle {
  if (tripStatus === 'DEPARTED') return 'ongoing';
  if (tripStatus === 'COMPLETED' || tripStatus === 'CANCELLED') return 'past';
  if (bookingStatus === 'COMPLETED' || bookingStatus === 'CANCELLED' || bookingStatus === 'NO_SHOW') return 'past';
  return 'upcoming';
}

function bookingStatusColor(s?: string) {
  if (s === 'CONFIRMED') return 'bg-blue-100 text-blue-800 border-blue-200';
  if (s === 'COMPLETED') return 'bg-emerald-100 text-emerald-800 border-emerald-200';
  if (s === 'CANCELLED' || s === 'NO_SHOW') return 'bg-red-100 text-red-800 border-red-200';
  return 'bg-slate-100 text-slate-700 border-slate-200';
}

function tripStatusColor(s?: string) {
  if (s === 'OPEN') return 'bg-sky-100 text-sky-800 border-sky-200';
  if (s === 'DEPARTED') return 'bg-indigo-100 text-indigo-800 border-indigo-200';
  if (s === 'COMPLETED') return 'bg-emerald-100 text-emerald-800 border-emerald-200';
  if (s === 'CANCELLED') return 'bg-red-100 text-red-800 border-red-200';
  return 'bg-slate-100 text-slate-700 border-slate-200';
}

function paymentStatusColor(s?: string) {
  if (s === 'PAID' || s === 'SETTLED') return 'bg-emerald-100 text-emerald-800 border-emerald-200';
  if (s === 'PENDING') return 'bg-amber-100 text-amber-800 border-amber-200';
  if (s === 'FAILED' || s === 'REFUNDED') return 'bg-red-100 text-red-800 border-red-200';
  return 'bg-slate-100 text-slate-700 border-slate-200';
}

function requestStatusColor(s?: string) {
  if (s === 'ACCEPTED') return 'bg-emerald-100 text-emerald-800 border-emerald-200';
  if (s === 'REJECTED') return 'bg-red-100 text-red-800 border-red-200';
  if (s === 'REQUESTED') return 'bg-amber-100 text-amber-800 border-amber-200';
  return 'bg-slate-100 text-slate-700 border-slate-200';
}

function requestTypeColor(s?: string) {
  if (s === 'FULL_VEHICLE') return 'border-indigo-200 bg-indigo-50 text-indigo-700';
  if (s === 'PARCEL') return 'border-sky-200 bg-sky-50 text-sky-700';
  if (s === 'SEAT') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  return 'border-slate-200 bg-slate-50 text-slate-700';
}

function StatusBadge({ status, colorFn }: { status?: string; colorFn: (s?: string) => string }) {
  return (
    <span className={`inline-flex h-5 min-w-[76px] shrink-0 items-center justify-center rounded-full border px-2 text-center text-[10px] font-semibold uppercase leading-none tracking-normal whitespace-nowrap ${colorFn(status)}`}>
      {(status ?? 'UNKNOWN').replace(/_/g, ' ')}
    </span>
  );
}

function CellCenter({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`flex h-full min-w-0 items-center ${className}`}>{children}</div>;
}

function CellStack({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`flex h-full min-w-0 flex-col justify-center ${className}`}>{children}</div>;
}

function SeatPill({ value }: { value?: ReactNode }) {
  return (
    <span className="inline-flex h-7 min-w-[44px] shrink-0 items-center justify-center rounded-full border border-slate-200 bg-slate-100 px-2 text-center text-[10px] font-semibold uppercase leading-none text-slate-700">
      {value}
    </span>
  );
}

function TransportTypePill({ value }: { value?: string }) {
  return (
    <span className={`inline-flex h-6 shrink-0 items-center rounded-full border px-2.5 text-[10px] font-bold uppercase leading-none ${requestTypeColor(value)}`}>
      {(value ?? 'UNKNOWN').replace(/_/g, ' ')}
    </span>
  );
}

function organizationLabel(org?: { legalName?: string | null; tradeName?: string | null } | null) {
  return org?.tradeName || org?.legalName || '—';
}

function routeLabel(route?: { name?: string; originLabel?: string; destinationLabel?: string } | null) {
  if (!route) return '—';
  return route.name || `${route.originLabel} → ${route.destinationLabel}`;
}

const gridSx = {
  border: 'none',
  '& .MuiDataGrid-row': { cursor: 'pointer' },
  '& .MuiDataGrid-cell': {
    alignItems: 'center',
    display: 'flex',
    lineHeight: 'normal',
    py: 0,
  },
  '& .MuiDataGrid-columnHeader': {
    alignItems: 'center',
  },
  '& .MuiDataGrid-cell:focus, & .MuiDataGrid-columnHeader:focus': {
    outline: 'none',
  },
};

const scheduledTripGridSx = {
  ...gridSx,
  '& .MuiDataGrid-columnHeaders': {
    backgroundColor: '#f8fafc',
    borderBottom: '1px solid #e2e8f0',
  },
  '& .MuiDataGrid-columnHeaderTitle': {
    color: '#64748b',
    fontSize: '0.72rem',
    fontWeight: 700,
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
  },
  '& .MuiDataGrid-columnSeparator': {
    color: '#e2e8f0',
  },
  '& .MuiDataGrid-row:hover': {
    backgroundColor: '#f8fafc',
  },
  '& .MuiDataGrid-footerContainer': {
    borderTop: '1px solid #e2e8f0',
    minHeight: 48,
  },
};

const transportRequestGridSx = {
  ...scheduledTripGridSx,
  '& .MuiDataGrid-row': {
    cursor: 'default',
  },
  '& .MuiDataGrid-row:hover': {
    backgroundColor: '#f8fafc',
  },
};

// ─── Booking details dialog ───────────────────────────────────────────────────

function TripTimeline({ tripId }: { tripId?: string }) {
  const [events, setEvents] = useState<TripEvent[]>([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!tripId) return;
    setLoading(true);
    void adminTripsApi.getTimeline(tripId).then((res) => setEvents(res.events ?? [])).catch(() => setEvents([])).finally(() => setLoading(false));
  }, [tripId]);
  if (!tripId) return null;
  const eventLabel = (type: string) => {
    const map: Record<string, string> = { 'trip.departed': 'Journey started', 'trip.completed': 'Trip completed', 'trip.cancelled': 'Trip cancelled' };
    return map[type] ?? type.replace('trip.', '').replace(/_/g, ' ');
  };
  return (
    <section>
      <p className="text-xs text-slate-500 mb-2">Trip timeline</p>
      {loading && <div className="flex items-center gap-2 text-xs text-slate-400"><Loader2 className="h-3 w-3 animate-spin" /> Loading…</div>}
      {!loading && events.length === 0 && <p className="text-xs text-slate-400">No events recorded yet.</p>}
      {events.length > 0 && (
        <ol className="relative ml-1 space-y-3 border-l border-slate-200 pl-4">
          {events.map((ev) => (
            <li key={ev.id} className="text-xs">
              <span className="absolute -left-1.5 mt-0.5 h-3 w-3 rounded-full border border-white bg-slate-400" />
              <p className="font-medium text-slate-800">{eventLabel(ev.type)}</p>
              <p className="text-slate-500">{format(new Date(ev.createdAt), 'dd MMM yyyy, HH:mm:ss')}</p>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function BookingDetailDialog({ booking, open, onClose }: { booking: AdminBookingRow | null; open: boolean; onClose: () => void }) {
  const [detail, setDetail] = useState<AdminBookingRow | null>(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!open || !booking) { setDetail(null); return; }
    setLoading(true);
    void adminRidesApi.get(booking.id).then((res) => setDetail(res.data.booking)).catch(() => setDetail(booking)).finally(() => setLoading(false));
  }, [open, booking]);
  const b = detail ?? booking;
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Booking #{b ? shortId(b.id) : '—'}
            {b && <StatusBadge status={b.status} colorFn={bookingStatusColor} />}
          </DialogTitle>
        </DialogHeader>
        {loading && <div className="flex items-center gap-2 py-4 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>}
        {b && (
          <div className="space-y-5 text-sm">
            <section className="grid grid-cols-2 gap-3">
              <div className="space-y-0.5"><p className="text-xs text-slate-500">Passenger</p><p className="font-medium">{b.passengerName}</p><p className="text-slate-600">{b.passengerPhone}</p>{b.emergencyContact && <p className="text-slate-500 text-xs">EC: {b.emergencyContact}</p>}</div>
              <div className="space-y-0.5"><p className="text-xs text-slate-500">Seat</p><p className="font-medium">{b.seatType}</p><p className="text-slate-600">Base {rupees(b.baseFare)} · Total {rupees(b.totalFare)}</p></div>
              <div className="space-y-0.5"><p className="text-xs text-slate-500">Payment</p><StatusBadge status={b.paymentStatus} colorFn={paymentStatusColor} /><p className="text-slate-600">{b.paymentMethod}</p></div>
              <div className="space-y-0.5"><p className="text-xs text-slate-500">Booked at</p><p className="font-medium">{format(new Date(b.createdAt), 'dd MMM yyyy, HH:mm')}</p></div>
            </section>
            <hr />
            <section>
              <p className="text-xs text-slate-500 mb-2">Trip</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-0.5"><p className="text-xs text-slate-400">Route</p><p className="font-medium">{b.trip.route ? `${b.trip.route.originLabel} → ${b.trip.route.destinationLabel}` : '—'}</p>{b.trip.route && <p className="text-slate-500 text-xs">{b.trip.route.name}</p>}</div>
                <div className="space-y-0.5"><p className="text-xs text-slate-400">Departure</p><p className="font-medium">{format(new Date(b.trip.departureAt), 'dd MMM yyyy, HH:mm')}</p><StatusBadge status={b.trip.status} colorFn={tripStatusColor} /></div>
                <div className="space-y-0.5"><p className="text-xs text-slate-400">Driver</p><p className="font-medium">{b.trip.driver?.name ?? '—'}</p><p className="text-slate-500">{b.trip.driver?.user?.phone ?? ''}</p></div>
                <div className="space-y-0.5"><p className="text-xs text-slate-400">Vehicle</p><p className="font-medium">{b.trip.vehicle?.plate ?? '—'}</p><p className="text-slate-500">{b.trip.vehicle?.type ?? ''}</p></div>
              </div>
            </section>
            {b.invoice && (<><hr /><section><p className="text-xs text-slate-500 mb-1">Invoice</p><p className="font-medium">#{b.invoice.invoiceNo}</p>{b.invoice.pdfUrl && <a href={b.invoice.pdfUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 text-xs underline">Download PDF</a>}</section></>)}
            <hr />
            <TripTimeline tripId={b.tripId} />
            {b.trip.bookings && b.trip.bookings.length > 1 && (
              <><hr /><section><p className="text-xs text-slate-500 mb-2">Other bookings on this trip ({b.trip.bookings.length - 1})</p><div className="space-y-1">{b.trip.bookings.filter((bk) => bk.id !== b.id).map((bk) => (<div key={bk.id} className="flex items-center justify-between text-xs"><span>{bk.passengerName} · {bk.seatType}</span><div className="flex items-center gap-1.5"><StatusBadge status={bk.status} colorFn={bookingStatusColor} /><span className="text-slate-500">{rupees(bk.totalFare)}</span></div></div>))}</div></section></>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── SUPER_ADMIN bookings view ─────────────────────────────────────────────────

const BOOKING_STATUSES: BookingStatus[] = ['CONFIRMED', 'COMPLETED', 'CANCELLED', 'NO_SHOW'];
const TRIP_STATUSES: TripStatus[] = ['OPEN', 'DEPARTED', 'COMPLETED', 'CANCELLED'];
const PAYMENT_STATUSES: PaymentStatus[] = ['INITIATED', 'AUTHORIZED', 'PENDING', 'PAID', 'SETTLED', 'FAILED', 'REFUNDED'];
const ALL = 'ALL';

export function SuperAdminRidesView({ lifecycle, embedded = false }: { lifecycle?: Lifecycle; embedded?: boolean } = {}) {
  const [bookings, setBookings] = useState<AdminBookingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState<AdminBookingFilters>({});
  const [dateFrom, setDateFrom] = useState<Dayjs | null>(null);
  const [dateTo, setDateTo] = useState<Dayjs | null>(null);
  const [selected, setSelected] = useState<AdminBookingRow | null>(null);

  const setFilter = <K extends keyof AdminBookingFilters>(key: K, value: AdminBookingFilters[K]) =>
    setFilters((prev) => ({ ...prev, [key]: value }));

  const activeFilters: AdminBookingFilters = {
    ...filters,
    dateFrom: dateFrom ? dateFrom.format('YYYY-MM-DD') : undefined,
    dateTo: dateTo ? dateTo.format('YYYY-MM-DD') : undefined,
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await adminRidesApi.list(activeFilters);
      setBookings(res.data.bookings);
    } catch (err: any) {
      setError(err?.message ?? 'Failed to load bookings');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(activeFilters)]);

  useEffect(() => { void load(); }, [load]);

  // Restrict to the requested lifecycle (Upcoming / Ongoing / Past) when provided.
  const rows = useMemo(
    () => (lifecycle ? bookings.filter((b) => bookingLifecycle(b.trip?.status, b.status) === lifecycle) : bookings),
    [bookings, lifecycle],
  );

  const totalRevenue = rows.reduce((sum, b) => sum + b.totalFare, 0);
  const metrics = {
    total: rows.length,
    confirmed: rows.filter((b) => b.status === 'CONFIRMED').length,
    completed: rows.filter((b) => b.status === 'COMPLETED').length,
    revenue: totalRevenue,
  };

  const columns: GridColDef<AdminBookingRow>[] = [
    {
      field: 'id',
      headerName: 'Booking',
      width: 100,
      renderCell: ({ value }) => <CellCenter><span className="font-mono text-xs text-slate-500">#{shortId(value as string)}</span></CellCenter>,
    },
    {
      field: 'passengerName',
      headerName: 'Passenger',
      flex: 1.2,
      minWidth: 150,
      renderCell: ({ row }) => (
        <CellCenter className="gap-1.5">
          <User className="h-3.5 w-3.5 text-slate-400 shrink-0" />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium leading-tight">{row.passengerName}</p>
            <p className="truncate text-xs leading-tight text-slate-400">{row.passengerPhone}</p>
          </div>
        </CellCenter>
      ),
    },
    {
      field: 'organization',
      headerName: 'Organization',
      width: 160,
      valueGetter: (_v: any, row: AdminBookingRow) => organizationLabel(row.organization),
    },
    {
      field: 'seatType',
      headerName: 'Seat',
      width: 80,
      align: 'center',
      headerAlign: 'center',
      renderCell: ({ value }) => <CellCenter className="w-full justify-center"><SeatPill value={value as string} /></CellCenter>,
    },
    {
      field: 'route',
      headerName: 'Route',
      flex: 1.5,
      minWidth: 170,
      valueGetter: (_v: any, row: AdminBookingRow) => row.trip.route ? `${row.trip.route.originLabel} → ${row.trip.route.destinationLabel}` : '—',
      renderCell: ({ value }) => (
        <CellCenter className="gap-1 text-xs">
          <MapPin className="h-3 w-3 text-slate-400 shrink-0" />
          <span className="truncate">{value as string}</span>
        </CellCenter>
      ),
    },
    {
      field: 'driverVehicle',
      headerName: 'Driver / Vehicle',
      flex: 1.2,
      minWidth: 140,
      valueGetter: (_v: any, row: AdminBookingRow) => `${row.trip.driver?.name ?? '—'}`,
      renderCell: ({ row }) => (
        <CellCenter className="gap-1.5 text-xs">
          <Car className="h-3.5 w-3.5 text-slate-400 shrink-0" />
          <div className="min-w-0">
            <p className="truncate leading-tight">{row.trip.driver?.name ?? '—'}</p>
            <p className="truncate leading-tight text-slate-400">{row.trip.vehicle?.plate ?? ''}</p>
          </div>
        </CellCenter>
      ),
    },
    {
      field: 'departureAt',
      headerName: 'Departure',
      width: 155,
      valueGetter: (_v: any, row: AdminBookingRow) => new Date(row.trip.departureAt),
      renderCell: ({ row }) => (
        <CellCenter><span className="text-xs leading-none text-slate-600">{format(new Date(row.trip.departureAt), 'dd MMM, HH:mm')}</span></CellCenter>
      ),
    },
    {
      field: 'departureStatus',
      headerName: 'Departure status',
      width: 150,
      align: 'center',
      headerAlign: 'center',
      sortable: false,
      valueGetter: (_v: any, row: AdminBookingRow) => row.trip.status,
      renderCell: ({ row }) => <CellCenter className="w-full justify-center"><StatusBadge status={row.trip.status} colorFn={tripStatusColor} /></CellCenter>,
    },
    {
      field: 'totalFare',
      headerName: 'Fare',
      width: 100,
      type: 'number',
      align: 'right',
      headerAlign: 'right',
      renderCell: ({ value }) => <CellCenter className="w-full justify-end"><span className="text-sm font-semibold">{rupees(value as number)}</span></CellCenter>,
    },
    {
      field: 'status',
      headerName: 'Status',
      width: 115,
      align: 'center',
      headerAlign: 'center',
      renderCell: ({ value }) => <CellCenter className="w-full justify-center"><StatusBadge status={value as string} colorFn={bookingStatusColor} /></CellCenter>,
    },
    {
      field: 'paymentStatus',
      headerName: 'Payment',
      width: 120,
      align: 'center',
      headerAlign: 'center',
      renderCell: ({ row }) => <CellCenter className="w-full justify-center"><StatusBadge status={row.paymentStatus} colorFn={paymentStatusColor} /></CellCenter>,
    },
    {
      field: 'paymentMethod',
      headerName: 'Payment method',
      width: 140,
      align: 'center',
      headerAlign: 'center',
      renderCell: ({ row }) => <CellCenter className="w-full justify-center"><SeatPill value={row.paymentMethod} /></CellCenter>,
    },
  ];

  return (
    <div className="min-h-full space-y-5 bg-slate-50 p-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        {!embedded ? (
          <div>
            <h1 className="flex items-center gap-2 text-xl font-bold text-slate-900">
              <Route className="h-5 w-5 text-blue-600" /> Rides &amp; Bookings
            </h1>
            <p className="mt-0.5 text-sm text-slate-500">All seat bookings across all trips.</p>
          </div>
        ) : <div />}
        <Button size="sm" variant="outline" onClick={() => void load()} className="border-slate-200">
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </Button>
      </div>

      {error && <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"><AlertCircle className="h-4 w-4 shrink-0" />{error}</div>}

      {/* Metrics */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'Total bookings', value: metrics.total, Icon: Users },
          { label: 'Confirmed', value: metrics.confirmed, Icon: Clock },
          { label: 'Completed', value: metrics.completed, Icon: Route },
          { label: 'Revenue', value: rupees(metrics.revenue), Icon: IndianRupee },
        ].map(({ label, value, Icon }) => (
          <Card key={label} className="border-0 shadow-sm">
            <CardContent className="flex items-center justify-between p-4">
              <div><p className="text-xs text-slate-500">{label}</p><p className="text-2xl font-bold text-slate-900">{value}</p></div>
              <Icon className="h-6 w-6 text-blue-500 opacity-60" />
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6 items-end">
        <div className="relative lg:col-span-2">
          <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
          <Input placeholder="Passenger, phone, booking ID…" className="pl-10" value={filters.search ?? ''} onChange={(e) => setFilter('search', e.target.value || undefined)} />
        </div>
        <Select value={filters.status || ALL} onValueChange={(v) => setFilter('status', v === ALL ? undefined : v as BookingStatus)}>
          <SelectTrigger><SelectValue placeholder="Booking status" /></SelectTrigger>
          <SelectContent><SelectItem value={ALL}>All statuses</SelectItem>{BOOKING_STATUSES.map((s) => <SelectItem key={s} value={s}>{s.replace(/_/g, ' ')}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={filters.tripStatus || ALL} onValueChange={(v) => setFilter('tripStatus', v === ALL ? undefined : v as TripStatus)}>
          <SelectTrigger><SelectValue placeholder="Trip status" /></SelectTrigger>
          <SelectContent><SelectItem value={ALL}>All trips</SelectItem>{TRIP_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
        </Select>
        <DatePicker
          label="From date"
          value={dateFrom}
          onChange={setDateFrom}
          format="DD/MM/YYYY"
          slotProps={{ textField: { size: 'small', sx: { '& .MuiInputBase-root': { height: 40, fontSize: '0.875rem' } } } }}
        />
        <DatePicker
          label="To date"
          value={dateTo}
          onChange={setDateTo}
          format="DD/MM/YYYY"
          minDate={dateFrom ?? undefined}
          slotProps={{ textField: { size: 'small', sx: { '& .MuiInputBase-root': { height: 40, fontSize: '0.875rem' } } } }}
        />
      </div>

      {/* DataGrid */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <DataGrid
          rows={rows}
          columns={columns}
          loading={loading}
          rowHeight={64}
          autoHeight
          sx={gridSx}
          onRowClick={({ row }) => setSelected(row as AdminBookingRow)}
          slots={{
            noRowsOverlay: () => (
              <div className="flex flex-col items-center justify-center gap-2 py-16">
                <Route className="h-10 w-10 text-slate-300" />
                <p className="font-medium text-slate-600">No bookings found</p>
                <p className="text-sm text-slate-400">Try adjusting your filters.</p>
              </div>
            ),
          }}
        />
      </div>

      <BookingDetailDialog booking={selected} open={Boolean(selected)} onClose={() => setSelected(null)} />
    </div>
  );
}

// ─── ORG_ADMIN bookings view ──────────────────────────────────────────────────

type OrgSeatBooking = Omit<SeatBooking, 'trip'> & {
  trip?: {
    id: string; departureAt: string; status: string;
    route?: { id: string; name: string; originLabel: string; destinationLabel: string } | null;
    driver?: { id: string; name: string } | null;
    vehicle?: { id: string; plate: string } | null;
  };
};

export function OrgAdminRidesView({ lifecycle, embedded = false }: { lifecycle?: Lifecycle; embedded?: boolean } = {}) {
  const { user } = useAuth();
  const [bookings, setBookings] = useState<OrgSeatBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [orgId, setOrgId] = useState(user?.defaultOrganizationId ?? '');
  const [selected, setSelected] = useState<OrgSeatBooking | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    void orgApi.myOrganizations().then((res) => {
      setOrgs(res.data.organizations);
      setOrgId((cur) => cur || res.data.organizations[0]?.id || '');
    }).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    setError('');
    try {
      const res = await orgApi.listBookings(orgId);
      setBookings(res.data.bookings as OrgSeatBooking[]);
    } catch (err: any) {
      setError(err?.message ?? 'Failed to load bookings');
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => bookings.filter((b) =>
    (!search || b.passengerName.toLowerCase().includes(search.toLowerCase()) || b.passengerPhone.includes(search)) &&
    (!lifecycle || bookingLifecycle(b.trip?.status, b.status) === lifecycle),
  ), [bookings, search, lifecycle]);

  const columns: GridColDef<OrgSeatBooking>[] = [
    {
      field: 'passengerName',
      headerName: 'Passenger',
      flex: 1.2,
      minWidth: 150,
      renderCell: ({ row }) => (
        <CellCenter className="gap-1.5">
          <User className="h-3.5 w-3.5 text-slate-400 shrink-0" />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium leading-tight">{row.passengerName}</p>
            <p className="truncate text-xs leading-tight text-slate-400">{row.passengerPhone}</p>
          </div>
        </CellCenter>
      ),
    },
    {
      field: 'route',
      headerName: 'Route',
      flex: 1.5,
      minWidth: 170,
      valueGetter: (_v: any, row: OrgSeatBooking) => row.trip?.route ? `${row.trip.route.originLabel} → ${row.trip.route.destinationLabel}` : '—',
      renderCell: ({ value }) => (
        <CellCenter className="gap-1 text-xs">
          <MapPin className="h-3 w-3 text-slate-400 shrink-0" /><span className="truncate">{value as string}</span>
        </CellCenter>
      ),
    },
    {
      field: 'departureAt',
      headerName: 'Departure',
      width: 155,
      valueGetter: (_v: any, row: OrgSeatBooking) => row.trip?.departureAt ? new Date(row.trip.departureAt) : null,
      renderCell: ({ row }) => row.trip ? (
        <CellCenter><span className="text-xs leading-none text-slate-600">{format(new Date(row.trip.departureAt), 'dd MMM yyyy, HH:mm')}</span></CellCenter>
      ) : <CellCenter><span className="text-slate-400">—</span></CellCenter>,
    },
    {
      field: 'departureStatus',
      headerName: 'Departure status',
      width: 150,
      align: 'center',
      headerAlign: 'center',
      sortable: false,
      valueGetter: (_v: any, row: OrgSeatBooking) => row.trip?.status ?? '—',
      renderCell: ({ row }) => (
        <CellCenter className="w-full justify-center">
          {row.trip ? <StatusBadge status={row.trip.status} colorFn={tripStatusColor} /> : <span className="text-slate-400">—</span>}
        </CellCenter>
      ),
    },
    {
      field: 'driverVehicle',
      headerName: 'Driver / Vehicle',
      flex: 1,
      minWidth: 130,
      valueGetter: (_v: any, row: OrgSeatBooking) => row.trip?.driver?.name ?? '—',
      renderCell: ({ row }) => (
        <CellCenter className="gap-1.5 text-xs">
          <Car className="h-3.5 w-3.5 text-slate-400 shrink-0" />
          <div className="min-w-0">
            <p className="truncate leading-tight">{row.trip?.driver?.name ?? '—'}</p>
            <p className="truncate leading-tight text-slate-400">{row.trip?.vehicle?.plate ?? ''}</p>
          </div>
        </CellCenter>
      ),
    },
    {
      field: 'seatType',
      headerName: 'Seat',
      width: 80,
      align: 'center',
      headerAlign: 'center',
      renderCell: ({ value }) => <CellCenter className="w-full justify-center"><SeatPill value={value} /></CellCenter>,
    },
    {
      field: 'totalFare',
      headerName: 'Fare',
      width: 100,
      type: 'number',
      align: 'right',
      headerAlign: 'right',
      renderCell: ({ value }) => <CellCenter className="w-full justify-end"><span className="text-sm font-semibold">{rupees(value as number)}</span></CellCenter>,
    },
    {
      field: 'status',
      headerName: 'Status',
      width: 115,
      align: 'center',
      headerAlign: 'center',
      renderCell: ({ value }) => <CellCenter className="w-full justify-center"><StatusBadge status={value as string} colorFn={bookingStatusColor} /></CellCenter>,
    },
    {
      field: 'paymentStatus',
      headerName: 'Payment',
      width: 120,
      align: 'center',
      headerAlign: 'center',
      renderCell: ({ row }) => <CellCenter className="w-full justify-center"><StatusBadge status={row.paymentStatus} colorFn={paymentStatusColor} /></CellCenter>,
    },
    {
      field: 'paymentMethod',
      headerName: 'Payment method',
      width: 140,
      align: 'center',
      headerAlign: 'center',
      renderCell: ({ row }) => <CellCenter className="w-full justify-center"><SeatPill value={row.paymentMethod} /></CellCenter>,
    },
  ];

  return (
    <div className="min-h-full space-y-5 bg-slate-50 p-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        {!embedded ? (
          <div>
            <h1 className="flex items-center gap-2 text-xl font-bold text-slate-900">
              <Route className="h-5 w-5 text-blue-600" /> Rides &amp; Bookings
            </h1>
            <p className="mt-0.5 text-sm text-slate-500">Bookings for your organization&apos;s trips.</p>
          </div>
        ) : <div />}
        <div className="flex gap-2 items-center flex-wrap">
          {orgs.length > 1 && (
            <Select value={orgId} onValueChange={setOrgId}>
              <SelectTrigger className="w-48 border-slate-200 text-sm"><SelectValue placeholder="Select org" /></SelectTrigger>
              <SelectContent>{orgs.map((o) => <SelectItem key={o.id} value={o.id}>{o.tradeName ?? o.legalName}</SelectItem>)}</SelectContent>
            </Select>
          )}
          <Button size="sm" variant="outline" onClick={() => void load()} className="border-slate-200">
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </Button>
        </div>
      </div>

      {error && <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"><AlertCircle className="h-4 w-4 shrink-0" />{error}</div>}

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
        <Input placeholder="Search by passenger…" className="pl-10" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <DataGrid
          rows={filtered}
          columns={columns}
          loading={loading}
          rowHeight={64}
          autoHeight
          sx={gridSx}
          onRowClick={({ row }) => setSelected(row as OrgSeatBooking)}
          slots={{
            noRowsOverlay: () => (
              <div className="flex flex-col items-center justify-center gap-2 py-16">
                <Route className="h-10 w-10 text-slate-300" />
                <p className="font-medium text-slate-600">{bookings.length === 0 ? 'No bookings yet' : 'No results'}</p>
              </div>
            ),
          }}
        />
      </div>

      {selected && (
        <Dialog open onOpenChange={() => setSelected(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>Booking #{shortId(selected.id)}</DialogTitle></DialogHeader>
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div><p className="text-xs text-slate-400">Passenger</p><p className="font-medium">{selected.passengerName}</p><p className="text-slate-500">{selected.passengerPhone}</p></div>
                <div><p className="text-xs text-slate-400">Fare</p><p className="font-medium">{rupees(selected.totalFare)}</p><p className="text-slate-500">{selected.paymentMethod}</p></div>
                <div><p className="text-xs text-slate-400">Status</p><StatusBadge status={selected.status} colorFn={bookingStatusColor} /></div>
                <div><p className="text-xs text-slate-400">Payment</p><StatusBadge status={selected.paymentStatus} colorFn={paymentStatusColor} /></div>
              </div>
              {selected.trip && (
                <><hr />
                  <div className="grid grid-cols-2 gap-3">
                    <div><p className="text-xs text-slate-400">Departure</p><p className="font-medium">{format(new Date(selected.trip.departureAt), 'dd MMM yyyy, HH:mm')}</p></div>
                    <div><p className="text-xs text-slate-400">Trip status</p><StatusBadge status={selected.trip.status} colorFn={tripStatusColor} /></div>
                    {selected.trip.route && <div className="col-span-2"><p className="text-xs text-slate-400">Route</p><p>{selected.trip.route.originLabel} → {selected.trip.route.destinationLabel}</p></div>}
                    {selected.trip.driver && <div><p className="text-xs text-slate-400">Driver</p><p>{selected.trip.driver.name}</p></div>}
                    {selected.trip.vehicle && <div><p className="text-xs text-slate-400">Vehicle</p><p>{selected.trip.vehicle.plate}</p></div>}
                  </div>
                </>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

// ─── Transport requests view ──────────────────────────────────────────────────

export function TransportRequestsView() {
  const [requests, setRequests] = useState<AdminTransportRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [typeFilter, setTypeFilter] = useState<string>('ALL');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await adminTransportRequestsApi.list({ status: statusFilter !== 'ALL' ? statusFilter : undefined, type: typeFilter !== 'ALL' ? typeFilter : undefined });
      const raw = res.data?.requests ?? (res as any).requests ?? [];
      setRequests(Array.isArray(raw) ? raw : []);
    } catch (err: any) {
      setError(err?.message ?? 'Failed to load transport requests');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, typeFilter]);

  useEffect(() => { void load(); }, [load]);

  const metrics = useMemo(() => ({
    total: requests.length,
    requested: requests.filter((r) => r.status === 'REQUESTED').length,
    accepted: requests.filter((r) => r.status === 'ACCEPTED').length,
    budget: requests.reduce((sum, r) => sum + (r.budgetPaise ?? 0), 0),
  }), [requests]);

  const columns: GridColDef<AdminTransportRequest>[] = [
    {
      field: 'id',
      headerName: 'Request',
      width: 120,
      renderCell: ({ value }) => (
        <CellCenter>
          <span className="font-mono text-xs font-semibold text-slate-500">#{(value as string).slice(-8).toUpperCase()}</span>
        </CellCenter>
      ),
    },
    {
      field: 'type',
      headerName: 'Type',
      width: 145,
      renderCell: ({ value }) => <CellCenter><TransportTypePill value={value as string} /></CellCenter>,
    },
    {
      field: 'route', headerName: 'Route', flex: 1.5, minWidth: 240,
      valueGetter: (_v: any, row: AdminTransportRequest) => `${row.from} → ${row.to}`,
      renderCell: ({ value, row }) => (
        <CellCenter className="gap-2">
          <MapPin className="h-3.5 w-3.5 text-slate-400 shrink-0" />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-900">{value as string}</p>
            {row.parcelDetails && <p className="truncate text-xs text-slate-400">{row.parcelDetails}</p>}
          </div>
        </CellCenter>
      ),
    },
    {
      field: 'requestedFor',
      headerName: 'Date',
      width: 135,
      renderCell: ({ value }) => (
        <CellStack>
          <span className="text-xs font-semibold text-slate-700">{format(new Date(value as string), 'dd MMM')}</span>
          <span className="text-xs text-slate-400">{format(new Date(value as string), 'HH:mm')}</span>
        </CellStack>
      ),
    },
    {
      field: 'passengerName', headerName: 'Passenger', flex: 1, minWidth: 130,
      renderCell: ({ row }) => (
        <CellCenter className="gap-2">
          <User className="h-3.5 w-3.5 text-slate-400 shrink-0" />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold leading-tight text-slate-900">{row.passengerName ?? '—'}</p>
            {row.passengerPhone && <p className="truncate text-xs leading-tight text-slate-400">{row.passengerPhone}</p>}
          </div>
        </CellCenter>
      ),
    },
    {
      field: 'seats',
      headerName: 'Seats',
      width: 80,
      align: 'center',
      headerAlign: 'center',
      renderCell: ({ value }) => <CellCenter className="w-full justify-center"><span className="text-sm font-semibold text-slate-800">{value as number}</span></CellCenter>,
    },
    {
      field: 'budgetPaise',
      headerName: 'Budget',
      width: 120,
      align: 'right',
      headerAlign: 'right',
      renderCell: ({ value }) => <CellCenter className="w-full justify-end"><span className="text-sm font-semibold text-slate-900">{value ? rupees(value as number) : '—'}</span></CellCenter>,
    },
    {
      field: 'status',
      headerName: 'Status',
      width: 125,
      align: 'center',
      headerAlign: 'center',
      renderCell: ({ value }) => <CellCenter className="w-full justify-center"><StatusBadge status={value as string} colorFn={requestStatusColor} /></CellCenter>,
    },
  ];

  return (
    <div className="min-h-full space-y-4 bg-slate-50 p-4 sm:p-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-950">Transport requests</h2>
          <p className="mt-0.5 text-sm text-slate-500">Full vehicle, seat, and parcel booking requests.</p>
        </div>
        <Button size="sm" variant="outline" onClick={() => void load()} className="border-slate-200">
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: 'Total requests', value: metrics.total, Icon: Route, color: 'text-blue-600' },
          { label: 'Requested', value: metrics.requested, Icon: Clock, color: 'text-amber-600' },
          { label: 'Accepted', value: metrics.accepted, Icon: Users, color: 'text-emerald-600' },
          { label: 'Budget', value: rupees(metrics.budget), Icon: IndianRupee, color: 'text-slate-600' },
        ].map(({ label, value, Icon, color }) => (
          <Card key={label} className="border border-slate-200 shadow-sm">
            <CardContent className="flex items-center justify-between p-4">
              <div>
                <p className="text-xs font-medium text-slate-500">{label}</p>
                <p className="mt-1 text-2xl font-bold text-slate-950">{value}</p>
              </div>
              <Icon className={`h-5 w-5 ${color}`} />
            </CardContent>
          </Card>
        ))}
      </div>

      {error && <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"><AlertCircle className="h-4 w-4 shrink-0" />{error}</div>}
      <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-3 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full border-slate-200 text-sm sm:w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All statuses</SelectItem>
            <SelectItem value="REQUESTED">Requested</SelectItem>
            <SelectItem value="ACCEPTED">Accepted</SelectItem>
            <SelectItem value="REJECTED">Rejected</SelectItem>
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-full border-slate-200 text-sm sm:w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All types</SelectItem>
            <SelectItem value="FULL_VEHICLE">Full vehicle</SelectItem>
            <SelectItem value="SEAT">Seat</SelectItem>
            <SelectItem value="PARCEL">Parcel</SelectItem>
          </SelectContent>
        </Select>
        </div>
        <p className="text-xs font-medium text-slate-400">{requests.length} visible</p>
      </div>

      <div className="grid gap-3 md:hidden">
        {requests.map((request) => (
          <div key={request.id} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-mono text-xs font-semibold text-slate-400">#{request.id.slice(-8).toUpperCase()}</p>
                <p className="mt-1 truncate text-sm font-bold text-slate-950">{request.from} → {request.to}</p>
              </div>
              <StatusBadge status={request.status} colorFn={requestStatusColor} />
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <TransportTypePill value={request.type} />
              <span className="inline-flex h-6 items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 text-[10px] font-bold uppercase text-slate-600">
                {request.seats} seats
              </span>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
              <div>
                <p className="text-slate-400">Passenger</p>
                <p className="mt-0.5 truncate font-semibold text-slate-800">{request.passengerName ?? '—'}</p>
                {request.passengerPhone && <p className="truncate text-slate-400">{request.passengerPhone}</p>}
              </div>
              <div>
                <p className="text-slate-400">Date</p>
                <p className="mt-0.5 font-semibold text-slate-800">{format(new Date(request.requestedFor), 'dd MMM, HH:mm')}</p>
              </div>
              <div>
                <p className="text-slate-400">Budget</p>
                <p className="mt-0.5 font-semibold text-slate-800">{request.budgetPaise ? rupees(request.budgetPaise) : '—'}</p>
              </div>
              {request.parcelDetails && (
                <div>
                  <p className="text-slate-400">Parcel</p>
                  <p className="mt-0.5 truncate font-semibold text-slate-800">{request.parcelDetails}</p>
                </div>
              )}
            </div>
          </div>
        ))}
        {!loading && requests.length === 0 && (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-slate-200 bg-white px-4 py-12 text-center">
            <Package className="h-9 w-9 text-slate-300" />
            <p className="mt-3 font-medium text-slate-700">No transport requests found</p>
            <p className="mt-1 text-sm text-slate-400">Try a different status or request type.</p>
          </div>
        )}
      </div>

      <div className="hidden overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm md:block">
        <DataGrid rows={requests} columns={columns} loading={loading} rowHeight={68} autoHeight sx={transportRequestGridSx}
          slots={{ noRowsOverlay: () => <div className="flex flex-col items-center justify-center gap-2 py-16"><Package className="h-10 w-10 text-slate-300" /><p className="font-medium text-slate-600">No transport requests found</p><p className="text-sm text-slate-400">Try a different status or request type.</p></div> }}
        />
      </div>
    </div>
  );
}

// ─── Schedule a trip ──────────────────────────────────────────────────────────

interface TripFormState {
  routeId: string;
  driverId: string;
  vehicleId: string;
  departureDate: Dayjs | null;
  departureTime: Dayjs | null;
  departurePoint: string;
  frontSeats: string;
  backSeats: string;
  notes: string;
}

function ScheduleTripModal({ orgId, open, onClose, onDone }: { orgId: string; open: boolean; onClose: () => void; onDone: () => void }) {
  const emptyForm: TripFormState = {
    routeId: '', driverId: '', vehicleId: '',
    departureDate: dayjs().add(1, 'day'),
    departureTime: dayjs().hour(6).minute(0).second(0),
    departurePoint: '', frontSeats: '1', backSeats: '4', notes: '',
  };
  const [form, setForm] = useState<TripFormState>(emptyForm);
  const [routes, setRoutes] = useState<RouteRecord[]>([]);
  const [drivers, setDrivers] = useState<OrgDriverLink[]>([]);
  const [vehicles, setVehicles] = useState<OrgVehicleLink[]>([]);
  const [loading, setLoading] = useState(false);
  const [dataLoading, setDataLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open || !orgId) return;
    setForm(emptyForm);
    setError('');
    setDataLoading(true);
    void Promise.all([orgApi.listRoutes(orgId), orgApi.listDrivers(orgId), orgApi.listVehicles(orgId)])
      .then(([routeRes, driverRes, vehicleRes]) => {
        setRoutes(routeRes.data.routes.filter((r) => r.status !== 'INACTIVE'));
        setDrivers(driverRes.data.links.filter((d) => d.status === 'ACTIVE'));
        setVehicles(vehicleRes.data.vehicles);
      }).catch(() => setError('Failed to load form data'))
      .finally(() => setDataLoading(false));
  }, [open, orgId]);

  const setField = <K extends keyof TripFormState>(key: K, val: TripFormState[K]) =>
    setForm((prev) => {
      const next = { ...prev, [key]: val };
      if (key === 'vehicleId' && typeof val === 'string') {
        const vp = vehicles.find((vl) => vl.vehicleId === val)?.vehicle;
        if (vp?.frontSeats) (next as any).frontSeats = String(vp.frontSeats);
        if (vp?.backSeats) (next as any).backSeats = String(vp.backSeats);
      }
      return next;
    });

  const handleSubmit = async () => {
    if (!form.routeId || !form.driverId || !form.vehicleId || !form.departureDate || !form.departureTime || !form.departurePoint) {
      setError('Please fill all required fields');
      return;
    }
    const departureAt = form.departureDate.format('YYYY-MM-DD') + 'T' + form.departureTime.format('HH:mm') + ':00+05:30';
    setLoading(true);
    setError('');
    try {
      await orgApi.createScheduledTrip(orgId, {
        routeId: form.routeId, driverId: form.driverId, vehicleId: form.vehicleId,
        departureAt, departurePoint: form.departurePoint,
        frontSeatsTotal: parseInt(form.frontSeats, 10) || 1,
        backSeatsTotal: parseInt(form.backSeats, 10) || 4,
        notes: form.notes || undefined,
      });
      onClose();
      onDone();
    } catch (err: any) {
      setError(err?.message ?? 'Failed to schedule trip');
    } finally {
      setLoading(false);
    }
  };

  const canSubmit = Boolean(form.routeId && form.driverId && form.vehicleId && form.departureDate?.isValid() && form.departureTime?.isValid() && form.departurePoint);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Schedule a trip</DialogTitle></DialogHeader>
        {dataLoading ? (
          <div className="flex items-center justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-blue-500" /></div>
        ) : (
          <div className="space-y-4 pt-2">
            {error && <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"><AlertCircle className="h-4 w-4 shrink-0" />{error}</div>}

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700">Route <span className="text-red-500">*</span></label>
              <Select value={form.routeId} onValueChange={(v) => setField('routeId', v)}>
                <SelectTrigger><SelectValue placeholder="Select route" /></SelectTrigger>
                <SelectContent>{routes.map((r) => <SelectItem key={r.id} value={r.id}>{r.originLabel} → {r.destinationLabel}</SelectItem>)}</SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700">Driver <span className="text-red-500">*</span></label>
              <Select value={form.driverId} onValueChange={(v) => setField('driverId', v)}>
                <SelectTrigger><SelectValue placeholder="Select driver" /></SelectTrigger>
                <SelectContent>{drivers.map((d) => <SelectItem key={d.driverId} value={d.driverId}>{d.driver?.name ?? d.driverId}{d.driver?.user?.phone ? ` · ${d.driver.user.phone}` : ''}</SelectItem>)}</SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700">Vehicle <span className="text-red-500">*</span></label>
              <Select value={form.vehicleId} onValueChange={(v) => setField('vehicleId', v)}>
                <SelectTrigger><SelectValue placeholder="Select vehicle" /></SelectTrigger>
                <SelectContent>{vehicles.map((v) => <SelectItem key={v.vehicleId} value={v.vehicleId}>{v.vehicle?.plate ?? v.vehicleId}{v.vehicle?.type ? ` · ${v.vehicle.type}` : ''}</SelectItem>)}</SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-slate-700">Date <span className="text-red-500">*</span></label>
                <DatePicker
                  value={form.departureDate}
                  onChange={(v) => setField('departureDate', v)}
                  format="DD/MM/YYYY"
                  minDate={dayjs()}
                  slotProps={{ textField: { size: 'small', fullWidth: true, sx: { '& .MuiInputBase-root': { fontSize: '0.875rem' } } } }}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-slate-700">Time (IST) <span className="text-red-500">*</span></label>
                <TimePicker
                  value={form.departureTime}
                  onChange={(v) => setField('departureTime', v)}
                  format="HH:mm"
                  ampm={false}
                  slotProps={{ textField: { size: 'small', fullWidth: true, sx: { '& .MuiInputBase-root': { fontSize: '0.875rem' } } } }}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700">Pickup point <span className="text-red-500">*</span></label>
              <Input value={form.departurePoint} onChange={(e) => setField('departurePoint', e.target.value)} placeholder="e.g. Dehradun Bus Stand" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-slate-700">Front seats</label>
                <Input type="number" min="0" value={form.frontSeats} onChange={(e) => setField('frontSeats', e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-slate-700">Back seats</label>
                <Input type="number" min="0" value={form.backSeats} onChange={(e) => setField('backSeats', e.target.value)} />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700">Notes (optional)</label>
              <textarea className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400 resize-none" rows={2} maxLength={500} value={form.notes} onChange={(e) => setField('notes', e.target.value)} placeholder="Any notes for this trip…" />
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
              <Button size="sm" disabled={loading || !canSubmit} onClick={() => void handleSubmit()} className="bg-blue-600 hover:bg-blue-700">
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Schedule trip
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Trip detail modal ────────────────────────────────────────────────────────

function readLocationLabel(json: Record<string, unknown> | null | undefined): string | null {
  if (!json) return null;
  return (json.label ?? json.name ?? json.address ?? json.formattedAddress) as string | null;
}

function PassengerRow({ booking, index }: { booking: AdminBookingRow; index: number }) {
  const pickupLabel = readLocationLabel(booking.pickupJson);
  const dropLabel = readLocationLabel(booking.dropoffJson);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-sm font-bold text-slate-600">
            {index + 1}
          </div>
          <div className="min-w-0">
            <p className="truncate font-semibold text-slate-900">{booking.passengerName}</p>
            <a href={`tel:${booking.passengerPhone}`} className="flex items-center gap-1 text-xs text-blue-600 hover:underline">
              <Phone className="h-3 w-3" /> {booking.passengerPhone}
            </a>
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <StatusBadge status={booking.status} colorFn={bookingStatusColor} />
          <SeatPill value={booking.seatType} />
        </div>
      </div>

      {/* Pickup → Drop */}
      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div className="flex items-start gap-2 rounded-lg bg-emerald-50 px-3 py-2">
          <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-700">Pickup</p>
            <p className="mt-0.5 break-words text-xs text-slate-700">{pickupLabel ?? 'Not specified'}</p>
          </div>
        </div>
        <div className="flex items-start gap-2 rounded-lg bg-purple-50 px-3 py-2">
          <Navigation className="mt-0.5 h-3.5 w-3.5 shrink-0 text-purple-600" />
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-wide text-purple-700">Drop</p>
            <p className="mt-0.5 break-words text-xs text-slate-700">{dropLabel ?? 'Not specified'}</p>
          </div>
        </div>
      </div>

      {/* Fare + Payment */}
      <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-3">
        <div className="flex items-center gap-1.5 text-sm">
          <IndianRupee className="h-3.5 w-3.5 text-slate-400" />
          <span className="font-bold text-slate-900">{rupees(booking.totalFare)}</span>
          {booking.baseFare && booking.baseFare !== booking.totalFare && (
            <span className="text-xs text-slate-400">(base {rupees(booking.baseFare)})</span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <SeatPill value={booking.paymentMethod} />
          <StatusBadge status={booking.paymentStatus} colorFn={paymentStatusColor} />
        </div>
        {booking.emergencyContact && (
          <p className="text-xs text-slate-400 ml-auto">EC: {booking.emergencyContact}</p>
        )}
      </div>
    </div>
  );
}

function TripDetailModal({ trip, open, onClose }: { trip: ScheduledTrip | null; open: boolean; onClose: () => void }) {
  const [bookings, setBookings] = useState<AdminBookingRow[]>([]);
  const [events, setEvents] = useState<TripEvent[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !trip) { setBookings([]); setEvents([]); return; }
    setLoading(true);
    void Promise.all([
      adminRidesApi.list({ tripId: trip.id }),
      adminTripsApi.getTimeline(trip.id),
    ]).then(([bookingRes, timelineRes]) => {
      setBookings(bookingRes.data.bookings);
      setEvents(timelineRes.events ?? []);
    }).catch(() => {}).finally(() => setLoading(false));
  }, [open, trip]);

  if (!trip) return null;

  const route = trip.route ? `${trip.route.originLabel} → ${trip.route.destinationLabel}` : '—';
  const totalRevenue = bookings.reduce((s, b) => s + b.totalFare, 0);
  const confirmedCount = bookings.filter((b) => b.status === 'CONFIRMED').length;
  const completedCount = bookings.filter((b) => b.status === 'COMPLETED').length;
  const cancelledCount = bookings.filter((b) => b.status === 'CANCELLED' || b.status === 'NO_SHOW').length;

  const eventLabel = (type: string) => {
    const map: Record<string, string> = { 'trip.departed': 'Journey started', 'trip.completed': 'Trip completed', 'trip.cancelled': 'Trip cancelled' };
    return map[type] ?? type.replace('trip.', '').replace(/_/g, ' ');
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto p-0">
        {/* Header */}
        <div className="sticky top-0 z-10 border-b border-slate-200 bg-white px-6 py-4">
          <DialogHeader>
            <DialogTitle className="flex flex-wrap items-center gap-2 text-lg">
              <Route className="h-5 w-5 text-blue-600 shrink-0" />
              {route}
              <StatusBadge status={trip.status} colorFn={tripStatusColor} />
            </DialogTitle>
          </DialogHeader>
          <div className="mt-2 flex flex-wrap items-center gap-4 text-sm text-slate-600">
            <span className="flex items-center gap-1">
              <Clock className="h-3.5 w-3.5 text-slate-400" />
              {format(new Date(trip.departureAt), 'dd MMM yyyy, HH:mm')}
            </span>
            {trip.driver && (
              <span className="flex items-center gap-1">
                <User className="h-3.5 w-3.5 text-slate-400" />
                {trip.driver.name}
                {trip.driver.user?.phone && (
                  <a href={`tel:${trip.driver.user.phone}`} className="text-blue-600 hover:underline ml-1">
                    {trip.driver.user.phone}
                  </a>
                )}
              </span>
            )}
            {trip.vehicle && (
              <span className="flex items-center gap-1">
                <Car className="h-3.5 w-3.5 text-slate-400" />
                {trip.vehicle.plate} · {trip.vehicle.type}
              </span>
            )}
          </div>
        </div>

        <div className="space-y-6 px-6 py-5">
          {/* Seat + revenue summary */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: 'Front seats', value: `${trip.frontSeatsBooked}/${trip.frontSeatsTotal}`, icon: <Users className="h-4 w-4 text-blue-500" /> },
              { label: 'Back seats', value: `${trip.backSeatsBooked}/${trip.backSeatsTotal}`, icon: <Users className="h-4 w-4 text-indigo-500" /> },
              { label: 'Total bookings', value: bookings.length, icon: <Package className="h-4 w-4 text-amber-500" /> },
              { label: 'Revenue', value: rupees(totalRevenue), icon: <IndianRupee className="h-4 w-4 text-emerald-500" /> },
            ].map(({ label, value, icon }) => (
              <div key={label} className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div>
                  <p className="text-xs text-slate-500">{label}</p>
                  <p className="mt-0.5 text-lg font-bold text-slate-900">{value}</p>
                </div>
                {icon}
              </div>
            ))}
          </div>

          {/* Booking status breakdown */}
          {bookings.length > 0 && (
            <div className="flex flex-wrap gap-3 text-sm">
              {confirmedCount > 0 && (
                <span className="flex items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-blue-800">
                  <CheckCircle2 className="h-3.5 w-3.5" /> {confirmedCount} Confirmed
                </span>
              )}
              {completedCount > 0 && (
                <span className="flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-emerald-800">
                  <CheckCircle2 className="h-3.5 w-3.5" /> {completedCount} Completed
                </span>
              )}
              {cancelledCount > 0 && (
                <span className="flex items-center gap-1.5 rounded-full border border-red-200 bg-red-50 px-3 py-1 text-red-800">
                  <XCircle className="h-3.5 w-3.5" /> {cancelledCount} Cancelled / No-show
                </span>
              )}
            </div>
          )}

          {/* Passengers */}
          <section>
            <h3 className="mb-3 text-sm font-semibold text-slate-700">
              Passengers ({bookings.length})
            </h3>
            {loading ? (
              <div className="flex items-center gap-2 py-6 text-sm text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading passengers…
              </div>
            ) : bookings.length === 0 ? (
              <p className="rounded-lg border border-dashed border-slate-200 py-8 text-center text-sm text-slate-400">
                No bookings on this trip yet.
              </p>
            ) : (
              <div className="space-y-3">
                {bookings.map((b, i) => <PassengerRow key={b.id} booking={b} index={i} />)}
              </div>
            )}
          </section>

          {/* Trip timeline */}
          {events.length > 0 && (
            <section>
              <h3 className="mb-3 text-sm font-semibold text-slate-700">Timeline</h3>
              <ol className="relative ml-1 space-y-3 border-l border-slate-200 pl-4">
                {events.map((ev) => (
                  <li key={ev.id} className="text-xs">
                    <span className="absolute -left-1.5 mt-0.5 h-3 w-3 rounded-full border border-white bg-slate-400" />
                    <p className="font-medium text-slate-800">{eventLabel(ev.type)}</p>
                    <p className="text-slate-500">{format(new Date(ev.createdAt), 'dd MMM yyyy, HH:mm:ss')}</p>
                  </li>
                ))}
              </ol>
            </section>
          )}

          {/* Departure point */}
          {trip.departurePoint && (
            <section>
              <h3 className="mb-1 text-sm font-semibold text-slate-700">Departure point</h3>
              <p className="flex items-center gap-1.5 text-sm text-slate-600">
                <MapPin className="h-4 w-4 text-slate-400" /> {trip.departurePoint}
              </p>
            </section>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function ScheduledTripsView({
  lifecycle,
  embedded = false,
  allowSchedule = true,
  title = 'Scheduled trips',
  subtitle = 'All trips scheduled by your organization.',
}: {
  lifecycle?: Lifecycle;
  embedded?: boolean;
  allowSchedule?: boolean;
  title?: string;
  subtitle?: string;
} = {}) {
  const { user } = useAuth();
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';
  const [trips, setTrips] = useState<ScheduledTrip[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [orgId, setOrgId] = useState(user?.defaultOrganizationId ?? '');
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [selectedTrip, setSelectedTrip] = useState<ScheduledTrip | null>(null);

  useEffect(() => {
    if (isSuperAdmin) return; // super admin views all orgs' trips, no org picker
    void orgApi.myOrganizations().then((res) => {
      setOrgs(res.data.organizations);
      setOrgId((cur) => cur || res.data.organizations[0]?.id || '');
    }).catch(() => {});
  }, [isSuperAdmin]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      if (isSuperAdmin) {
        // No dedicated "all trips" endpoint — derive the trip set from every booking.
        const res = await adminRidesApi.list({});
        const map = new Map<string, ScheduledTrip>();
        for (const b of res.data.bookings) {
          if (b.trip && !map.has(b.trip.id)) map.set(b.trip.id, b.trip as unknown as ScheduledTrip);
        }
        setTrips([...map.values()].sort((a, b) => new Date(b.departureAt).getTime() - new Date(a.departureAt).getTime()));
      } else {
        if (!orgId) { setLoading(false); return; }
        const res = await orgApi.listScheduledTrips(orgId);
        setTrips([...res.data.trips].sort((a, b) => new Date(b.departureAt).getTime() - new Date(a.departureAt).getTime()));
      }
    } catch (err: any) {
      setError(err?.message ?? 'Failed to load trips');
    } finally {
      setLoading(false);
    }
  }, [orgId, isSuperAdmin]);

  useEffect(() => { void load(); }, [load]);

  const shownTrips = useMemo(
    () => (lifecycle ? trips.filter((t) => tripLifecycle(t.status) === lifecycle) : trips),
    [trips, lifecycle],
  );
  const canSchedule = allowSchedule && !isSuperAdmin;
  const columns: GridColDef<ScheduledTrip>[] = [
    {
      field: 'route',
      headerName: 'Route',
      flex: 1.5,
      minWidth: 180,
      valueGetter: (_v: any, row: ScheduledTrip) => row.route ? `${row.route.originLabel} → ${row.route.destinationLabel}` : '—',
      renderCell: ({ value }) => (
        <div className="flex min-w-0 items-center gap-2">
          <MapPin className="h-3.5 w-3.5 text-slate-400 shrink-0" />
          <span className="truncate text-sm font-semibold text-slate-950">{value as string}</span>
        </div>
      ),
    },
    {
      field: 'departureAt',
      headerName: 'Departure',
      width: 155,
      valueGetter: (_v: any, row: ScheduledTrip) => new Date(row.departureAt),
      renderCell: ({ row }) => (
        <div className="flex flex-col gap-0.5 text-xs text-slate-500">
          <span className="font-semibold text-slate-700">{format(new Date(row.departureAt), 'dd MMM yyyy')}</span>
          <span>{format(new Date(row.departureAt), 'HH:mm')}</span>
        </div>
      ),
    },
    {
      field: 'driver',
      headerName: 'Driver',
      flex: 1,
      minWidth: 130,
      valueGetter: (_v: any, row: ScheduledTrip) => row.driver?.name ?? '—',
      renderCell: ({ row }) => (
        <div className="flex min-w-0 items-center gap-2">
          <User className="h-3.5 w-3.5 text-slate-400 shrink-0" />
          <span className="truncate text-sm font-medium text-slate-800">{row.driver?.name ?? '—'}</span>
        </div>
      ),
    },
    {
      field: 'vehicle',
      headerName: 'Vehicle',
      flex: 1,
      minWidth: 130,
      valueGetter: (_v: any, row: ScheduledTrip) => row.vehicle?.plate ?? '—',
      renderCell: ({ row }) => (
        <div className="flex min-w-0 items-center gap-2">
          <Car className="h-3.5 w-3.5 text-slate-400 shrink-0" />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-900">{row.vehicle?.plate ?? '—'}</p>
            {row.vehicle?.type && <p className="truncate text-xs text-slate-400">{row.vehicle.type}</p>}
          </div>
        </div>
      ),
    },
    {
      field: 'status',
      headerName: 'Status',
      width: 120,
      align: 'center',
      headerAlign: 'center',
      renderCell: ({ value }) => <div className="flex w-full items-center justify-center"><StatusBadge status={value as string} colorFn={tripStatusColor} /></div>,
    },
    {
      field: 'seats',
      headerName: 'Seats',
      width: 175,
      sortable: false,
      renderCell: ({ row }) => (
        <div className="flex flex-col gap-1 text-xs font-medium text-slate-600">
          <span>Front <span className="text-slate-900">{row.frontSeatsBooked}/{row.frontSeatsTotal}</span></span>
          <span>Back <span className="text-slate-900">{row.backSeatsBooked}/{row.backSeatsTotal}</span></span>
        </div>
      ),
    },
  ];

  return (
    <div className={`${embedded ? 'space-y-4 p-4 sm:p-5' : 'min-h-full space-y-5 p-5'} bg-slate-50`}>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        {!embedded && (
          <div>
            <h1 className="flex items-center gap-2 text-xl font-bold text-slate-900">
              <CalendarIcon className="h-5 w-5 text-blue-600" /> {title}
            </h1>
            <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>
          </div>
        )}
        <div className="flex gap-2 items-center flex-wrap">
          {!isSuperAdmin && orgs.length > 1 && (
            <Select value={orgId} onValueChange={setOrgId}>
              <SelectTrigger className="w-48 border-slate-200 text-sm"><SelectValue placeholder="Select org" /></SelectTrigger>
              <SelectContent>{orgs.map((o) => <SelectItem key={o.id} value={o.id}>{o.tradeName ?? o.legalName}</SelectItem>)}</SelectContent>
            </Select>
          )}
          <Button size="sm" variant="outline" onClick={() => void load()} className="border-slate-200">
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </Button>
          {canSchedule && orgId && (
            <Button size="sm" className="bg-blue-600 hover:bg-blue-700" onClick={() => setScheduleOpen(true)}>
              <Plus className="mr-2 h-4 w-4" /> Schedule trip
            </Button>
          )}
        </div>
      </div>
      {error && <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"><AlertCircle className="h-4 w-4 shrink-0" />{error}</div>}
      <div className="grid gap-3 md:hidden">
        {shownTrips.map((trip) => (
          <div key={trip.id} role="button" tabIndex={0} onClick={() => setSelectedTrip(trip)} onKeyDown={(e) => { if (e.key === 'Enter') setSelectedTrip(trip); }} className="cursor-pointer rounded-lg border border-slate-200 bg-white p-4 shadow-sm hover:border-blue-300 hover:bg-blue-50/30 transition-colors">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-950">
                  {trip.route ? `${trip.route.originLabel} → ${trip.route.destinationLabel}` : '—'}
                </p>
                <p className="mt-1 text-xs font-medium text-slate-500">{format(new Date(trip.departureAt), 'dd MMM yyyy, HH:mm')}</p>
              </div>
              <StatusBadge status={trip.status} colorFn={tripStatusColor} />
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
              <div>
                <p className="text-slate-400">Driver</p>
                <p className="mt-0.5 truncate font-medium text-slate-800">{trip.driver?.name ?? '—'}</p>
              </div>
              <div>
                <p className="text-slate-400">Vehicle</p>
                <p className="mt-0.5 truncate font-medium text-slate-800">{trip.vehicle?.plate ?? '—'}</p>
              </div>
              <div>
                <p className="text-slate-400">Front seats</p>
                <p className="mt-0.5 font-medium text-slate-800">{trip.frontSeatsBooked}/{trip.frontSeatsTotal}</p>
              </div>
              <div>
                <p className="text-slate-400">Back seats</p>
                <p className="mt-0.5 font-medium text-slate-800">{trip.backSeatsBooked}/{trip.backSeatsTotal}</p>
              </div>
            </div>
          </div>
        ))}
        {!loading && shownTrips.length === 0 && (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-slate-200 bg-white px-4 py-12 text-center">
            <CalendarIcon className="h-9 w-9 text-slate-300" />
            <p className="mt-3 font-medium text-slate-700">No trips here</p>
            <p className="mt-1 text-sm text-slate-400">{canSchedule ? 'Create a trip to start accepting bookings.' : 'Nothing in this view yet.'}</p>
            {canSchedule && orgId && <Button size="sm" className="mt-4 bg-blue-600 hover:bg-blue-700" onClick={() => setScheduleOpen(true)}><Plus className="mr-1.5 h-4 w-4" /> Schedule trip</Button>}
          </div>
        )}
      </div>
      <div className="hidden overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm md:block">
        <DataGrid
          rows={shownTrips}
          columns={columns}
          loading={loading}
          rowHeight={68}
          autoHeight
          sx={scheduledTripGridSx}
          onRowClick={({ row }) => setSelectedTrip(row as ScheduledTrip)}
          slots={{
            noRowsOverlay: () => (
              <div className="flex flex-col items-center justify-center gap-3 py-16 text-slate-500">
                <CalendarIcon className="h-10 w-10 text-slate-300" />
                <p className="font-medium text-slate-600">No trips here</p>
                <p className="mb-2 text-sm text-slate-400">{canSchedule ? 'Create a trip to start accepting bookings.' : 'Nothing in this view yet.'}</p>
                {canSchedule && orgId && <Button size="sm" className="bg-blue-600 hover:bg-blue-700" onClick={() => setScheduleOpen(true)}><Plus className="mr-1.5 h-4 w-4" /> Schedule trip</Button>}
              </div>
            ),
          }}
        />
      </div>
      {canSchedule && <ScheduleTripModal orgId={orgId} open={scheduleOpen} onClose={() => setScheduleOpen(false)} onDone={() => { void load(); toast.success('Trip scheduled successfully'); }} />}
      <TripDetailModal trip={selectedTrip} open={Boolean(selectedTrip)} onClose={() => setSelectedTrip(null)} />
    </div>
  );
}

// Page entry points live in ./page.tsx (Rides) and ../bookings/page.tsx.
