import { useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { ENV } from '@/config/env';

export type LiveDriverLocation = {
  lat: number;
  lng: number;
  driverId?: string;
  updatedAt: string;
};

export type BookingStatusUpdate = {
  bookingId?: string;
  bookingStatus?: string;
  arrivedAtPickupAt?: string;
  pickedUpAt?: string;
  droppedOffAt?: string;
  droppedOff?: boolean;
};

type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

function wsBaseFromApiUrl(apiUrl: string) {
  return apiUrl.replace(/\/api\/?$/, '');
}

export function useTrackingSocket(bookingId: string) {
  const socketRef = useRef<Socket | null>(null);
  const [driverLocation, setDriverLocation] = useState<LiveDriverLocation | null>(null);
  const [bookingUpdate, setBookingUpdate] = useState<BookingStatusUpdate | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>('connecting');

  useEffect(() => {
    if (!bookingId) return;

    const socket = io(`${wsBaseFromApiUrl(ENV.API_URL)}/ws`, {
      path: '/socket.io',
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 8,
      reconnectionDelay: 2000,
      reconnectionDelayMax: 15000,
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      setStatus('connected');
      socket.emit('track:booking', { bookingId });
    });
    socket.on('disconnect', () => setStatus('disconnected'));
    socket.on('connect_error', () => setStatus('error'));
    socket.on('driver.location', (data: LiveDriverLocation) => setDriverLocation(data));
    socket.on('booking.status.updated', (data: BookingStatusUpdate) => {
      if (!data.bookingId || data.bookingId === bookingId) setBookingUpdate(data);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [bookingId]);

  return { driverLocation, bookingUpdate, wsStatus: status };
}
