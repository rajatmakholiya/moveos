'use client';

import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';

export type DriverLocation = {
  lat: number;
  lng: number;
  driverId: string;
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

const WS_BASE = (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000');

export function useTrackingSocket(bookingId: string) {
  const socketRef = useRef<Socket | null>(null);
  const [driverLocation, setDriverLocation] = useState<DriverLocation | null>(null);
  const [bookingUpdate, setBookingUpdate] = useState<BookingStatusUpdate | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>('connecting');

  useEffect(() => {
    if (!bookingId) return;

    const socket = io(`${WS_BASE}/ws`, {
      path: '/socket.io',
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 8,
      reconnectionDelay: 2000,
      reconnectionDelayMax: 15000,
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      setStatus('connected');
      // Subscribe to this booking's driver location
      socket.emit('track:booking', { bookingId });
    });

    socket.on('disconnect', () => setStatus('disconnected'));
    socket.on('connect_error', () => setStatus('error'));

    // Real-time driver location pushed by the gateway from Redis pub/sub
    socket.on('driver.location', (data: DriverLocation) => {
      setDriverLocation(data);
    });

    // Booking-level status events (arrived, picked up, no-show)
    socket.on('booking.status.updated', (data: BookingStatusUpdate) => {
      if (!data.bookingId || data.bookingId === bookingId) {
        setBookingUpdate(data);
      }
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [bookingId]);

  return { driverLocation, bookingUpdate, wsStatus: status };
}
