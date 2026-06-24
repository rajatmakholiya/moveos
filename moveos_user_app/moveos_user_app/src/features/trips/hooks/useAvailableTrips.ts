import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { parseTrips } from '@/features/trips/lib/parsePahadi';
import type { Trip, RouteOption } from '@/types';

export function useAvailableTrips(routeId: string, date: string, enabled = true, route?: RouteOption) {
  return useQuery<Trip[]>({
    queryKey: ['trips', 'available', routeId, date],
    queryFn: async () => {
      const res = await api.get<unknown>(`/trips/available?routeId=${encodeURIComponent(routeId)}&date=${encodeURIComponent(date)}`, null);
      return parseTrips(res, route);
    },
    enabled: enabled && !!routeId && !!date,
    staleTime: 60_000,
  });
}
