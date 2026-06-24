'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import { format } from 'date-fns';
import {
  AlertCircle,
  Calendar,
  IndianRupee,
  Loader2,
  MapPin,
  RefreshCw,
  Route,
  Search,
  User,
  Users,
  X,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  adminPassengersApi,
  type AdminPassengerBooking,
  type AdminPassengerDetail,
  type AdminPassengerRow,
  type BookingStatus,
} from '@/lib/api';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function rupees(paise: number) {
  return `₹${(paise / 100).toLocaleString('en-IN')}`;
}

function shortId(id: string) {
  return id.slice(-8).toUpperCase();
}

function bookingStatusColor(s?: string) {
  if (s === 'CONFIRMED') return 'bg-blue-100 text-blue-800 border-blue-200';
  if (s === 'COMPLETED') return 'bg-emerald-100 text-emerald-800 border-emerald-200';
  if (s === 'CANCELLED' || s === 'NO_SHOW') return 'bg-red-100 text-red-800 border-red-200';
  return 'bg-slate-100 text-slate-700 border-slate-200';
}

function paymentStatusColor(s?: string) {
  if (s === 'PAID' || s === 'SETTLED') return 'bg-emerald-100 text-emerald-800 border-emerald-200';
  if (s === 'PENDING') return 'bg-amber-100 text-amber-800 border-amber-200';
  if (s === 'FAILED' || s === 'REFUNDED') return 'bg-red-100 text-red-800 border-red-200';
  return 'bg-slate-100 text-slate-700 border-slate-200';
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

const gridSx = {
  border: 'none',
  '& .MuiDataGrid-row': { cursor: 'pointer' },
  '& .MuiDataGrid-cell': { alignItems: 'center', display: 'flex', lineHeight: 'normal', py: 0 },
  '& .MuiDataGrid-columnHeader': { alignItems: 'center' },
  '& .MuiDataGrid-cell:focus, & .MuiDataGrid-columnHeader:focus': { outline: 'none' },
};

// ─── Booking card ─────────────────────────────────────────────────────────────

function BookingCard({ booking }: { booking: AdminPassengerBooking }) {
  const route = booking.trip.route;
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <MapPin className="h-3 w-3 shrink-0" />
            <span className="truncate font-medium text-slate-800">
              {route ? `${route.originLabel} → ${route.destinationLabel}` : '—'}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-slate-500">
            {format(new Date(booking.trip.departureAt), 'dd MMM yyyy, HH:mm')}
            {booking.trip.driver ? ` · ${booking.trip.driver.name}` : ''}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <StatusBadge status={booking.status} colorFn={bookingStatusColor} />
          <span className="text-xs font-semibold text-slate-800">{rupees(booking.totalFare)}</span>
        </div>
      </div>
      <div className="flex items-center justify-between text-xs text-slate-500">
        <span>
          {booking.seatType} · {booking.paymentMethod}
        </span>
        <StatusBadge status={booking.paymentStatus} colorFn={paymentStatusColor} />
      </div>
      {(booking.passengerName !== '' || booking.passengerPhone !== '') && (
        <p className="text-xs text-slate-400">
          {booking.passengerName} · {booking.passengerPhone}
        </p>
      )}
    </div>
  );
}

// ─── Passenger detail panel ───────────────────────────────────────────────────

type DetailTab = 'date' | 'route';

function PassengerDetailPanel({
  passengerId,
  summary,
  onClose,
}: {
  passengerId: string;
  summary: AdminPassengerRow;
  onClose: () => void;
}) {
  const [detail, setDetail] = useState<AdminPassengerDetail | null>(null);
  const [bookings, setBookings] = useState<AdminPassengerBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<DetailTab>('date');

  useEffect(() => {
    setLoading(true);
    setError('');
    void adminPassengersApi
      .get(passengerId)
      .then((res) => {
        setDetail(res.data.passenger);
        setBookings(res.data.bookings);
      })
      .catch((err: any) => setError(err?.message ?? 'Failed to load passenger'))
      .finally(() => setLoading(false));
  }, [passengerId]);

  // Group by date (trip departure date)
  const byDate = useMemo(() => {
    const map = new Map<string, AdminPassengerBooking[]>();
    for (const b of bookings) {
      const key = format(new Date(b.trip.departureAt), 'dd MMM yyyy');
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(b);
    }
    return Array.from(map.entries()).sort(
      ([a], [b]) => new Date(b).getTime() - new Date(a).getTime(),
    );
  }, [bookings]);

  // Group by route
  const byRoute = useMemo(() => {
    const map = new Map<string, AdminPassengerBooking[]>();
    for (const b of bookings) {
      const route = b.trip.route;
      const key = route ? `${route.originLabel} → ${route.destinationLabel}` : 'Unknown Route';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(b);
    }
    return Array.from(map.entries()).sort(([, a], [, b]) => b.length - a.length);
  }, [bookings]);

  const totalSpend = bookings
    .filter((b) => b.status !== 'CANCELLED')
    .reduce((s, b) => s + b.totalFare, 0);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onClose}>
      <div
        className="relative flex h-full w-full max-w-xl flex-col overflow-hidden bg-slate-50 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between border-b border-slate-200 bg-white px-5 py-4">
          <div className="min-w-0">
            <h2 className="truncate text-base font-bold text-slate-900">{summary.name}</h2>
            <p className="text-sm text-slate-500">{summary.phone}</p>
            {summary.email && <p className="text-xs text-slate-400">{summary.email}</p>}
            <p className="mt-0.5 text-xs text-slate-400">
              Registered {format(new Date(summary.registeredAt), 'dd MMM yyyy')}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="ml-4 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Stats strip */}
        <div className="grid grid-cols-4 divide-x divide-slate-200 border-b border-slate-200 bg-white">
          {[
            { label: 'Total', value: summary.totalBookings },
            { label: 'Completed', value: summary.completedBookings },
            { label: 'Cancelled', value: summary.cancelledBookings },
            { label: 'Spent', value: rupees(totalSpend) },
          ].map(({ label, value }) => (
            <div key={label} className="flex flex-col items-center py-3">
              <span className="text-base font-bold text-slate-900">{value}</span>
              <span className="text-[10px] text-slate-500">{label}</span>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="border-b border-slate-200 bg-white px-4">
          <nav className="flex gap-1">
            {(['date', 'route'] as DetailTab[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={[
                  'px-4 py-2.5 text-sm font-medium border-b-2 transition-colors capitalize',
                  tab === t
                    ? 'border-blue-600 text-blue-700'
                    : 'border-transparent text-slate-500 hover:text-slate-800',
                ].join(' ')}
              >
                By {t}
              </button>
            ))}
          </nav>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-4 py-4">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
            </div>
          )}
          {error && (
            <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}
          {!loading && !error && bookings.length === 0 && (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-slate-400">
              <Route className="h-10 w-10 text-slate-300" />
              <p className="font-medium text-slate-600">No bookings yet</p>
            </div>
          )}

          {!loading && tab === 'date' && (
            <div className="space-y-5">
              {byDate.map(([date, bks]) => (
                <section key={date}>
                  <div className="mb-2 flex items-center gap-2">
                    <Calendar className="h-3.5 w-3.5 text-slate-400" />
                    <span className="text-xs font-semibold text-slate-600">{date}</span>
                    <Badge className="ml-auto border-slate-200 bg-slate-100 text-slate-500 text-[10px]">
                      {bks.length} booking{bks.length > 1 ? 's' : ''}
                    </Badge>
                  </div>
                  <div className="space-y-2">
                    {bks.map((b) => (
                      <BookingCard key={b.id} booking={b} />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}

          {!loading && tab === 'route' && (
            <div className="space-y-5">
              {byRoute.map(([routeLabel, bks]) => (
                <section key={routeLabel}>
                  <div className="mb-2 flex items-center gap-2">
                    <MapPin className="h-3.5 w-3.5 text-slate-400" />
                    <span className="text-xs font-semibold text-slate-600">{routeLabel}</span>
                    <Badge className="ml-auto border-slate-200 bg-slate-100 text-slate-500 text-[10px]">
                      {bks.length} booking{bks.length > 1 ? 's' : ''}
                    </Badge>
                  </div>
                  <div className="space-y-2">
                    {bks
                      .sort(
                        (a, b) =>
                          new Date(b.trip.departureAt).getTime() -
                          new Date(a.trip.departureAt).getTime(),
                      )
                      .map((b) => (
                        <BookingCard key={b.id} booking={b} />
                      ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function PassengersPage() {
  const [passengers, setPassengers] = useState<AdminPassengerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selected, setSelected] = useState<AdminPassengerRow | null>(null);

  // Debounce search 400ms
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async (q?: string) => {
    setLoading(true);
    setError('');
    try {
      const res = await adminPassengersApi.list(q || undefined);
      setPassengers(res.data.passengers);
    } catch (err: any) {
      setError(err?.message ?? 'Failed to load passengers');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(debouncedSearch);
  }, [load, debouncedSearch]);

  const metrics = useMemo(
    () => ({
      total: passengers.length,
      active: passengers.filter((p) => p.totalBookings > 0).length,
      totalBookings: passengers.reduce((s, p) => s + p.totalBookings, 0),
      totalRevenue: passengers.reduce((s, p) => s + p.totalSpendPaise, 0),
    }),
    [passengers],
  );

  const columns: GridColDef<AdminPassengerRow>[] = [
    {
      field: 'name',
      headerName: 'Passenger',
      flex: 1.3,
      minWidth: 160,
      renderCell: ({ row }) => (
        <CellCenter className="gap-1.5">
          <User className="h-3.5 w-3.5 text-slate-400 shrink-0" />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium leading-tight">{row.name}</p>
            <p className="truncate text-xs leading-tight text-slate-400">{row.phone}</p>
          </div>
        </CellCenter>
      ),
    },
    {
      field: 'totalBookings',
      headerName: 'Bookings',
      width: 100,
      type: 'number',
      align: 'center',
      headerAlign: 'center',
      renderCell: ({ row }) => (
        <CellCenter className="w-full justify-center">
          <div className="text-center">
            <p className="text-sm font-semibold text-slate-900">{row.totalBookings}</p>
            {row.totalBookings > 0 && (
              <p className="text-[10px] text-slate-400">
                {row.completedBookings}✓ {row.cancelledBookings > 0 ? `${row.cancelledBookings}✗` : ''}
              </p>
            )}
          </div>
        </CellCenter>
      ),
    },
    {
      field: 'totalSpendPaise',
      headerName: 'Total spend',
      width: 120,
      type: 'number',
      align: 'right',
      headerAlign: 'right',
      renderCell: ({ value }) => (
        <CellCenter className="w-full justify-end">
          <span className="text-sm font-semibold">{rupees(value as number)}</span>
        </CellCenter>
      ),
    },
    {
      field: 'lastBookingAt',
      headerName: 'Last booking',
      width: 140,
      valueGetter: (_v: any, row: AdminPassengerRow) =>
        row.lastBookingAt ? new Date(row.lastBookingAt) : null,
      renderCell: ({ row }) => (
        <CellCenter>
          <span className="text-xs text-slate-500">
            {row.lastBookingAt ? format(new Date(row.lastBookingAt), 'dd MMM yyyy') : '—'}
          </span>
        </CellCenter>
      ),
    },
    {
      field: 'registeredAt',
      headerName: 'Registered',
      width: 130,
      valueGetter: (_v: any, row: AdminPassengerRow) => new Date(row.registeredAt),
      renderCell: ({ row }) => (
        <CellCenter>
          <span className="text-xs text-slate-500">
            {format(new Date(row.registeredAt), 'dd MMM yyyy')}
          </span>
        </CellCenter>
      ),
    },
    {
      field: 'userStatus',
      headerName: 'Status',
      width: 100,
      align: 'center',
      headerAlign: 'center',
      renderCell: ({ value }) => {
        const color =
          value === 'ACTIVE'
            ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
            : value === 'INACTIVE'
              ? 'bg-slate-100 text-slate-600 border-slate-200'
              : 'bg-amber-100 text-amber-800 border-amber-200';
        return (
          <CellCenter className="w-full justify-center">
            <span className={`inline-flex h-5 items-center rounded-full border px-2 text-[10px] font-semibold uppercase ${color}`}>
              {(value as string) ?? 'UNKNOWN'}
            </span>
          </CellCenter>
        );
      },
    },
  ];

  return (
    <div className="min-h-full space-y-5 bg-slate-50 p-5">
      {/* Page header */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-slate-900">
            <Users className="h-5 w-5 text-blue-600" /> Passengers
          </h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Registered users making bookings on Pahadi Rides.
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => void load(debouncedSearch)}
          className="border-slate-200"
        >
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </Button>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Metrics */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'Total passengers', value: metrics.total, Icon: Users },
          { label: 'With bookings', value: metrics.active, Icon: User },
          { label: 'Total bookings', value: metrics.totalBookings, Icon: Route },
          { label: 'Total revenue', value: rupees(metrics.totalRevenue), Icon: IndianRupee },
        ].map(({ label, value, Icon }) => (
          <Card key={label} className="border-0 shadow-sm">
            <CardContent className="flex items-center justify-between p-4">
              <div>
                <p className="text-xs text-slate-500">{label}</p>
                <p className="text-2xl font-bold text-slate-900">{value}</p>
              </div>
              <Icon className="h-6 w-6 text-blue-500 opacity-60" />
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
        <Input
          placeholder="Search by name or phone…"
          className="pl-10"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <DataGrid
          rows={passengers}
          columns={columns}
          loading={loading}
          rowHeight={64}
          autoHeight
          sx={gridSx}
          onRowClick={({ row }) => setSelected(row as AdminPassengerRow)}
          slots={{
            noRowsOverlay: () => (
              <div className="flex flex-col items-center justify-center gap-2 py-16">
                <Users className="h-10 w-10 text-slate-300" />
                <p className="font-medium text-slate-600">
                  {search ? 'No passengers match your search' : 'No passengers registered yet'}
                </p>
              </div>
            ),
          }}
        />
      </div>

      {/* Detail panel */}
      {selected && (
        <PassengerDetailPanel
          passengerId={selected.id}
          summary={selected}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
