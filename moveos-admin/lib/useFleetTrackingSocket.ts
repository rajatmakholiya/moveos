'use client';

import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { WS_BASE } from './api';

export type LiveLocation = {
  driverId: string;
  lat: number;
  lng: number;
  updatedAt: string;
};

type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

/**
 * Streams live vehicle positions for a fleet. Pass the driverIds currently on
 * trips (from the REST snapshot); the hook subscribes to each and returns a map
 * of driverId → latest position, updated in real time as the gateway relays
 * `driver.location` events from Redis pub/sub.
 */
export function useFleetTrackingSocket(driverIds: string[]) {
  const socketRef = useRef<Socket | null>(null);
  const subscribedRef = useRef<Set<string>>(new Set());
  const [locations, setLocations] = useState<Record<string, LiveLocation>>({});
  const [status, setStatus] = useState<ConnectionStatus>('connecting');

  // Stable key so the effect only re-subscribes when the set actually changes.
  const idsKey = [...driverIds].sort().join(',');

  useEffect(() => {
    const socket = io(`${WS_BASE}/ws`, {
      path: '/socket.io',
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 10,
      reconnectionDelay: 2000,
      reconnectionDelayMax: 15000,
    });
    socketRef.current = socket;

    const subscribeAll = () => {
      const ids = idsKey ? idsKey.split(',') : [];
      if (ids.length > 0) socket.emit('track:drivers', { driverIds: ids });
      subscribedRef.current = new Set(ids);
    };

    socket.on('connect', () => {
      setStatus('connected');
      subscribeAll();
    });
    socket.on('disconnect', () => setStatus('disconnected'));
    socket.on('connect_error', () => setStatus('error'));

    socket.on('driver.location', (data: LiveLocation) => {
      if (!data?.driverId) return;
      setLocations((prev) => ({ ...prev, [data.driverId]: data }));
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
      subscribedRef.current = new Set();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When the tracked set changes (filters / new trips), re-subscribe live.
  useEffect(() => {
    const socket = socketRef.current;
    if (!socket || !socket.connected) return;
    const next = new Set(idsKey ? idsKey.split(',') : []);
    const toAdd = [...next].filter((id) => !subscribedRef.current.has(id));
    const toRemove = [...subscribedRef.current].filter((id) => !next.has(id));
    if (toAdd.length) socket.emit('track:drivers', { driverIds: toAdd });
    if (toRemove.length) socket.emit('untrack:drivers', { driverIds: toRemove });
    subscribedRef.current = next;
  }, [idsKey]);

  return { locations, wsStatus: status };
}
