"use client";

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Car, Users, Navigation, Phone, CheckCircle, MapPin, Loader2, RefreshCw, Building2, PackageCheck, Maximize2,
  Crosshair, Clock,
} from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import { trackingApi, orgApi, type TrackedTrip, type Organization } from '@/lib/api';
import { useFleetTrackingSocket, type LiveLocation } from '@/lib/useFleetTrackingSocket';
import type { StopPoint } from '@/components/StopsMap';

const FleetMap = dynamic(() => import('@/components/FleetMap'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-slate-100 rounded-lg">
      <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
    </div>
  ),
});

const StopsMap = dynamic(() => import('@/components/StopsMap'), {
  ssr: false,
  loading: () => <div className="h-[464px] rounded-lg border border-slate-200 bg-slate-100 animate-pulse" />,
});

function stopPointsOf(trip: TrackedTrip, kind: 'PICKUP' | 'DROPOFF'): StopPoint[] {
  return trip.stops
    .filter((s) => s.kind === kind && s.lat != null && s.lng != null)
    .map((s) => ({ id: `${s.bookingId}-${kind}`, lat: s.lat as number, lng: s.lng as number, name: s.passengerName, phone: s.passengerPhone, label: s.label ?? '' }));
}

const POLL_MS = 20_000;

function phaseLabel(phase: TrackedTrip['phase']) {
  return phase === 'DROPOFF' ? 'Dropping off' : 'Picking up';
}

function lastSeen(updatedAt: string | null): string {
  if (!updatedAt) return 'No signal';
  const secs = Math.round((Date.now() - new Date(updatedAt).getTime()) / 1000);
  if (secs < 5) return 'Live';
  if (secs < 60) return `${secs}s ago`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  return `${Math.floor(secs / 3600)}h ago`;
}

export default function TrackingPage() {
  const router = useRouter();
  const { user } = useAuth();
  const isOrgAdmin = user?.role === 'ORG_ADMIN';
  const orgScopeId = user?.defaultOrganizationId ?? user?.memberships?.[0]?.organizationId ?? '';

  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [orgFilter, setOrgFilter] = useState<string>('all'); // super admin only
  const [vehicleFilter, setVehicleFilter] = useState<string>('all');
  const [phaseFilter, setPhaseFilter] = useState<string>('all');

  const [trips, setTrips] = useState<TrackedTrip[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedTripId, setSelectedTripId] = useState<string | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<string>('');

  // Live positions for every driver currently on a trip.
  const driverIds = useMemo(() => trips.map((t) => t.driver.id), [trips]);
  const { locations, wsStatus } = useFleetTrackingSocket(driverIds);

  // Super admin: organization options for the filter.
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
        ? await trackingApi.orgActive(orgScopeId)
        : await trackingApi.adminActive({ organizationId: orgFilter === 'all' ? undefined : orgFilter });
      setTrips(res.data.trips);
      setLastRefreshed(new Date().toLocaleTimeString());
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load live tracking');
    } finally {
      setLoading(false);
    }
  }, [isOrgAdmin, orgScopeId, orgFilter]);

  useEffect(() => {
    setLoading(true);
    void fetchTrips();
    const id = window.setInterval(() => void fetchTrips(), POLL_MS);
    return () => window.clearInterval(id);
  }, [fetchTrips]);

  // Vehicle filter options derived from the active trips.
  const vehicleOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const t of trips) {
      if (t.vehicle.id) seen.set(t.vehicle.id, t.vehicle.plate || t.vehicle.vehicleNumber || t.vehicle.id);
    }
    return [...seen.entries()].map(([id, label]) => ({ id, label }));
  }, [trips]);

  const visibleTrips = useMemo(() => trips.filter((t) => {
    if (vehicleFilter !== 'all' && t.vehicle.id !== vehicleFilter) return false;
    if (phaseFilter !== 'all' && t.phase !== phaseFilter) return false;
    return true;
  }), [trips, vehicleFilter, phaseFilter]);

  const selectedTrip = useMemo(
    () => visibleTrips.find((t) => t.tripId === selectedTripId) ?? null,
    [visibleTrips, selectedTripId],
  );

  // Aggregate stats.
  const stats = useMemo(() => {
    const totalPassengers = visibleTrips.reduce((s, t) => s + t.progress.totalPassengers, 0);
    const pickedUp = visibleTrips.reduce((s, t) => s + t.progress.pickedUp, 0);
    const droppedOff = visibleTrips.reduce((s, t) => s + t.progress.droppedOff, 0);
    const dropping = visibleTrips.filter((t) => t.phase === 'DROPOFF').length;
    return { active: visibleTrips.length, dropping, picking: visibleTrips.length - dropping, totalPassengers, pickedUp, droppedOff };
  }, [visibleTrips]);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Live Vehicle Tracking</h1>
          <p className="text-sm text-gray-600">
            {isOrgAdmin
              ? 'Real-time positions of your fleet currently on trips'
              : 'Real-time positions across all organizations'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Badge variant="outline" className={wsStatus === 'connected' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-amber-50 text-amber-700 border-amber-200'}>
            <div className={`w-2 h-2 rounded-full mr-2 ${wsStatus === 'connected' ? 'bg-green-500 animate-pulse' : 'bg-amber-500'}`} />
            {wsStatus === 'connected' ? 'Live' : 'Reconnecting…'}
          </Badge>

          {!isOrgAdmin && (
            <Select value={orgFilter} onValueChange={(v) => { setOrgFilter(v); setSelectedTripId(null); }}>
              <SelectTrigger className="w-52">
                <Building2 className="w-4 h-4 mr-2" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Organizations</SelectItem>
                {organizations.map((o) => (
                  <SelectItem key={o.id} value={o.id}>{o.tradeName || o.legalName}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <Select value={vehicleFilter} onValueChange={setVehicleFilter}>
            <SelectTrigger className="w-44">
              <Car className="w-4 h-4 mr-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Vehicles</SelectItem>
              {vehicleOptions.map((v) => (
                <SelectItem key={v.id} value={v.id}>{v.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={phaseFilter} onValueChange={setPhaseFilter}>
            <SelectTrigger className="w-36">
              <Navigation className="w-4 h-4 mr-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Phases</SelectItem>
              <SelectItem value="PICKUP">Picking up</SelectItem>
              <SelectItem value="DROPOFF">Dropping off</SelectItem>
            </SelectContent>
          </Select>

          <Button variant="outline" size="sm" onClick={() => void fetchTrips()}>
            <RefreshCw className="w-4 h-4 mr-2" /> Refresh
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard label="Active Trips" value={stats.active} icon={<Car className="w-6 h-6 text-blue-600" />} />
        <StatCard label="Picking Up" value={stats.picking} icon={<Navigation className="w-6 h-6 text-blue-600" />} />
        <StatCard label="Dropping Off" value={stats.dropping} icon={<PackageCheck className="w-6 h-6 text-green-600" />} />
        <StatCard label="Passengers Onboard" value={stats.pickedUp - stats.droppedOff} icon={<Users className="w-6 h-6 text-amber-600" />} />
        <StatCard label="Completed Drops" value={stats.droppedOff} icon={<CheckCircle className="w-6 h-6 text-green-600" />} />
      </div>

      {/* Bird's-eye pickup & drop maps for the selected vehicle */}
      {selectedTrip && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <StopsMap
            title="Pickup points"
            accent="pickup"
            points={stopPointsOf(selectedTrip, 'PICKUP')}
            driver={
              locations[selectedTrip.driver.id]
                ? { lat: locations[selectedTrip.driver.id].lat, lng: locations[selectedTrip.driver.id].lng }
                : selectedTrip.location
                  ? { lat: selectedTrip.location.lat, lng: selectedTrip.location.lng }
                  : null
            }
          />
          <StopsMap title="Drop points" accent="drop" points={stopPointsOf(selectedTrip, 'DROPOFF')} />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Map */}
        <Card className="lg:col-span-2 border-0 shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Live Map</span>
              {lastRefreshed && <span className="text-xs font-normal text-gray-400">Updated {lastRefreshed}</span>}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[460px]">
              {loading ? (
                <div className="flex h-full items-center justify-center bg-slate-100 rounded-lg">
                  <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
                </div>
              ) : (
                <FleetMap
                  trips={visibleTrips}
                  liveLocations={locations}
                  selectedTripId={selectedTripId}
                  onSelectTrip={setSelectedTripId}
                />
              )}
            </div>
          </CardContent>
        </Card>

        {/* Selected trip detail OR hint */}
        <Card className="border-0 shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>{selectedTrip ? 'Trip Detail' : 'Pickup & Drop Timeline'}</span>
              {selectedTrip && (
                <Button size="sm" variant="outline" onClick={() => router.push(`/dashboard/tracking/detail?tripId=${selectedTrip.tripId}`)}>
                  <Maximize2 className="w-4 h-4 mr-2" /> Full map
                </Button>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {selectedTrip ? (
              <TripTimeline
                trip={selectedTrip}
                liveLocation={locations[selectedTrip.driver.id] ?? null}
              />
            ) : (
              <p className="text-sm text-gray-500">Select a vehicle on the map or list to see its full pickup-to-drop journey and live position.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Vehicle list */}
      <Card className="border-0 shadow-lg">
        <CardHeader>
          <CardTitle>On-trip Vehicles ({visibleTrips.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {visibleTrips.length === 0 ? (
            <p className="text-sm text-gray-500 py-6 text-center">
              {loading ? 'Loading…' : 'No vehicles are currently on a trip.'}
            </p>
          ) : (
            <div className="space-y-3">
              {visibleTrips.map((trip) => {
                const selected = trip.tripId === selectedTripId;
                const live = locations[trip.driver.id]?.updatedAt ?? trip.location?.updatedAt ?? null;
                return (
                  <button
                    key={trip.tripId}
                    onClick={() => setSelectedTripId(trip.tripId)}
                    className={`w-full text-left flex items-center justify-between p-4 rounded-lg border transition-colors ${selected ? 'border-blue-400 bg-blue-50' : 'border-transparent bg-gray-50 hover:bg-gray-100'}`}
                  >
                    <div className="flex items-center gap-4 min-w-0">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center ${trip.phase === 'DROPOFF' ? 'bg-green-600' : 'bg-blue-600'}`}>
                        <Car className="w-5 h-5 text-white" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-medium text-gray-900 truncate">{trip.driver.name || 'Driver'}</h3>
                        <p className="text-sm text-gray-600 truncate">
                          {trip.vehicle.plate || trip.vehicle.vehicleNumber || '—'} · {trip.route.from} → {trip.route.to}
                          {!isOrgAdmin && trip.organization ? ` · ${trip.organization.name}` : ''}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <div className="text-right">
                        <Badge className={trip.phase === 'DROPOFF' ? 'bg-green-100 text-green-800 border-green-300' : 'bg-blue-100 text-blue-800 border-blue-300'}>
                          {phaseLabel(trip.phase)}
                        </Badge>
                        <p className="text-xs text-gray-500 mt-1">
                          {trip.progress.pickedUp}/{trip.progress.totalPassengers} picked · {trip.progress.droppedOff} dropped · {lastSeen(live)}
                        </p>
                      </div>
                      {trip.driver.phone && (
                        <a
                          href={`tel:${trip.driver.phone}`}
                          onClick={(e) => e.stopPropagation()}
                          className="flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 bg-white hover:bg-gray-50"
                        >
                          <Phone className="w-4 h-4 text-gray-600" />
                        </a>
                      )}
                      <span
                        role="button"
                        tabIndex={0}
                        onClick={(e) => { e.stopPropagation(); router.push(`/dashboard/tracking/detail?tripId=${trip.tripId}`); }}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); router.push(`/dashboard/tracking/detail?tripId=${trip.tripId}`); } }}
                        className="flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 bg-white hover:bg-gray-50 cursor-pointer"
                        title="Open full map"
                      >
                        <Maximize2 className="w-4 h-4 text-gray-600" />
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
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

const AVG_SPEED_KMH = 40;

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const toRad = (v: number) => (v * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

function etaLabel(km: number) {
  const m = Math.round((km / AVG_SPEED_KMH) * 60);
  return m < 60 ? `~${m} min` : `~${Math.floor(m / 60)}h ${m % 60}m`;
}

function TripTimeline({ trip, liveLocation }: { trip: TrackedTrip; liveLocation: LiveLocation | null }) {
  const currentPos = liveLocation ?? (trip.location ? { lat: trip.location.lat, lng: trip.location.lng } : null);
  const signalTime = liveLocation?.updatedAt ?? trip.location?.updatedAt ?? null;

  const nextStop = useMemo(
    () => trip.stops.find((s) => s.status !== 'DONE' && s.lat != null && s.lng != null) ?? null,
    [trip.stops],
  );

  const etaToNext = useMemo(() => {
    if (!currentPos || !nextStop || nextStop.lat == null || nextStop.lng == null) return null;
    const km = haversineKm(currentPos, { lat: nextStop.lat, lng: nextStop.lng });
    return { label: etaLabel(km), km: km.toFixed(1) };
  }, [currentPos, nextStop]);

  return (
    <div className="space-y-4">
      {/* Driver + signal row */}
      <div className="rounded-lg border border-slate-100 bg-slate-50 p-3.5 text-sm">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-white text-slate-500 shadow-sm">
            <Crosshair className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Driver position</p>
            {currentPos ? (
              <p className="mt-0.5 text-slate-700">
                {currentPos.lat.toFixed(5)}, {currentPos.lng.toFixed(5)}
                <span className="ml-2 text-slate-400">· {lastSeen(signalTime)}</span>
              </p>
            ) : (
              <p className="mt-0.5 text-slate-500">No signal yet. Route planned from first stop.</p>
            )}
            {etaToNext && (
              <p className="mt-1 flex items-center gap-1 font-semibold text-blue-700">
                <Clock className="h-3.5 w-3.5" />
                ETA {etaToNext.label} · {etaToNext.km} km to next{' '}
                {nextStop?.kind === 'PICKUP' ? 'pickup' : 'drop'}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Phase + progress */}
      <div className="flex items-center gap-2 flex-wrap">
        <Badge className={trip.phase === 'DROPOFF' ? 'bg-green-100 text-green-800 border-green-300' : 'bg-blue-100 text-blue-800 border-blue-300'}>
          {phaseLabel(trip.phase)}
        </Badge>
        <span className="text-xs text-slate-500">
          {trip.progress.pickedUp}/{trip.progress.totalPassengers} picked up · {trip.progress.droppedOff} dropped
        </span>
        {trip.driver.phone && (
          <a
            href={`tel:${trip.driver.phone}`}
            className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-blue-100 bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-100"
          >
            <Phone className="h-3.5 w-3.5" /> Call driver
          </a>
        )}
      </div>

      {/* Stop sequence */}
      <div className="space-y-0">
        <Row color="bg-slate-400" title="Trip started" subtitle={trip.departurePoint || trip.route.from} done />
        {trip.stops.map((stop, i) => {
          const isNext = nextStop != null && stop.bookingId === nextStop.bookingId && stop.kind === nextStop.kind && stop.status !== 'DONE';
          return (
            <Row
              key={`${stop.bookingId}-${stop.kind}-${i}`}
              color={stop.kind === 'PICKUP' ? 'bg-amber-500' : 'bg-purple-600'}
              title={`${stop.kind === 'PICKUP' ? 'Pickup' : 'Drop'} · ${stop.passengerName}`}
              subtitle={stop.label || (stop.kind === 'PICKUP' ? 'Pickup point' : 'Drop point')}
              phone={stop.passengerPhone}
              badge={stop.status === 'DONE' ? 'Done' : stop.status === 'ARRIVED' ? 'Arrived' : isNext && etaToNext ? etaToNext.label : undefined}
              done={stop.status === 'DONE'}
              highlight={isNext}
            />
          );
        })}
        <Row color="bg-green-600" title="Destination" subtitle={trip.route.to} last />
      </div>
    </div>
  );
}

function Row({ color, title, subtitle, phone, badge, done, last, highlight }: {
  color: string; title: string; subtitle: string; phone?: string;
  badge?: string; done?: boolean; last?: boolean; highlight?: boolean;
}) {
  return (
    <div className="relative grid grid-cols-[2rem_1fr] gap-2 pb-2 last:pb-0">
      {!last && <span className="absolute left-4 top-7 bottom-0 w-px bg-slate-200" />}
      <div className="relative z-10 flex justify-center pt-1.5">
        <span className={`h-3.5 w-3.5 rounded-full border-2 border-white shadow-sm ${color} ${done ? 'opacity-60' : ''} ${highlight ? 'ring-4 ring-blue-100' : ''}`} />
      </div>
      <div className={`min-w-0 rounded-lg border px-3 py-2.5 transition-colors ${highlight ? 'border-blue-200 bg-blue-50 shadow-sm' : 'border-transparent bg-transparent'}`}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className={`text-sm font-semibold leading-5 ${done ? 'text-slate-400 line-through' : 'text-slate-950'}`}>{title}</p>
            <p className="mt-0.5 break-words text-xs leading-4 text-slate-500">{subtitle}</p>
            {phone && !done && (
              <a href={`tel:${phone}`} className="mt-1 inline-flex text-xs font-medium text-blue-600 hover:underline">{phone}</a>
            )}
          </div>
          {badge && <Badge variant="outline" className="shrink-0 text-[10px]">{badge}</Badge>}
        </div>
      </div>
    </div>
  );
}
