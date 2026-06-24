import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { parseBookings, parseRequests } from '@/features/trips/lib/parsePahadi';
import type { Booking, BookingStatus, TransportRequest, TripStatus } from '@/types';

type PassengerBookingsResponse = {
  ongoingBookings: Booking[];
  upcomingBookings: Booking[];
  pastBookings: Booking[];
};

const PAST_TRIP_STATUSES: TripStatus[] = ['COMPLETED', 'CANCELLED'];
const PAST_BOOKING_STATUSES: BookingStatus[] = ['CANCELLED'];

// ─── Hooks ────────────────────────────────────────────────────────────────────

export function usePassengerBookings() {
  const token = useAuthStore((s) => s.token);
  return useQuery<PassengerBookingsResponse>({
    queryKey: ['passenger', 'bookings'],
    queryFn: async () => {
      const raw = await api.get<unknown>('/passenger/bookings', token);
      const bookings = parseBookings(raw);
      const ongoingBookings = bookings.filter(
        (b) => b.tripStatus === 'DEPARTED' && b.status !== 'CANCELLED' && b.status !== 'COMPLETED',
      );
      return {
        ongoingBookings,
        upcomingBookings: bookings.filter(
          (b) =>
            !ongoingBookings.some((ongoing) => ongoing.id === b.id) &&
            !PAST_BOOKING_STATUSES.includes(b.status) &&
            !PAST_TRIP_STATUSES.includes(b.tripStatus),
        ),
        pastBookings: bookings.filter(
          (b) => PAST_BOOKING_STATUSES.includes(b.status) || PAST_TRIP_STATUSES.includes(b.tripStatus),
        ),
      };
    },
    enabled: !!token,
    staleTime: 30_000,
  });
}

export function usePendingRequests() {
  const token = useAuthStore((s) => s.token);
  return useQuery<TransportRequest[]>({
    queryKey: ['requests', 'REQUESTED'],
    queryFn: async () => {
      const res = await api.get<unknown>('/requests?status=REQUESTED', token);
      return parseRequests(res);
    },
    enabled: !!token,
    staleTime: 30_000,
  });
}

export function useAcceptedRequests() {
  const token = useAuthStore((s) => s.token);
  return useQuery<TransportRequest[]>({
    queryKey: ['requests', 'ACCEPTED'],
    queryFn: async () => {
      const res = await api.get<unknown>('/requests?status=ACCEPTED', token);
      return parseRequests(res);
    },
    enabled: !!token,
    staleTime: 30_000,
  });
}
