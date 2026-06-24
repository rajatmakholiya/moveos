import { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { BookingFormData, SeatType } from '@/types';

const DEFAULT_FORM: BookingFormData = {
  passengerName: '',
  phone: '',
  emergencyContact: '',
  gstin: '',
  seatType: 'FRONT',
  luggageSize: 'SMALL',
  paymentMethod: 'UPI',
  extraPassengers: [],
};

type Options = {
  tripId: string;
  initialSeatType?: SeatType;
  initialName?: string;
  initialPhone?: string;
};

export function useBookingForm({ tripId, initialSeatType, initialName, initialPhone }: Options) {
  const storageKey = `pahadi_booking_form_${tripId}`;
  const isDirtyRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [form, setForm] = useState<BookingFormData>({
    ...DEFAULT_FORM,
    seatType: initialSeatType ?? 'FRONT',
    passengerName: initialName ?? '',
    phone: initialPhone ?? '',
  });

  // Restore draft on mount
  useEffect(() => {
    AsyncStorage.getItem(storageKey).then((json) => {
      if (!json) return;
      try {
        const saved: Partial<BookingFormData> = JSON.parse(json);
        setForm((prev) => ({ ...prev, ...saved }));
      } catch {}
    });
  }, [storageKey]);

  // Debounced save on change
  useEffect(() => {
    if (!isDirtyRef.current) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      AsyncStorage.setItem(storageKey, JSON.stringify(form));
    }, 500);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [form, storageKey]);

  const updateField = useCallback(
    <K extends keyof BookingFormData>(key: K, value: BookingFormData[K]) => {
      isDirtyRef.current = true;
      setForm((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  const clearDraft = useCallback(async () => {
    await AsyncStorage.removeItem(storageKey);
  }, [storageKey]);

  return { form, updateField, clearDraft };
}
