import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { parseBooking } from '@/features/trips/lib/parsePahadi';
import type { Booking } from '@/types';

export function useBooking(bookingId: string) {
  const token = useAuthStore((s) => s.token);
  return useQuery<Booking>({
    queryKey: ['booking', bookingId],
    queryFn: async () => {
      const response = await api.get<unknown>(`/bookings/${bookingId}`, token);
      const booking = parseBooking(response);
      if (!booking) {
        throw new Error('Booking not found');
      }
      return booking;
    },
    enabled: !!bookingId,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });
}
