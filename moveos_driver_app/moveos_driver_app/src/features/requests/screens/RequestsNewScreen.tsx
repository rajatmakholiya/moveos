import React, { useMemo, useState } from 'react';
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

import GeoSearchField from '@/features/shared/components/GeoSearchField';
import { useCreateRequest } from '@/features/requests/hooks/useCreateRequest';
import { useAuthStore } from '@/store/auth';
import type { RootStackParamList } from '@/navigation/types';
import type { RequestType, GeoPlace } from '@/types';

type Navigation = NativeStackNavigationProp<RootStackParamList, 'RequestsNew'>;
type Route = RouteProp<RootStackParamList, 'RequestsNew'>;

const TYPES: { value: RequestType; label: string; icon: string; hint: string }[] = [
  { value: 'SEAT', label: 'Seat', icon: '💺', hint: 'A seat on any matching ride' },
  { value: 'FULL_VEHICLE', label: 'Full Vehicle', icon: '🚐', hint: 'Book the whole vehicle' },
  { value: 'PARCEL', label: 'Parcel', icon: '📦', hint: 'Send a package' },
];

const RequestsNewScreen: React.FC = () => {
  const navigation = useNavigation<Navigation>();
  const { params } = useRoute<Route>();
  const token = useAuthStore((s) => s.token);
  const createRequest = useCreateRequest();

  const [type, setType] = useState<RequestType>(params?.type ?? 'SEAT');
  const [from, setFrom] = useState(params?.from ?? '');
  const [to, setTo] = useState(params?.to ?? '');
  const [pickup, setPickup] = useState<GeoPlace | null>(null);
  const [dropoff, setDropoff] = useState<GeoPlace | null>(null);
  const [seats, setSeats] = useState('1');
  const [budget, setBudget] = useState('');
  const [note, setNote] = useState('');

  const requestedFor = useMemo(() => {
    if (params?.date) {
      return new Date(`${params.date}T08:00:00`).toISOString();
    }
    return new Date().toISOString();
  }, [params?.date]);

  const handleSubmit = () => {
    if (!token) {
      navigation.replace('AuthPhoneEntry');
      return;
    }
    if (from.trim().length < 2 || to.trim().length < 2) {
      Toast.show({ type: 'error', text1: 'Enter both From and To cities' });
      return;
    }
    if (type === 'PARCEL' && note.trim().length === 0) {
      Toast.show({ type: 'error', text1: 'Parcel details are required' });
      return;
    }
    const seatsNum = parseInt(seats, 10);
    if (type === 'FULL_VEHICLE' && (isNaN(seatsNum) || seatsNum < 1 || seatsNum > 8)) {
      Toast.show({ type: 'error', text1: 'Seats must be between 1 and 8' });
      return;
    }

    createRequest.mutate(
      {
        type,
        routeId: params?.routeId,
        from: from.trim(),
        to: to.trim(),
        pickupLocation: pickup?.label,
        dropoffLocation: dropoff?.label,
        requestedFor,
        seats: type === 'FULL_VEHICLE' ? seatsNum : undefined,
        budgetPaise: type === 'FULL_VEHICLE' && budget ? parseInt(budget, 10) * 100 : undefined,
        note: note.trim() || undefined,
      },
      {
        onSuccess: () => {
          Toast.show({ type: 'success', text1: 'Request created', text2: 'Drivers will be notified' });
          navigation.goBack();
        },
        onError: () => {
          Toast.show({ type: 'error', text1: 'Could not create request' });
        },
      },
    );
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.header}>
          <Pressable onPress={() => navigation.goBack()} hitSlop={12} style={styles.backBtn}>
            <Text style={styles.backIcon}>✕</Text>
          </Pressable>
          <Text style={styles.headerTitle}>Request a Ride</Text>
          <View style={{ width: 36 }} />
        </View>

        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Text style={styles.intro}>
            No trips on this route yet? Post a request and nearby drivers can accept it.
          </Text>

          {/* Type */}
          <Text style={styles.sectionTitle}>What do you need?</Text>
          <View style={styles.typeRow}>
            {TYPES.map((t) => (
              <Pressable
                key={t.value}
                style={[styles.typeCard, type === t.value && styles.typeCardActive]}
                onPress={() => setType(t.value)}
              >
                <Text style={styles.typeIcon}>{t.icon}</Text>
                <Text style={[styles.typeLabel, type === t.value && styles.typeLabelActive]}>
                  {t.label}
                </Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.typeHint}>{TYPES.find((t) => t.value === type)?.hint}</Text>

          {/* Cities */}
          <View style={styles.fieldWrap}>
            <Text style={styles.fieldLabel}>From (city)</Text>
            <TextInput
              style={styles.input}
              value={from}
              onChangeText={setFrom}
              placeholder="Departure city"
              placeholderTextColor="#C4CDD5"
            />
          </View>
          <View style={styles.fieldWrap}>
            <Text style={styles.fieldLabel}>To (city)</Text>
            <TextInput
              style={styles.input}
              value={to}
              onChangeText={setTo}
              placeholder="Destination city"
              placeholderTextColor="#C4CDD5"
            />
          </View>

          {/* Exact pickup / dropoff with geo search */}
          <GeoSearchField
            label="Pickup location (optional)"
            placeholder="Search exact pickup"
            routeId={params?.routeId}
            selected={pickup}
            onSelect={setPickup}
            iconColor="#16A34A"
          />
          <GeoSearchField
            label="Drop location (optional)"
            placeholder="Search exact drop"
            routeId={params?.routeId}
            selected={dropoff}
            onSelect={setDropoff}
            iconColor="#0F52BA"
          />

          {/* FULL_VEHICLE extras */}
          {type === 'FULL_VEHICLE' && (
            <>
              <View style={styles.fieldWrap}>
                <Text style={styles.fieldLabel}>Seats needed (1–8)</Text>
                <TextInput
                  style={styles.input}
                  value={seats}
                  onChangeText={(v) => setSeats(v.replace(/\D/g, '').slice(0, 1))}
                  keyboardType="number-pad"
                  placeholder="1"
                  placeholderTextColor="#C4CDD5"
                />
              </View>
              <View style={styles.fieldWrap}>
                <Text style={styles.fieldLabel}>Budget ₹ (optional)</Text>
                <TextInput
                  style={styles.input}
                  value={budget}
                  onChangeText={(v) => setBudget(v.replace(/\D/g, ''))}
                  keyboardType="number-pad"
                  placeholder="e.g. 2000"
                  placeholderTextColor="#C4CDD5"
                />
              </View>
            </>
          )}

          {/* Note */}
          <View style={styles.fieldWrap}>
            <Text style={styles.fieldLabel}>
              {type === 'PARCEL' ? 'Parcel details (required)' : 'Note (optional)'}
            </Text>
            <TextInput
              style={[styles.input, styles.noteInput]}
              value={note}
              onChangeText={setNote}
              placeholder={
                type === 'PARCEL'
                  ? 'What are you sending? Size, weight, recipient…'
                  : 'Anything the driver should know'
              }
              placeholderTextColor="#C4CDD5"
              multiline
            />
          </View>
        </ScrollView>

        <View style={styles.footer}>
          <Pressable
            style={[styles.submitBtn, createRequest.isPending && styles.submitBtnDisabled]}
            onPress={handleSubmit}
            disabled={createRequest.isPending}
          >
            {createRequest.isPending ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.submitText}>Post Request</Text>
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
  backIcon: { fontSize: 16, color: '#0F172A', fontWeight: '700' },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '800', color: '#0F172A' },

  scroll: { padding: 16, paddingBottom: 32 },
  intro: { fontSize: 14, color: '#475467', lineHeight: 20, marginBottom: 16 },

  sectionTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  typeRow: { flexDirection: 'row', gap: 10 },
  typeCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    gap: 6,
    borderWidth: 1.5,
    borderColor: '#E4E7EC',
  },
  typeCardActive: { borderColor: '#0F52BA', backgroundColor: '#EEF4FF' },
  typeIcon: { fontSize: 24 },
  typeLabel: { fontSize: 13, fontWeight: '700', color: '#475467' },
  typeLabelActive: { color: '#0F52BA' },
  typeHint: { fontSize: 13, color: '#667085', marginTop: 8, marginBottom: 8 },

  fieldWrap: { marginTop: 14 },
  fieldLabel: { fontSize: 13, fontWeight: '700', color: '#475467', marginBottom: 6 },
  input: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E4E7EC',
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 15,
    color: '#0F172A',
  },
  noteInput: { minHeight: 80, textAlignVertical: 'top' },

  footer: {
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderColor: '#E4E7EC',
  },
  submitBtn: {
    backgroundColor: '#0F52BA',
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    shadowColor: '#0F52BA',
    shadowOpacity: 0.25,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 10,
    elevation: 4,
  },
  submitBtnDisabled: { backgroundColor: '#98A2B3', shadowOpacity: 0 },
  submitText: { color: '#FFFFFF', fontWeight: '800', fontSize: 16 },
});

export default RequestsNewScreen;
