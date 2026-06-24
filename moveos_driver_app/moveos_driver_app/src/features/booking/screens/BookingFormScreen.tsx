import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import Toast from 'react-native-toast-message';

import { useBookingForm } from '@/features/booking/hooks/useBookingForm';
import { api, ApiError } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { useLanguageStore } from '@/store/language';
import { formatDateTime } from '@/utils/date';
import { formatPaise } from '@/utils/currency';
import { isValidPhone, isValidName } from '@/utils/validation';
import type { RootStackParamList } from '@/navigation/types';
import type { LuggageSize, PaymentMethod, SeatType, ExtraPassenger, GeoPlace } from '@/types';
import { LUGGAGE_PAISE as LUGGAGE_PRICES } from '@/types';
import GeoSearchField from '@/features/shared/components/GeoSearchField';

type Navigation = NativeStackNavigationProp<RootStackParamList, 'BookingForm'>;
type Route = RouteProp<RootStackParamList, 'BookingForm'>;

function calculateTotal(
  trip: Route['params']['trip'],
  seatType: SeatType,
  luggageSize: LuggageSize,
  extraPassengers: ExtraPassenger[],
): number {
  const baseFare = seatType === 'FRONT' ? trip.frontFarePaise : trip.backFarePaise;
  const extraFare = extraPassengers.reduce((sum, ep) => {
    return sum + (ep.seatType === 'FRONT' ? trip.frontFarePaise : trip.backFarePaise);
  }, 0);
  return baseFare + extraFare + LUGGAGE_PRICES[luggageSize];
}

// ─── Row components ───────────────────────────────────────────────────────────

const SectionTitle: React.FC<{ title: string }> = ({ title }) => (
  <Text style={styles.sectionTitle}>{title}</Text>
);

const FieldInput: React.FC<{
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  keyboardType?: 'default' | 'phone-pad' | 'email-address';
  optional?: boolean;
  error?: string;
}> = ({ label, value, onChange, placeholder, keyboardType = 'default', optional, error }) => (
  <View style={styles.fieldWrap}>
    <Text style={styles.fieldLabel}>
      {label}
      {optional && <Text style={styles.optionalTag}> (optional)</Text>}
    </Text>
    <TextInput
      style={[styles.fieldInput, !!error && styles.fieldInputError]}
      value={value}
      onChangeText={onChange}
      placeholder={placeholder}
      placeholderTextColor="#C4CDD5"
      keyboardType={keyboardType}
    />
    {!!error && <Text style={styles.fieldError}>{error}</Text>}
  </View>
);

const RadioGroup: React.FC<{
  label: string;
  options: { value: string; label: string; sub?: string }[];
  value: string;
  onChange: (v: string) => void;
}> = ({ label, options, value, onChange }) => (
  <View style={styles.fieldWrap}>
    <Text style={styles.fieldLabel}>{label}</Text>
    <View style={styles.radioRow}>
      {options.map((opt) => (
        <Pressable
          key={opt.value}
          style={[styles.radioChip, value === opt.value && styles.radioChipActive]}
          onPress={() => onChange(opt.value)}
        >
          <Text style={[styles.radioChipText, value === opt.value && styles.radioChipTextActive]}>
            {opt.label}
          </Text>
          {opt.sub && (
            <Text style={[styles.radioChipSub, value === opt.value && styles.radioChipSubActive]}>
              {opt.sub}
            </Text>
          )}
        </Pressable>
      ))}
    </View>
  </View>
);

// ─── Main Screen ──────────────────────────────────────────────────────────────

const BookingFormScreen: React.FC = () => {
  const navigation = useNavigation<Navigation>();
  const { params } = useRoute<Route>();
  const { trip, tripId, seatType: initialSeatType } = params;
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const tx = useLanguageStore((s) => s.tx);

  const [loading, setLoading] = useState(false);
  const [submitErrors, setSubmitErrors] = useState<Record<string, string>>({});
  const [pickup, setPickup] = useState<GeoPlace | null>(null);
  const [dropoff, setDropoff] = useState<GeoPlace | null>(null);

  const { form, updateField, clearDraft } = useBookingForm({
    tripId,
    initialSeatType,
    initialName: user?.name,
    initialPhone: user?.phone,
  });

  const totalPaise = useMemo(
    () => calculateTotal(trip, form.seatType, form.luggageSize, form.extraPassengers),
    [trip, form.seatType, form.luggageSize, form.extraPassengers],
  );

  const validate = useCallback(() => {
    const errors: Record<string, string> = {};
    if (!isValidName(form.passengerName)) errors.passengerName = 'Name must be at least 2 characters';
    if (!isValidPhone(form.phone)) errors.phone = 'Enter a valid 10-digit mobile number';
    if (form.emergencyContact && !isValidPhone(form.emergencyContact)) {
      errors.emergencyContact = 'Enter a valid 10-digit number';
    }
    if (!pickup) errors.pickup = 'Select a pickup point';
    if (!dropoff) errors.dropoff = 'Select a drop point';
    for (let i = 0; i < form.extraPassengers.length; i++) {
      const ep = form.extraPassengers[i];
      if (!isValidName(ep.name)) errors[`ep_name_${i}`] = 'Required';
      if (!isValidPhone(ep.phone)) errors[`ep_phone_${i}`] = 'Invalid phone';
    }
    return errors;
  }, [form, pickup, dropoff]);

  const handleSubmit = useCallback(async () => {
    const errors = validate();
    if (Object.keys(errors).length > 0) {
      setSubmitErrors(errors);
      Toast.show({ type: 'error', text1: 'Please fix the errors above' });
      return;
    }
    if (!token) {
      navigation.replace('AuthPhoneEntry');
      return;
    }
    setLoading(true);
    try {
      const digits = form.phone.replace(/\D/g, '');
      // Backend expects: POST /bookings with tripId in the body (not /{id}/confirm),
      // E.164 phone in `passengerPhone`, and pickup/dropoff as { placeId,label,lat,lng }.
      const res = await api.postd<{
        id?: string;
        bookingId?: string;
        bookingCode?: string;
        code?: string;
        orderId?: string;
        razorpayOrderId?: string;
        amount?: number;
        totalFarePaise?: number;
      }>('/bookings', {
        tripId,
        seatType: form.seatType,
        luggageSize: form.luggageSize,
        paymentMethod: form.paymentMethod,
        passengerName: form.passengerName.trim(),
        passengerPhone: `+91${digits}`,
        pickup: pickup
          ? { placeId: pickup.placeId, label: pickup.label, lat: pickup.lat, lng: pickup.lng }
          : undefined,
        dropoff: dropoff
          ? { placeId: dropoff.placeId, label: dropoff.label, lat: dropoff.lat, lng: dropoff.lng }
          : undefined,
        emergencyContact: form.emergencyContact?.replace(/\D/g, '') || undefined,
        gstin: form.gstin?.trim() || undefined,
        extraPassengers: form.extraPassengers.length > 0 ? form.extraPassengers : undefined,
      }, token);

      await clearDraft();

      const bookingId = res.id ?? res.bookingId;
      const orderId = res.orderId ?? res.razorpayOrderId;
      const amount = res.amount ?? res.totalFarePaise;

      if (!bookingId) {
        throw new ApiError(500, { message: 'Booking created but no id returned' });
      }

      if (form.paymentMethod === 'UPI' && orderId && amount) {
        navigation.navigate('PassengerPayment', {
          bookingId,
          orderId,
          amount,
          passengerName: form.passengerName.trim(),
          phone: digits,
        });
      } else {
        navigation.replace('Ticket', { bookingId });
      }
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? ((err.body as { message?: string })?.message ?? tx('error_generic'))
          : tx('error_network');
      Toast.show({ type: 'error', text1: msg });
    } finally {
      setLoading(false);
    }
  }, [validate, token, navigation, tripId, form, pickup, dropoff, clearDraft, tx]);

  const addExtraPassenger = () => {
    updateField('extraPassengers', [
      ...form.extraPassengers,
      { name: '', phone: '', seatType: 'BACK' as SeatType },
    ]);
  };

  const removeExtraPassenger = (idx: number) => {
    updateField('extraPassengers', form.extraPassengers.filter((_, i) => i !== idx));
  };

  const updateExtraPassenger = (idx: number, key: keyof ExtraPassenger, value: string) => {
    const updated = form.extraPassengers.map((ep, i) =>
      i === idx ? { ...ep, [key]: value } : ep,
    );
    updateField('extraPassengers', updated);
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <SafeAreaView style={styles.safe} edges={['top']}>
        {/* Header */}
        <View style={styles.header}>
          <Pressable onPress={() => navigation.goBack()} hitSlop={12} style={styles.backBtn}>
            <Text style={styles.backIcon}>←</Text>
          </Pressable>
          <Text style={styles.headerTitle}>Confirm Booking</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {/* Trip summary */}
          <View style={styles.tripCard}>
            <Text style={styles.tripRoute}>
              {trip.from} → {trip.to}
            </Text>
            <Text style={styles.tripTime}>{formatDateTime(trip.departureAt)}</Text>
            <Text style={styles.tripDriver}>
              {trip.driverName} · {trip.vehicleName}
            </Text>
            {!!trip.pickupPoint && (
              <Text style={styles.tripHint}>Driver boarding area: {trip.pickupPoint}</Text>
            )}
          </View>

          {/* Pickup / drop point selection (geo search — no map, no crash) */}
          <SectionTitle title="Pickup & Drop" />
          <GeoSearchField
            label="Pickup point"
            placeholder={`Search in ${trip.from}`}
            routeId={trip.routeId}
            selected={pickup}
            onSelect={setPickup}
            error={submitErrors.pickup}
            iconColor="#16A34A"
          />
          <GeoSearchField
            label="Drop point"
            placeholder={`Search in ${trip.to}`}
            routeId={trip.routeId}
            selected={dropoff}
            onSelect={setDropoff}
            error={submitErrors.dropoff}
            iconColor="#0F52BA"
          />

          {/* Passenger details */}
          <SectionTitle title="Passenger Details" />
          <FieldInput
            label="Full Name"
            value={form.passengerName}
            onChange={(v) => updateField('passengerName', v)}
            placeholder="As per ID"
            error={submitErrors.passengerName}
          />
          <FieldInput
            label="Mobile Number"
            value={form.phone}
            onChange={(v) => updateField('phone', v.replace(/\D/g, '').slice(0, 10))}
            placeholder="10-digit number"
            keyboardType="phone-pad"
            error={submitErrors.phone}
          />
          <FieldInput
            label="Emergency Contact"
            value={form.emergencyContact ?? ''}
            onChange={(v) => updateField('emergencyContact', v.replace(/\D/g, '').slice(0, 10))}
            placeholder="10-digit number"
            keyboardType="phone-pad"
            optional
            error={submitErrors.emergencyContact}
          />
          <FieldInput
            label="GSTIN"
            value={form.gstin ?? ''}
            onChange={(v) => updateField('gstin', v.toUpperCase())}
            placeholder="For invoice"
            optional
          />

          {/* Seat type */}
          <RadioGroup
            label="Seat Type"
            value={form.seatType}
            onChange={(v) => updateField('seatType', v as SeatType)}
            options={[
              {
                value: 'FRONT',
                label: 'Front',
                sub: trip.frontSeatsLeft > 0 ? `${trip.frontSeatsLeft} left · ${formatPaise(trip.frontFarePaise)}` : 'Full',
              },
              {
                value: 'BACK',
                label: 'Back',
                sub: trip.backSeatsLeft > 0 ? `${trip.backSeatsLeft} left · ${formatPaise(trip.backFarePaise)}` : 'Full',
              },
            ]}
          />

          {/* Luggage */}
          <RadioGroup
            label={tx('booking_luggage')}
            value={form.luggageSize}
            onChange={(v) => updateField('luggageSize', v as LuggageSize)}
            options={[
              { value: 'SMALL', label: 'Small', sub: 'Free' },
              { value: 'LARGE', label: 'Large', sub: '₹50' },
              { value: 'OVERSIZED', label: 'Oversized', sub: '₹150' },
            ]}
          />

          {/* Payment */}
          <RadioGroup
            label={tx('booking_payment')}
            value={form.paymentMethod}
            onChange={(v) => updateField('paymentMethod', v as PaymentMethod)}
            options={[
              { value: 'UPI', label: 'UPI / Online' },
              { value: 'CASH', label: 'Cash to driver' },
            ]}
          />

          {/* Extra passengers */}
          <SectionTitle title={tx('booking_extra_passengers')} />
          {form.extraPassengers.map((ep, idx) => (
            <View key={idx} style={styles.extraPassCard}>
              <View style={styles.extraPassHeader}>
                <Text style={styles.extraPassTitle}>Passenger {idx + 2}</Text>
                <Pressable onPress={() => removeExtraPassenger(idx)} hitSlop={8}>
                  <Text style={styles.removeBtn}>Remove</Text>
                </Pressable>
              </View>
              <TextInput
                style={[styles.fieldInput, !!submitErrors[`ep_name_${idx}`] && styles.fieldInputError]}
                value={ep.name}
                onChangeText={(v) => updateExtraPassenger(idx, 'name', v)}
                placeholder="Full name"
                placeholderTextColor="#C4CDD5"
              />
              <TextInput
                style={[styles.fieldInput, { marginTop: 8 }, !!submitErrors[`ep_phone_${idx}`] && styles.fieldInputError]}
                value={ep.phone}
                onChangeText={(v) => updateExtraPassenger(idx, 'phone', v.replace(/\D/g, '').slice(0, 10))}
                placeholder="Mobile number"
                placeholderTextColor="#C4CDD5"
                keyboardType="phone-pad"
              />
              <View style={styles.radioRow}>
                {(['FRONT', 'BACK'] as SeatType[]).map((st) => (
                  <Pressable
                    key={st}
                    style={[styles.radioChip, ep.seatType === st && styles.radioChipActive]}
                    onPress={() => updateExtraPassenger(idx, 'seatType', st)}
                  >
                    <Text style={[styles.radioChipText, ep.seatType === st && styles.radioChipTextActive]}>
                      {st === 'FRONT' ? 'Front' : 'Back'}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ))}

          <Pressable style={styles.addPassBtn} onPress={addExtraPassenger}>
            <Text style={styles.addPassText}>＋ {tx('booking_add_passenger')}</Text>
          </Pressable>

          {/* Fare summary */}
          <View style={styles.fareCard}>
            <Text style={styles.fareTitle}>{tx('booking_fare_summary')}</Text>
            <View style={styles.fareRow}>
              <Text style={styles.fareLabel}>{tx('booking_base_fare')} ({form.seatType})</Text>
              <Text style={styles.fareValue}>
                {formatPaise(form.seatType === 'FRONT' ? trip.frontFarePaise : trip.backFarePaise)}
              </Text>
            </View>
            {form.extraPassengers.map((ep, idx) => (
              <View key={idx} style={styles.fareRow}>
                <Text style={styles.fareLabel}>
                  Passenger {idx + 2} ({ep.seatType})
                </Text>
                <Text style={styles.fareValue}>
                  {formatPaise(ep.seatType === 'FRONT' ? trip.frontFarePaise : trip.backFarePaise)}
                </Text>
              </View>
            ))}
            {LUGGAGE_PRICES[form.luggageSize] > 0 && (
              <View style={styles.fareRow}>
                <Text style={styles.fareLabel}>{tx('booking_luggage_charge')}</Text>
                <Text style={styles.fareValue}>{formatPaise(LUGGAGE_PRICES[form.luggageSize])}</Text>
              </View>
            )}
            <View style={styles.fareDivider} />
            <View style={styles.fareRow}>
              <Text style={styles.fareTotalLabel}>{tx('booking_total')}</Text>
              <Text style={styles.fareTotalValue}>{formatPaise(totalPaise)}</Text>
            </View>
          </View>
        </ScrollView>

        {/* Submit */}
        <View style={styles.footer}>
          <View style={styles.footerAmount}>
            <Text style={styles.footerAmountLabel}>Total</Text>
            <Text style={styles.footerAmountValue}>{formatPaise(totalPaise)}</Text>
          </View>
          <Pressable
            style={[styles.submitBtn, loading && styles.submitBtnDisabled]}
            onPress={handleSubmit}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.submitBtnText}>{tx('booking_confirm')}</Text>
            )}
          </Pressable>
        </View>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F8FAFC' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderColor: '#E4E7EC',
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F5F6F7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backIcon: { fontSize: 18, color: '#0F172A', fontWeight: '700' },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '800', color: '#0F172A' },
  scroll: { padding: 16, gap: 4, paddingBottom: 32 },

  tripCard: {
    backgroundColor: '#0F52BA',
    borderRadius: 16,
    padding: 14,
    marginBottom: 16,
    gap: 4,
  },
  tripRoute: { fontSize: 17, fontWeight: '800', color: '#FFFFFF' },
  tripTime: { fontSize: 13, color: '#BBCFFF' },
  tripDriver: { fontSize: 12, color: '#A8C0FF' },
  tripHint: { fontSize: 12, color: '#BBCFFF', marginTop: 6 },
  tripPickup: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.15)',
    gap: 8,
  },
  tripPickupIcon: { fontSize: 16 },
  tripPickupText: { flex: 1 },
  tripPickupLabel: { fontSize: 10, color: '#A8C0FF', fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  tripPickupValue: { fontSize: 13, color: '#FFFFFF', fontWeight: '600', marginTop: 1 },
  tripPickupMaps: { fontSize: 12, color: '#7DD3FC', fontWeight: '700' },

  sectionTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
    marginTop: 12,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  fieldWrap: { marginBottom: 12 },
  fieldLabel: { fontSize: 13, fontWeight: '700', color: '#475467', marginBottom: 6 },
  optionalTag: { fontWeight: '400', color: '#98A2B3' },
  fieldInput: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E4E7EC',
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 15,
    color: '#0F172A',
  },
  fieldInputError: { borderColor: '#F97066' },
  fieldError: { fontSize: 12, color: '#D92D20', marginTop: 4 },

  radioRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginTop: 6 },
  radioChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#E4E7EC',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
  },
  radioChipActive: { borderColor: '#0F52BA', backgroundColor: '#EEF4FF' },
  radioChipText: { fontSize: 14, fontWeight: '700', color: '#475467' },
  radioChipTextActive: { color: '#0F52BA' },
  radioChipSub: { fontSize: 11, color: '#98A2B3', marginTop: 2 },
  radioChipSubActive: { color: '#6B8FCC' },

  extraPassCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E4E7EC',
    marginBottom: 12,
    gap: 8,
  },
  extraPassHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  extraPassTitle: { fontSize: 14, fontWeight: '800', color: '#0F172A' },
  removeBtn: { fontSize: 13, color: '#D92D20', fontWeight: '700' },

  addPassBtn: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#0F52BA',
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
    backgroundColor: '#F8FBFF',
    marginBottom: 16,
  },
  addPassText: { color: '#0F52BA', fontWeight: '700', fontSize: 14 },

  fareCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E4E7EC',
    gap: 10,
    marginTop: 8,
  },
  fareTitle: { fontSize: 14, fontWeight: '800', color: '#0F172A' },
  fareRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  fareLabel: { fontSize: 14, color: '#475467' },
  fareValue: { fontSize: 14, fontWeight: '700', color: '#0F172A' },
  fareDivider: { height: 1, backgroundColor: '#E4E7EC' },
  fareTotalLabel: { fontSize: 15, fontWeight: '800', color: '#0F172A' },
  fareTotalValue: { fontSize: 18, fontWeight: '800', color: '#0F52BA' },

  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderColor: '#E4E7EC',
    gap: 12,
  },
  footerAmount: { flex: 1 },
  footerAmountLabel: { fontSize: 12, color: '#475467' },
  footerAmountValue: { fontSize: 20, fontWeight: '800', color: '#0F172A' },
  submitBtn: {
    backgroundColor: '#0F52BA',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 24,
    alignItems: 'center',
    shadowColor: '#0F52BA',
    shadowOpacity: 0.25,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 10,
    elevation: 4,
    minWidth: 180,
  },
  submitBtnDisabled: { backgroundColor: '#98A2B3', shadowOpacity: 0 },
  submitBtnText: { color: '#FFFFFF', fontWeight: '800', fontSize: 15 },
});

export default BookingFormScreen;
