import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import type { RequestType } from '@/types';

export type CreateRequestPayload = {
  type: RequestType;
  routeId?: string;
  from: string;
  to: string;
  pickupLocation?: string;
  dropoffLocation?: string;
  requestedFor: string; // ISO 8601
  seats?: number; // FULL_VEHICLE only
  budgetPaise?: number; // FULL_VEHICLE only
  note?: string; // required for PARCEL
};

export function useCreateRequest() {
  const token = useAuthStore((s) => s.token);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: CreateRequestPayload) =>
      api.postd<{ id: string }>('/requests', payload, token),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['requests', 'REQUESTED'] });
    },
  });
}
