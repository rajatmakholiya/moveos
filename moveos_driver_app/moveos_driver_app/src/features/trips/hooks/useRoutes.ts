import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { parseRoutes } from '@/features/trips/lib/parsePahadi';
import type { RouteOption } from '@/types';

export function useRoutes() {
  return useQuery<RouteOption[]>({
    queryKey: ['routes', 'v2'],
    queryFn: async () => {
      const response = await api.get<unknown>('/routes', null);
      return parseRoutes(response);
    },
    staleTime: 3_600_000,
    gcTime: 24 * 3_600_000,
  });
}
