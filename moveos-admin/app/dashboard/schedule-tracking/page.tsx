'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { format } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  CalendarDays, Car, Users, Building2, RefreshCw, Loader2, MapPin, Navigation, Phone, Clock, Crosshair,
  ChevronDown, ChevronRight,
} from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import { trackingApi, orgApi, type TrackedTrip, type TrackingStop, type Organization } from '@/lib/api';
import type { StopPoint } from '@/components/StopsMap';

const StopsMap = dynamic(() => import('@/components/StopsMap'), {
  ssr: false,
  loading: () => <div className="h-[464px] rounded-lg border border-slate-200 bg-slate-100 animate-pulse" />,
});

type RidePassenger = {
  bookingId: string;
  name: string;
  phone: string;
  pickup?: TrackingStop;
  drop?: TrackingStop;
};

// Build map points for one stop kind (only stops that have coordinates).
function stopPointsOf(trip: TrackedTrip, kind: 'PICKUP' | 'DROPOFF'): StopPoint[] {
  return trip.stops
    .filter((s) => s.kind === kind && s.lat != null && s.lng != null)
    .map((s) => ({ id: `${s.bookingId}-${kind}`, lat: s.lat as number, lng: s.lng as number, name: s.passengerName, phone: s.passengerPhone, label: s.label ?? '' }));
}

// Group a ride's stops by passenger (booking) → { pickup, drop }.
function passengersOf(trip: TrackedTrip): RidePassenger[] {
  const map = new Map<string, RidePassenger>();
  for (const s of trip.stops) {
    const e = map.get(s.bookingId) ?? { bookingId: s.bookingId, name: s.passengerName, phone: s.passengerPhone };
    if (s.kind === 'PICKUP') e.pickup = s; else e.drop = s;
    map.set(s.bookingId, e);
  }
  return [...map.values()];
}

const ScheduleMap = dynamic(() => import('@/components/ScheduleMap'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-slate-100 rounded-lg">
      <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
    </div>
  ),
});

function todayStr() {
  return new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD in local time
}

function tripStatusBadge(status: string) {
  switch (status) {
    case 'OPEN': return 'bg-sky-100 text-sky-800 border-sky-300';
    case 'DEPARTED': return 'bg-indigo-100 text-indigo-800 border-indigo-300';
    case 'COMPLETED': return 'bg-emerald-100 text-emerald-800 border-emerald-300';
    case 'CANCELLED': return 'bg-rose-100 text-rose-700 border-rose-300';
    default: return 'bg-slate-100 text-slate-700 border-slate-300';
  }
}

function lastSeen(updatedAt: string | null): string {
  if (!updatedAt) return 'No signal yet';
  const secs = Math.round((Date.now() - new Date(updatedAt).getTime()) / 1000);
  if (secs < 60) return 'Live now';
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86400)}d ago`;
}

export default function ScheduleTrackingPage() {
  const { user } = useAuth();
  const isOrgAdmin = user?.role === 'ORG_ADMIN';
  const orgScopeId = user?.defaultOrganizationId ?? user?.memberships?.[0]?.organizationId ?? '';

  const [date, setDate] = useState(todayStr());
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [orgFilter, setOrgFilter] = useState('all');
  const [vehicleFilter, setVehicleFilter] = useState('all');

  const [trips, setTrips] = useState<TrackedTrip[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedTripId, setSelectedTripId] = useState<string | null>(null);
  const [expandedTripId, setExpandedTripId] = useState<string | null>(null);
  // Optional per-passenger focus within the selected ride (renders just their route).
  const [focusBookingId, setFocusBookingId] = useState<string | null>(null);

  useEffect(() => {
    if (isOrgAdmin) return;
    orgApi.list().then((res) => setOrganizations(res.data.organizations)).catch(() => setOrganizations([]));
  }, [isOrgAdmin]);

  const fetchTrips = useCallback(async () => {
    if (isOrgAdmin && !orgScopeId) {
      setError('No organization is linked to this account.');
      setLoading(false);
      return;
    }
    try {
      setError(null);
      const res = isOrgAdmin
        ? await trackingApi.orgSchedule(orgScopeId, { date })
        : await trackingApi.adminSchedule({ date, organizationId: orgFilter === 'all' ? undefined : orgFilter });
      setTrips(res.data.trips);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load scheduled rides');
    } finally {
      setLoading(false);
    }
  }, [isOrgAdmin, orgScopeId, date, orgFilter]);

  useEffect(() => {
    setLoading(true);
    setSelectedTripId(null);
    setExpandedTripId(null);
    setFocusBookingId(null);
    void fetchTrips();
  }, [fetchTrips]);

  const vehicleOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const t of trips) if (t.vehicle.id) seen.set(t.vehicle.id, t.vehicle.plate || t.vehicle.vehicleNumber || t.vehicle.id);
    return [...seen.entries()].map(([id, label]) => ({ id, label }));
  }, [trips]);

  const visibleTrips = useMemo(
    () => (vehicleFilter === 'all' ? trips : trips.filter((t) => t.vehicle.id === vehicleFilter)),
    [trips, vehicleFilter],
  );

  const selectedTrip = useMemo(
    () => visibleTrips.find((t) => t.tripId === selectedTripId) ?? null,
    [visibleTrips, selectedTripId],
  );

  // Ordered plan: all pickups first (in order), then all drops.
  const orderedStops = useMemo(() => {
    if (!selectedTrip) return [];
    const pickups = selectedTrip.stops.filter((s) => s.kind === 'PICKUP');
    const drops = selectedTrip.stops.filter((s) => s.kind === 'DROPOFF');
    return [...pickups, ...drops];
  }, [selectedTrip]);

  const pickupPoints = useMemo(() => (selectedTrip ? stopPointsOf(selectedTrip, 'PICKUP') : []), [selectedTrip]);
  const dropPoints = useMemo(() => (selectedTrip ? stopPointsOf(selectedTrip, 'DROPOFF') : []), [selectedTrip]);
  const driverLoc = selectedTrip?.location ? { lat: selectedTrip.location.lat, lng: selectedTrip.location.lng } : null;

  // Auto-select + expand the first ride when the list changes.
  useEffect(() => {
    if (!selectedTripId && visibleTrips.length > 0) {
      setSelectedTripId(visibleTrips[0].tripId);
      setExpandedTripId(visibleTrips[0].tripId);
    }
  }, [visibleTrips, selectedTripId]);

  const selectRide = (tripId: string) => {
    const willExpand = expandedTripId !== tripId;
    setExpandedTripId(willExpand ? tripId : null);
    setSelectedTripId(tripId);
    setFocusBookingId(null); // header click = whole-ride route
  };

  const selectPassenger = (tripId: string, bookingId: string) => {
    setSelectedTripId(tripId);
    setExpandedTripId(tripId);
    setFocusBookingId(bookingId);
  };

  const totals = useMemo(() => {
    const pickups = visibleTrips.reduce((s, t) => s + t.stops.filter((x) => x.kind === 'PICKUP').length, 0);
    const drops = visibleTrips.reduce((s, t) => s + t.stops.filter((x) => x.kind === 'DROPOFF').length, 0);
    const seats = visibleTrips.reduce((s, t) => s + t.progress.totalPassengers, 0);
    return { rides: visibleTrips.length, pickups, drops, seats };
  }, [visibleTrips]);

  const isToday = date === todayStr();

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
            <CalendarDays className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Schedule Tracking</h1>
            <p className="text-sm text-gray-600">
              Plan {isToday ? "today's" : 'the day’s'} rides ahead of departure — pickup &amp; drop points, planned route and the driver&apos;s last known location.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value || todayStr())}
              className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-700 shadow-sm focus:border-blue-500 focus:outline-none"
            />
          </div>
          {!isToday && (
            <Button variant="outline" size="sm" onClick={() => setDate(todayStr())}>Today</Button>
          )}

          {!isOrgAdmin && (
            <Select value={orgFilter} onValueChange={(v) => { setOrgFilter(v); setSelectedTripId(null); }}>
              <SelectTrigger className="w-52"><Building2 className="w-4 h-4 mr-2" /><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Organizations</SelectItem>
                {organizations.map((o) => <SelectItem key={o.id} value={o.id}>{o.tradeName || o.legalName}</SelectItem>)}
              </SelectContent>
            </Select>
          )}

          <Select value={vehicleFilter} onValueChange={setVehicleFilter}>
            <SelectTrigger className="w-44"><Car className="w-4 h-4 mr-2" /><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Vehicles</SelectItem>
              {vehicleOptions.map((v) => <SelectItem key={v.id} value={v.id}>{v.label}</SelectItem>)}
            </SelectContent>
          </Select>

          <Button variant="outline" size="sm" onClick={() => void fetchTrips()}>
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </Button>
        </div>
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat label="Scheduled rides" value={totals.rides} icon={<CalendarDays className="w-5 h-5 text-blue-600" />} />
        <Stat label="Booked seats" value={totals.seats} icon={<Users className="w-5 h-5 text-amber-600" />} />
        <Stat label="Pickup points" value={totals.pickups} icon={<MapPin className="w-5 h-5 text-emerald-600" />} />
        <Stat label="Drop points" value={totals.drops} icon={<Navigation className="w-5 h-5 text-purple-600" />} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Ride list */}
        <Card className="border-0 shadow-lg lg:col-span-1">
          <CardHeader>
            <CardTitle>Rides on {format(new Date(`${date}T00:00:00`), 'dd MMM yyyy')} ({visibleTrips.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>
            ) : visibleTrips.length === 0 ? (
              <p className="py-8 text-center text-sm text-gray-500">No rides scheduled for this day.</p>
            ) : (
              <div className="space-y-2 max-h-[640px] overflow-auto pr-1">
                {visibleTrips.map((trip) => {
                  const selected = trip.tripId === selectedTripId;
                  const expanded = trip.tripId === expandedTripId;
                  const passengers = passengersOf(trip);
                  return (
                    <div
                      key={trip.tripId}
                      className={`rounded-lg border transition-colors ${selected ? 'border-blue-400 bg-blue-50/40' : 'border-slate-200 bg-white'}`}
                    >
                      {/* Ride header — toggles accordion + selects the whole ride */}
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() => selectRide(trip.tripId)}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectRide(trip.tripId); } }}
                        className="cursor-pointer p-3"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 min-w-0">
                            {expanded ? <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" /> : <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />}
                            <span className="text-sm font-semibold text-slate-900 truncate">{trip.route.from} → {trip.route.to}</span>
                          </div>
                          <Badge variant="outline" className={`text-[10px] shrink-0 ${tripStatusBadge(trip.status)}`}>{trip.status}</Badge>
                        </div>
                        <div className="mt-1 flex items-center gap-2 text-xs text-slate-500 pl-[22px]">
                          <Clock className="w-3 h-3" />
                          {trip.departureAt ? format(new Date(trip.departureAt), 'HH:mm') : '—'}
                          <span>·</span>
                          <Car className="w-3 h-3" />
                          {trip.vehicle.plate || trip.vehicle.vehicleNumber || '—'}
                          <span>·</span>
                          {trip.driver.name || 'Driver'}
                        </div>
                        <div className="mt-1.5 flex items-center gap-3 text-[11px] text-slate-500">
                          <span className="inline-flex items-center gap-1"><MapPin className="w-3 h-3 text-emerald-500" />{passengers.filter((p) => p.pickup).length} pickup</span>
                          <span className="inline-flex items-center gap-1"><Navigation className="w-3 h-3 text-purple-500" />{passengers.filter((p) => p.drop).length} drop</span>
                          <span className="inline-flex items-center gap-1"><Crosshair className="w-3 h-3" />{lastSeen(trip.location?.updatedAt ?? null)}</span>
                        </div>
                      </div>

                      {/* Expanded — per-passenger routes */}
                      {expanded && (
                        <div className="border-t border-slate-200 p-2 space-y-1">
                          <button
                            type="button"
                            onClick={() => { setSelectedTripId(trip.tripId); setFocusBookingId(null); }}
                            className={`w-full rounded-md px-2.5 py-1.5 text-left text-xs font-medium transition-colors ${selected && !focusBookingId ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
                          >
                            Full ride route
                          </button>
                          {passengers.length === 0 ? (
                            <p className="px-2.5 py-1.5 text-xs text-slate-400">No passenger stops on this ride.</p>
                          ) : passengers.map((p) => {
                            const active = selected && focusBookingId === p.bookingId;
                            return (
                              <button
                                key={p.bookingId}
                                type="button"
                                onClick={() => selectPassenger(trip.tripId, p.bookingId)}
                                className={`w-full rounded-md px-2.5 py-2 text-left transition-colors ${active ? 'bg-blue-50 ring-1 ring-blue-300' : 'hover:bg-slate-50'}`}
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-sm font-medium text-slate-900 truncate">{p.name}</span>
                                  <Navigation className={`h-3.5 w-3.5 shrink-0 ${active ? 'text-blue-600' : 'text-slate-300'}`} />
                                </div>
                                <p className="mt-0.5 flex items-start gap-1 text-xs text-slate-600">
                                  <MapPin className="mt-0.5 h-3 w-3 shrink-0 text-emerald-500" />
                                  <span className="truncate">{p.pickup?.label || 'Pickup point'}{p.pickup?.lat == null ? ' (no map)' : ''}</span>
                                </p>
                                <p className="mt-0.5 flex items-start gap-1 text-xs text-slate-600">
                                  <Navigation className="mt-0.5 h-3 w-3 shrink-0 text-purple-500" />
                                  <span className="truncate">{p.drop?.label || 'Drop point'}{p.drop?.lat == null ? ' (no map)' : ''}</span>
                                </p>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Map + stops */}
        <div className="lg:col-span-2 space-y-6">
          {/* Bird's-eye pickup & drop maps (zoomed, interactive pins) */}
          {selectedTrip && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <StopsMap title="Pickup points" accent="pickup" points={pickupPoints} driver={driverLoc} />
              <StopsMap title="Drop points" accent="drop" points={dropPoints} />
            </div>
          )}

          {/* Full planned route */}
          <Card className="border-0 shadow-lg">
            <CardContent className="p-3">
              <div className="h-[420px]"><ScheduleMap trip={selectedTrip} focusBookingId={focusBookingId} /></div>
            </CardContent>
          </Card>

          {selectedTrip && (
            <Card className="overflow-hidden border-0 shadow-lg">
              <CardHeader className="border-b border-slate-100 pb-4">
                <CardTitle className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <span className="text-xl font-bold tracking-tight text-slate-950">Pickup &amp; drop plan</span>
                  {selectedTrip.driver.phone && (
                    <a href={`tel:${selectedTrip.driver.phone}`} className="inline-flex w-fit items-center gap-1.5 rounded-md border border-blue-100 bg-blue-50 px-3 py-1.5 text-sm font-semibold text-blue-700 hover:bg-blue-100">
                      <Phone className="w-4 h-4" /> Call driver
                    </a>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-5 p-4 sm:p-5">
                {/* Driver last-known location */}
                <div className="rounded-lg border border-slate-100 bg-slate-50 p-4 text-sm">
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-white text-slate-500 shadow-sm">
                      <Crosshair className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Driver last known location</p>
                  {selectedTrip.location ? (
                        <p className="mt-1 text-slate-700">
                      {selectedTrip.location.lat.toFixed(5)}, {selectedTrip.location.lng.toFixed(5)}
                      <span className="ml-2 text-slate-400">· {lastSeen(selectedTrip.location.updatedAt)}</span>
                    </p>
                  ) : (
                        <p className="mt-1 text-slate-500">Not sharing yet. The route is planned from the first pickup.</p>
                  )}
                    </div>
                  </div>
                </div>

                {/* Stop sequence — all pickups first, then all drops */}
                <div className="space-y-0">
                  <Row color="bg-slate-400" title="Origin" subtitle={selectedTrip.departurePoint || selectedTrip.route.from} done />
                  {orderedStops.map((stop, i) => (
                    <Row
                      key={`${stop.bookingId}-${stop.kind}-${i}`}
                      color={stop.kind === 'PICKUP' ? 'bg-emerald-500' : 'bg-purple-600'}
                      title={`${stop.kind === 'PICKUP' ? 'Pickup' : 'Drop'} · ${stop.passengerName}`}
                      subtitle={`${stop.label || (stop.kind === 'PICKUP' ? 'Pickup point' : 'Drop point')}${stop.lat == null ? ' (no coordinates)' : ''}`}
                      phone={stop.passengerPhone}
                      badge={stop.status === 'DONE' ? 'Done' : stop.status === 'ARRIVED' ? 'Arrived' : undefined}
                      done={stop.status === 'DONE'}
                      highlight={!!focusBookingId && stop.bookingId === focusBookingId}
                    />
                  ))}
                  <Row color="bg-green-600" title="Destination" subtitle={selectedTrip.route.to} last />
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  return (
    <Card className="border-0 shadow-sm">
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-600">{label}</p>
            <p className="text-2xl font-bold text-gray-900">{value}</p>
          </div>
          {icon}
        </div>
      </CardContent>
    </Card>
  );
}

function Row({ color, title, subtitle, phone, badge, done, last, highlight }: {
  color: string; title: string; subtitle: string; phone?: string; badge?: string; done?: boolean; last?: boolean; highlight?: boolean;
}) {
  return (
    <div className="relative grid grid-cols-[2rem_1fr] gap-3 pb-3 last:pb-0">
      {!last && <span className="absolute left-4 top-8 bottom-[-0.25rem] w-px bg-slate-200" />}
      <div className="relative z-10 flex justify-center pt-1.5">
        <span className={`h-3.5 w-3.5 rounded-full border-2 border-white shadow-sm ${color} ${done ? 'opacity-60' : ''} ${highlight ? 'ring-4 ring-blue-100' : ''}`} />
      </div>
      <div className={`min-w-0 rounded-lg border px-3.5 py-3 transition-colors ${highlight ? 'border-blue-200 bg-blue-50 shadow-sm' : 'border-transparent bg-transparent'}`}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className={`text-sm font-semibold leading-5 ${done ? 'text-slate-500 line-through' : 'text-slate-950'}`}>{title}</p>
            <p className="mt-0.5 break-words text-sm leading-5 text-slate-500">{subtitle}</p>
            {phone && <a href={`tel:${phone}`} className="mt-1 inline-flex text-sm font-medium text-blue-600 hover:underline">{phone}</a>}
          </div>
          {badge && <Badge variant="outline" className="shrink-0 text-[10px]">{badge}</Badge>}
        </div>
      </div>
    </div>
  );
}
