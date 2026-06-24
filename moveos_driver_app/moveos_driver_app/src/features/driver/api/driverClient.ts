import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { parseRequests, parseTrips } from '@/features/trips/lib/parsePahadi';
import type { OperatingContext, TransportRequest, Trip, Vehicle } from '@/types';
import { readArray, readNumber, readString, safeRecord } from '@/utils/object';

export type DriverMetrics = {
  totalEarningsPaise: number;
  openSeats: number;
  activeRoutes: number;
  bookings: number;
};

export type DriverEarnings = {
  todayPaise: number;
  weekPaise: number;
  monthPaise: number;
};

export type DriverCompliance = {
  canAcceptBookings: boolean;
  insurance: string;
};

export type ManifestPassenger = {
  id: string;
  bookingCode: string;
  passengerName: string;
  passengerPhone: string;
  seatType: string;
  status: string;
  paymentStatus?: string;
  pickup?: { lat?: number; lng?: number; label?: string };
  dropoff?: { lat?: number; lng?: number; label?: string };
  arrivedAtPickupAt?: string | null;
  pickedUpAt?: string | null;
  droppedOffAt?: string | null;
};

export type DriverManifest = {
  trip: Trip | null;
  passengers: ManifestPassenger[];
};

function unwrap(payload: unknown) {
  const record = safeRecord(payload);
  return record && 'data' in record ? record.data : payload;
}

function parseVehicles(payload: unknown): Vehicle[] {
  const data = unwrap(payload);
  return readArray(data, ['vehicles', 'data']).flatMap((item) => {
    const record = safeRecord(item);
    if (!record) return [];
    const id = readString(record, ['id']);
    const vehicleNumber = readString(record, ['vehicleNumber', 'plate', 'registrationNumber']);
    if (!id || !vehicleNumber) return [];
    return [{
      id,
      vehicleNumber,
      vehicleType: readString(record, ['vehicleType', 'type']),
      vehicleName: readString(record, ['vehicleName', 'name', 'model']),
      isActive: record.isActive !== false,
    }];
  });
}

function parseManifest(payload: unknown): DriverManifest {
  const data = unwrap(payload);
  const record = safeRecord(data);
  const tripPayload = record?.trip ?? data;
  const trip = parseTrips({ trips: [tripPayload] })[0] ?? null;
  const passengers = readArray(record, ['passengers', 'bookings', 'manifest']).flatMap((item) => {
    const p = safeRecord(item);
    if (!p) return [];
    const id = readString(p, ['id', 'bookingId']);
    if (!id) return [];
    const pickup = safeRecord(p.pickup);
    const dropoff = safeRecord(p.dropoff);
    return [{
      id,
      bookingCode: readString(p, ['bookingCode', 'code', 'ticketCode'], id),
      passengerName: readString(p, ['passengerName', 'name']),
      passengerPhone: readString(p, ['passengerPhone', 'phone']),
      seatType: readString(p, ['seatType'], 'BACK'),
      status: readString(p, ['status'], 'CONFIRMED'),
      paymentStatus: readString(p, ['paymentStatus']),
      pickup: pickup ? {
        lat: pickup.lat != null ? Number(pickup.lat) : undefined,
        lng: pickup.lng != null ? Number(pickup.lng) : undefined,
        label: readString(pickup, ['label', 'address']),
      } : undefined,
      dropoff: dropoff ? {
        lat: dropoff.lat != null ? Number(dropoff.lat) : undefined,
        lng: dropoff.lng != null ? Number(dropoff.lng) : undefined,
        label: readString(dropoff, ['label', 'address']),
      } : undefined,
      arrivedAtPickupAt: readString(p, ['arrivedAtPickupAt']) || null,
      pickedUpAt: readString(p, ['pickedUpAt']) || null,
      droppedOffAt: readString(p, ['droppedOffAt']) || null,
    }];
  });

  return { trip, passengers };
}

export function useDriverDashboard() {
  const token = useAuthStore((s) => s.token);
  return useQuery({
    queryKey: ['driver', 'dashboard'],
    enabled: !!token,
    queryFn: async () => {
      const [tripsRes, earningsRes, complianceRes, contextRes] = await Promise.all([
        api.get<unknown>('/driver/trips?scope=today', token),
        api.get<unknown>('/driver/earnings', token),
        api.get<unknown>('/driver/compliance', token),
        api.get<unknown>('/drivers/me/operating-contexts', token),
      ]);
      const tripRecord = safeRecord(unwrap(tripsRes));
      const earningsRecord = safeRecord(unwrap(earningsRes));
      const complianceRecord = safeRecord(unwrap(complianceRes));
      const contextRecord = safeRecord(unwrap(contextRes));
      return {
        trips: parseTrips(tripsRes),
        metrics: {
          totalEarningsPaise: readNumber(tripRecord?.metrics, ['totalEarningsPaise'], 0),
          openSeats: readNumber(tripRecord?.metrics, ['openSeats'], 0),
          activeRoutes: readNumber(tripRecord?.metrics, ['activeRoutes'], 0),
          bookings: readNumber(tripRecord?.metrics, ['bookings'], 0),
        } satisfies DriverMetrics,
        earnings: {
          todayPaise: readNumber(earningsRecord?.earnings ?? earningsRecord, ['todayPaise'], 0),
          weekPaise: readNumber(earningsRecord?.earnings ?? earningsRecord, ['weekPaise'], 0),
          monthPaise: readNumber(earningsRecord?.earnings ?? earningsRecord, ['monthPaise'], 0),
        } satisfies DriverEarnings,
        compliance: {
          canAcceptBookings: safeRecord(complianceRecord?.compliance)?.canAcceptBookings !== false,
          insurance: readString(complianceRecord?.compliance ?? complianceRecord, ['insurance'], 'UNKNOWN'),
        } satisfies DriverCompliance,
        contexts: readArray(contextRecord, ['contexts']) as OperatingContext[],
        selectedContext: readString(contextRecord, ['selectedContext']) || null,
      };
    },
    staleTime: 30_000,
  });
}

export function useDriverTrips(scope: 'today' | 'future' = 'future') {
  const token = useAuthStore((s) => s.token);
  return useQuery<Trip[]>({
    queryKey: ['driver', 'trips', scope],
    enabled: !!token,
    queryFn: async () => parseTrips(await api.get<unknown>(`/driver/trips?scope=${scope}`, token)),
    staleTime: 30_000,
  });
}

export function useDriverRequests(type: 'SEAT' | 'FULL_VEHICLE' | 'PARCEL' | 'ACCEPTED') {
  const token = useAuthStore((s) => s.token);
  const query = type === 'ACCEPTED' ? 'status=ACCEPTED' : `type=${type}`;
  return useQuery<TransportRequest[]>({
    queryKey: ['driver', 'requests', type],
    enabled: !!token,
    queryFn: async () => parseRequests(await api.get<unknown>(`/driver/requests?${query}`, token)),
    staleTime: 20_000,
  });
}

export function useDriverManifest(tripId: string) {
  const token = useAuthStore((s) => s.token);
  return useQuery<DriverManifest>({
    queryKey: ['driver', 'manifest', tripId],
    enabled: !!token && !!tripId,
    queryFn: async () => parseManifest(await api.get<unknown>(`/driver/trips/${encodeURIComponent(tripId)}/manifest`, token)),
    refetchInterval: 30_000,
  });
}

export function useDriverVehicles() {
  const token = useAuthStore((s) => s.token);
  return useQuery<Vehicle[]>({
    queryKey: ['driver', 'vehicles'],
    enabled: !!token,
    queryFn: async () => parseVehicles(await api.get<unknown>('/drivers/me/vehicles', token)),
    staleTime: 60_000,
  });
}

export function useDriverRoutes() {
  return useQuery({
    queryKey: ['driver', 'routes'],
    queryFn: async () => {
      const { parseRoutes } = await import('@/features/trips/lib/parsePahadi');
      return parseRoutes(await api.get<unknown>('/routes', null));
    },
    staleTime: 3_600_000,
  });
}

export function useDriverAction() {
  const token = useAuthStore((s) => s.token);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ path, body }: { path: string; body?: unknown }) => api.post(path, body ?? {}, token),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['driver'] });
    },
  });
}
