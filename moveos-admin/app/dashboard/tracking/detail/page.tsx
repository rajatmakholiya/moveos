"use client";

import { Suspense, useState, useEffect, useMemo, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Phone, Loader2, Navigation, Users, MapPin, Clock } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import { trackingApi, type TrackedTrip, type TrackingStop } from '@/lib/api';
import { useFleetTrackingSocket } from '@/lib/useFleetTrackingSocket';

const FleetMap = dynamic(() => import('@/components/FleetMap'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-slate-100 rounded-lg">
      <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
    </div>
  ),
});

const POLL_MS = 15_000;
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

export default function TripTrackingDetailPage() {
  return (
    <Suspense fallback={<div className="flex h-[70vh] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-slate-400" /></div>}>
      <TripDetail />
    </Suspense>
  );
}

function TripDetail() {
  const searchParams = useSearchParams();
  const tripId = searchParams.get('tripId') ?? '';
  const router = useRouter();
  const { user } = useAuth();
  const isOrgAdmin = user?.role === 'ORG_ADMIN';
  const orgScopeId = user?.defaultOrganizationId ?? user?.memberships?.[0]?.organizationId ?? '';

  const [trip, setTrip] = useState<TrackedTrip | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const driverIds = useMemo(() => (trip ? [trip.driver.id] : []), [trip]);
  const { locations, wsStatus } = useFleetTrackingSocket(driverIds);

  const fetchTrip = useCallback(async () => {
    if (!tripId) { setError('No trip specified.'); setLoading(false); return; }
    try {
      setError(null);
      const res = isOrgAdmin
        ? await trackingApi.orgTripDetail(orgScopeId, tripId)
        : await trackingApi.adminTripDetail(tripId);
      setTrip(res.data.trip);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load trip');
    } finally {
      setLoading(false);
    }
  }, [isOrgAdmin, orgScopeId, tripId]);

  useEffect(() => {
    setLoading(true);
    void fetchTrip();
    const id = window.setInterval(() => void fetchTrip(), POLL_MS);
    return () => window.clearInterval(id);
  }, [fetchTrip]);

  const livePos = trip ? (locations[trip.driver.id] ?? null) : null;
  const currentPos = livePos ?? (trip?.location ? { lat: trip.location.lat, lng: trip.location.lng } : null);

  const nextStop = useMemo<TrackingStop | null>(() => {
    if (!trip) return null;
    return trip.stops.find((s) => s.status !== 'DONE' && s.lat != null && s.lng != null) ?? null;
  }, [trip]);

  const etaToNext = useMemo(() => {
    if (!currentPos || !nextStop || nextStop.lat == null || nextStop.lng == null) return null;
    const km = haversineKm(currentPos, { lat: nextStop.lat, lng: nextStop.lng });
    return { km, label: etaLabel(km) };
  }, [currentPos, nextStop]);

  if (loading && !trip) {
    return <div className="flex h-[70vh] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-slate-400" /></div>;
  }

  if (error || !trip) {
    return (
      <div className="p-6 space-y-4">
        <Button variant="outline" size="sm" onClick={() => router.push('/dashboard/tracking')}>
          <ArrowLeft className="w-4 h-4 mr-2" /> Back to fleet
        </Button>
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error ?? 'Trip is no longer active.'}
        </div>
      </div>
    );
  }

  const onboard = trip.progress.pickedUp - trip.progress.droppedOff;

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-3">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={() => router.push('/dashboard/tracking')}>
            <ArrowLeft className="w-4 h-4 mr-2" /> Fleet
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{trip.driver.name || 'Driver'}</h1>
            <p className="text-sm text-gray-600">
              {trip.vehicle.plate || trip.vehicle.vehicleNumber || '—'} · {trip.route.from} → {trip.route.to}
              {trip.organization ? ` · ${trip.organization.name}` : ''}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="outline" className={wsStatus === 'connected' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-amber-50 text-amber-700 border-amber-200'}>
            <div className={`w-2 h-2 rounded-full mr-2 ${wsStatus === 'connected' ? 'bg-green-500 animate-pulse' : 'bg-amber-500'}`} />
            {wsStatus === 'connected' ? 'Live' : 'Reconnecting…'}
          </Badge>
          <Badge className={trip.phase === 'DROPOFF' ? 'bg-green-100 text-green-800 border-green-300' : 'bg-blue-100 text-blue-800 border-blue-300'}>
            {trip.phase === 'DROPOFF' ? 'Dropping off' : 'Picking up'}
          </Badge>
          {trip.driver.phone && (
            <a href={`tel:${trip.driver.phone}`} className="inline-flex items-center gap-2 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm hover:bg-gray-50">
              <Phone className="w-4 h-4 text-gray-600" /> Call driver
            </a>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat label="Passengers onboard" value={`${onboard}`} icon={<Users className="w-5 h-5 text-amber-600" />} />
        <Stat label="Picked up" value={`${trip.progress.pickedUp}/${trip.progress.totalPassengers}`} icon={<MapPin className="w-5 h-5 text-blue-600" />} />
        <Stat label="Dropped off" value={`${trip.progress.droppedOff}`} icon={<Navigation className="w-5 h-5 text-green-600" />} />
        <Stat
          label={nextStop ? `Next: ${nextStop.kind === 'PICKUP' ? 'pickup' : 'drop'}` : 'Next stop'}
          value={etaToNext ? etaToNext.label : '—'}
          icon={<Clock className="w-5 h-5 text-purple-600" />}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 border-0 shadow-lg">
          <CardContent className="p-3">
            <div className="h-[70vh]">
              <FleetMap trips={[trip]} liveLocations={locations} selectedTripId={trip.tripId} onSelectTrip={() => { /* fixed */ }} />
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-lg">
          <CardHeader>
            <CardTitle>Pickup &amp; Drop journey</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="relative pl-5">
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
                    highlight={isNext}
                    done={stop.status === 'DONE'}
                  />
                );
              })}
              <Row color="bg-green-600" title="Destination" subtitle={trip.route.to} last />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Stat({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <Card className="border-0 shadow-sm">
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="min-w-0">
            <p className="text-sm text-gray-600 truncate">{label}</p>
            <p className="text-xl font-bold text-gray-900">{value}</p>
          </div>
          {icon}
        </div>
      </CardContent>
    </Card>
  );
}

function Row({ color, title, subtitle, phone, badge, done, last, highlight }: {
  color: string; title: string; subtitle: string; phone?: string; badge?: string;
  done?: boolean; last?: boolean; highlight?: boolean;
}) {
  return (
    <div className={`relative pb-4 ${highlight ? 'rounded-lg bg-blue-50/60 -ml-3 pl-3 pr-2 py-2' : ''}`}>
      {!last && <span className="absolute left-[-0.5px] top-3 -ml-px h-full w-0.5 bg-slate-200" />}
      <span className={`absolute left-[-9px] top-1 h-3.5 w-3.5 rounded-full border-2 border-white ${color} ${done ? 'opacity-60' : ''} ${highlight ? 'ring-2 ring-blue-300' : ''}`} />
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className={`text-sm font-medium ${done ? 'text-gray-500 line-through' : 'text-gray-900'}`}>{title}</p>
          <p className="text-xs text-gray-500 truncate">{subtitle}</p>
          {phone && !done && <a href={`tel:${phone}`} className="text-xs text-blue-600 hover:underline">{phone}</a>}
        </div>
        {badge && <Badge variant="outline" className="text-[10px] shrink-0">{badge}</Badge>}
      </div>
    </div>
  );
}
