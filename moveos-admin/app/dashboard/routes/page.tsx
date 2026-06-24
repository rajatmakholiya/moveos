'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Calculator, Edit, Loader2, MapPinned, Plus, Power, RefreshCcw, Route as RouteIcon, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { type AdminRoute, type GeoPlace, locationApi, routeApi, type AdminRoutePayload } from '@/lib/api';

type FormState = {
  fromCity: string;
  toCity: string;
  fromPlace: GeoPlace | null;
  toPlace: GeoPlace | null;
  routeName: string;
  distanceKm: string;
  distanceSource: 'manual' | 'location_service' | 'coordinate_estimate';
  baseFareRupees: string;
  estimatedDurationMinutes: string;
};

const emptyForm: FormState = {
  fromCity: '',
  toCity: '',
  fromPlace: null,
  toPlace: null,
  routeName: '',
  distanceKm: '',
  distanceSource: 'manual',
  baseFareRupees: '',
  estimatedDurationMinutes: '',
};

export default function RouteManagementPage() {
  const [routes, setRoutes] = useState<AdminRoute[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRoute, setEditingRoute] = useState<AdminRoute | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [distanceLoading, setDistanceLoading] = useState(false);

  const loadRoutes = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await routeApi.list();
      setRoutes(res.data.routes);
    } catch (caught) {
      const message = caught && typeof caught === 'object' && 'message' in caught ? String(caught.message) : 'Could not load routes';
      setError(message);
      setRoutes([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadRoutes();
  }, []);

  const filteredRoutes = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return routes;
    return routes.filter((route) =>
      [route.fromCity, route.toCity, route.routeName, route.status].some((value) => value.toLowerCase().includes(normalized)),
    );
  }, [query, routes]);

  const openCreate = () => {
    setEditingRoute(null);
    setForm(emptyForm);
    setDistanceLoading(false);
    setError('');
    setDialogOpen(true);
  };

  const openEdit = (route: AdminRoute) => {
    setEditingRoute(route);
    setForm({
      fromCity: route.fromCity,
      toCity: route.toCity,
      fromPlace: readRoutePlace(route, 'originPlace'),
      toPlace: readRoutePlace(route, 'destinationPlace'),
      routeName: route.routeName,
      distanceKm: String(route.distanceKm),
      distanceSource: readDistanceSource(route),
      baseFareRupees: String(route.baseFarePaise / 100),
      estimatedDurationMinutes: String(route.estimatedDurationMinutes),
    });
    setDistanceLoading(false);
    setError('');
    setDialogOpen(true);
  };

  const updateEndpoint = (key: 'from' | 'to', place: GeoPlace | null, typedValue?: string) => {
    setForm((current) => {
      const fromCity = key === 'from' ? typedValue ?? place?.city ?? place?.label ?? '' : current.fromCity;
      const toCity = key === 'to' ? typedValue ?? place?.city ?? place?.label ?? '' : current.toCity;
      const routeName = !editingRoute && fromCity.trim() && toCity.trim()
        ? `${fromCity.trim()} to ${toCity.trim()}`
        : current.routeName;

      return {
        ...current,
        fromCity,
        toCity,
        fromPlace: key === 'from' ? place : current.fromPlace,
        toPlace: key === 'to' ? place : current.toPlace,
        routeName,
        distanceKm: '',
        distanceSource: 'manual',
      };
    });
  };

  const calculateDistance = async () => {
    if (!form.fromPlace || !form.toPlace) {
      setError('Select both route endpoints from the location suggestions before calculating distance.');
      return;
    }
    setDistanceLoading(true);
    setError('');
    try {
      const [fromPlace, toPlace] = await Promise.all([
        locationApi.resolvePlace(form.fromPlace),
        locationApi.resolvePlace(form.toPlace),
      ]);
      if (!hasCoordinates(fromPlace) || !hasCoordinates(toPlace)) {
        throw new Error('Selected locations do not include coordinates.');
      }
      const distanceKm = estimateDistanceKm(fromPlace, toPlace);
      setForm((current) => ({
        ...current,
        fromPlace,
        toPlace,
        distanceKm: String(distanceKm),
        distanceSource: 'coordinate_estimate',
        estimatedDurationMinutes: current.estimatedDurationMinutes || String(estimateDurationMinutes(distanceKm)),
      }));
    } catch {
      if (hasCoordinates(form.fromPlace) && hasCoordinates(form.toPlace)) {
        const distanceKm = estimateDistanceKm(form.fromPlace, form.toPlace);
        setForm((current) => ({
          ...current,
          distanceKm: String(distanceKm),
          distanceSource: 'coordinate_estimate',
          estimatedDurationMinutes: current.estimatedDurationMinutes || String(estimateDurationMinutes(distanceKm)),
        }));
        setError('Distance was estimated from selected coordinates. Review before saving.');
      } else {
        setError('Could not resolve coordinates for the selected locations. Select a more specific suggestion or enter distance manually.');
      }
    } finally {
      setDistanceLoading(false);
    }
  };

  useEffect(() => {
    if (!dialogOpen || !form.fromPlace || !form.toPlace || form.distanceKm) return;
    void calculateDistance();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dialogOpen, form.fromPlace, form.toPlace]);

  const buildPayload = (): AdminRoutePayload | null => {
    const distanceKm = Number(form.distanceKm);
    const baseFarePaise = Math.round(Number(form.baseFareRupees) * 100);
    const estimatedDurationMinutes = Number(form.estimatedDurationMinutes);

    if (!form.fromCity.trim() || !form.toCity.trim() || !form.routeName.trim()) {
      setError('From city, to city, and route name are required.');
      return null;
    }
    if (form.fromCity.trim().toLowerCase() === form.toCity.trim().toLowerCase()) {
      setError('From city and to city must be different.');
      return null;
    }
    if (!Number.isInteger(distanceKm) || distanceKm <= 0) {
      setError('Distance must be a whole number greater than zero.');
      return null;
    }
    if (!Number.isInteger(baseFarePaise) || baseFarePaise < 0) {
      setError('Base fare must be zero or greater.');
      return null;
    }
    if (!Number.isInteger(estimatedDurationMinutes) || estimatedDurationMinutes <= 0) {
      setError('Estimated duration must be a whole number greater than zero.');
      return null;
    }

    return {
      fromCity: form.fromCity.trim(),
      toCity: form.toCity.trim(),
      routeName: form.routeName.trim(),
      distanceKm,
      baseFarePaise,
      estimatedDurationMinutes,
      metadataJson: {
        ...(editingRoute?.metadataJson ?? {}),
        originPlace: form.fromPlace,
        destinationPlace: form.toPlace,
        distanceSource: form.distanceSource,
      },
    };
  };

  const saveRoute = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    const payload = buildPayload();
    if (!payload) return;

    setSaving(true);
    try {
      if (editingRoute) {
        await routeApi.update(editingRoute.id, payload);
      } else {
        await routeApi.create(payload);
      }
      setDialogOpen(false);
      await loadRoutes();
    } catch (caught) {
      const message = caught && typeof caught === 'object' && 'message' in caught ? String(caught.message) : 'Could not save route';
      setError(message);
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async (route: AdminRoute) => {
    setError('');
    try {
      await routeApi.updateStatus(route.id, route.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE');
      await loadRoutes();
    } catch (caught) {
      const message = caught && typeof caught === 'object' && 'message' in caught ? String(caught.message) : 'Could not update route status';
      setError(message);
    }
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Route Management</h1>
          <p className="text-sm text-slate-600">Create and maintain route master data used by trip scheduling and booking.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => void loadRoutes()} disabled={loading}>
            <RefreshCcw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
          <Button onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" />
            New Route
          </Button>
        </div>
      </div>

      {error ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-3">
        <Metric title="Total routes" value={routes.length} />
        <Metric title="Active routes" value={routes.filter((route) => route.status === 'ACTIVE').length} />
        <Metric title="Inactive routes" value={routes.filter((route) => route.status === 'INACTIVE').length} />
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <RouteIcon className="h-5 w-5 text-blue-600" />
            Route Master
          </CardTitle>
          <div className="relative w-full md:w-80">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <Input className="pl-9" placeholder="Search routes..." value={query} onChange={(event) => setQuery(event.target.value)} />
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex min-h-48 items-center justify-center text-slate-500">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              Loading routes
            </div>
          ) : filteredRoutes.length === 0 ? (
            <div className="flex min-h-48 flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 text-center">
              <MapPinned className="h-8 w-8 text-slate-400" />
              <p className="mt-3 text-sm font-medium text-slate-800">No routes found</p>
              <p className="mt-1 text-sm text-slate-500">Create a route to make it available for trip scheduling.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Route</TableHead>
                  <TableHead>Distance</TableHead>
                  <TableHead>Fare</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRoutes.map((route) => (
                  <TableRow key={route.id}>
                    <TableCell>
                      <div className="font-medium text-slate-900">{route.routeName}</div>
                      <div className="text-xs text-slate-500">{route.fromCity} to {route.toCity}</div>
                    </TableCell>
                    <TableCell>{route.distanceKm.toLocaleString('en-IN')} km</TableCell>
                    <TableCell>{formatPaise(route.baseFarePaise)}</TableCell>
                    <TableCell>{formatDuration(route.estimatedDurationMinutes)}</TableCell>
                    <TableCell>
                      <Badge variant={route.status === 'ACTIVE' ? 'default' : 'secondary'}>{route.status}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" size="sm" onClick={() => openEdit(route)}>
                          <Edit className="mr-2 h-4 w-4" />
                          Edit
                        </Button>
                        <Button variant={route.status === 'ACTIVE' ? 'destructive' : 'outline'} size="sm" onClick={() => void toggleStatus(route)}>
                          <Power className="mr-2 h-4 w-4" />
                          {route.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{editingRoute ? 'Edit Route' : 'Create Route'}</DialogTitle>
          </DialogHeader>
          <form className="space-y-4" onSubmit={saveRoute}>
            <div className="grid gap-4 md:grid-cols-2">
              <PlaceField
                label="From city"
                value={form.fromCity}
                selectedPlace={form.fromPlace}
                onTyped={(fromCity) => updateEndpoint('from', null, fromCity)}
                onSelect={(place) => updateEndpoint('from', place)}
              />
              <PlaceField
                label="To city"
                value={form.toCity}
                selectedPlace={form.toPlace}
                onTyped={(toCity) => updateEndpoint('to', null, toCity)}
                onSelect={(place) => updateEndpoint('to', place)}
              />
            </div>
            <FormField label="Route name" value={form.routeName} onChange={(routeName) => setForm((current) => ({ ...current, routeName }))} />
            <div className="grid gap-4 md:grid-cols-[1fr_auto]">
              <FormField label="Distance km" inputMode="numeric" value={form.distanceKm} onChange={(distanceKm) => setForm((current) => ({ ...current, distanceKm, distanceSource: 'manual' }))} />
              <div className="flex items-end">
                <Button type="button" variant="outline" disabled={distanceLoading || !form.fromPlace || !form.toPlace} onClick={() => void calculateDistance()}>
                  {distanceLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Calculator className="mr-2 h-4 w-4" />}
                  Calculate
                </Button>
              </div>
            </div>
            <p className="text-xs text-slate-500">
              Distance source: {form.distanceSource === 'location_service' ? 'location service' : form.distanceSource === 'coordinate_estimate' ? 'coordinate estimate' : 'manual entry'}
            </p>
            <div className="grid gap-4 md:grid-cols-2">
              <FormField label="Base fare INR" inputMode="decimal" value={form.baseFareRupees} onChange={(baseFareRupees) => setForm((current) => ({ ...current, baseFareRupees }))} />
              <FormField label="Duration minutes" inputMode="numeric" value={form.estimatedDurationMinutes} onChange={(estimatedDurationMinutes) => setForm((current) => ({ ...current, estimatedDurationMinutes }))} />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={saving}>
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {editingRoute ? 'Save changes' : 'Create route'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Metric({ title, value }: { title: string; value: number }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-sm text-slate-500">{title}</p>
        <p className="mt-1 text-2xl font-bold text-slate-900">{value}</p>
      </CardContent>
    </Card>
  );
}

function FormField({ label, value, inputMode, onChange }: { label: string; value: string; inputMode?: 'numeric' | 'decimal'; onChange: (value: string) => void }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input value={value} inputMode={inputMode} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}

function PlaceField({
  label,
  value,
  selectedPlace,
  onTyped,
  onSelect,
}: {
  label: string;
  value: string;
  selectedPlace: GeoPlace | null;
  onTyped: (value: string) => void;
  onSelect: (place: GeoPlace) => void;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [places, setPlaces] = useState<GeoPlace[]>([]);

  useEffect(() => {
    const query = value.trim();
    if (!open || query.length < 2) {
      setPlaces([]);
      return;
    }

    let cancelled = false;
    const timeout = window.setTimeout(async () => {
      setLoading(true);
      try {
        const response = await locationApi.searchPlaces(query);
        if (!cancelled) setPlaces(response);
      } catch {
        if (!cancelled) setPlaces([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [open, value]);

  return (
    <div className="relative space-y-2">
      <Label>{label}</Label>
      <Input
        value={value}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 150)}
        onChange={(event) => {
          onTyped(event.target.value);
          setOpen(true);
        }}
      />
      {selectedPlace ? (
        <p className="truncate text-xs text-slate-500">{selectedPlace.label} · {selectedPlace.address}</p>
      ) : (
        <p className="text-xs text-slate-500">Type at least 2 characters and select a location.</p>
      )}
      {open && (loading || places.length > 0) ? (
        <div className="absolute z-50 max-h-64 w-full overflow-y-auto rounded-md border border-slate-200 bg-white py-1 shadow-lg">
          {loading ? <div className="px-3 py-2 text-sm text-slate-500">Searching...</div> : null}
          {places.map((place) => (
            <button
              key={place.id}
              type="button"
              className="w-full px-3 py-2 text-left hover:bg-slate-50"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                onSelect(place);
                setOpen(false);
              }}
            >
              <p className="text-sm font-medium text-slate-900">{place.label}</p>
              <p className="text-xs text-slate-500">{place.address}</p>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function formatPaise(value: number) {
  return `₹${(value / 100).toLocaleString('en-IN')}`;
}

function formatDuration(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (!hours) return `${mins} min`;
  if (!mins) return `${hours} hr`;
  return `${hours} hr ${mins} min`;
}

function readRoutePlace(route: AdminRoute, key: 'originPlace' | 'destinationPlace'): GeoPlace | null {
  const value = route.metadataJson?.[key];
  if (!value || typeof value !== 'object') return null;
  const place = value as Partial<GeoPlace>;
  if (
    typeof place.id === 'string' &&
    typeof place.label === 'string' &&
    typeof place.address === 'string' &&
    typeof place.city === 'string' &&
    (place.lat === undefined || typeof place.lat === 'number') &&
    (place.lng === undefined || typeof place.lng === 'number')
  ) {
    return place as GeoPlace;
  }
  return null;
}

function readDistanceSource(route: AdminRoute): FormState['distanceSource'] {
  const value = route.metadataJson?.distanceSource;
  if (value === 'location_service' || value === 'coordinate_estimate' || value === 'manual') return value;
  return 'manual';
}

function hasCoordinates(place: GeoPlace | null): place is GeoPlace & { lat: number; lng: number } {
  return Boolean(place && typeof place.lat === 'number' && typeof place.lng === 'number');
}

function estimateDistanceKm(origin: GeoPlace & { lat: number; lng: number }, destination: GeoPlace & { lat: number; lng: number }) {
  const earthRadiusKm = 6371;
  const dLat = toRadians(destination.lat - origin.lat);
  const dLng = toRadians(destination.lng - origin.lng);
  const lat1 = toRadians(origin.lat);
  const lat2 = toRadians(destination.lat);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return Math.max(1, Math.round(earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))));
}

function estimateDurationMinutes(distanceKm: number) {
  return Math.max(30, Math.round((distanceKm / 45) * 60));
}

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}
