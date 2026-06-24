import React, { useMemo, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Toast from 'react-native-toast-message';

import { DriverButton } from '@/features/driver/components/DriverButton';
import { DriverCard } from '@/features/driver/components/DriverCard';
import { useDriverAction, useDriverRoutes, useDriverVehicles } from '@/features/driver/api/driverClient';
import type { RootStackParamList } from '@/navigation/types';
import type { RouteOption, Vehicle } from '@/types';

type Navigation = NativeStackNavigationProp<RootStackParamList, 'DriverPostTrip'>;

export default function DriverPostTripScreen() {
  const navigation = useNavigation<Navigation>();
  const routes = useDriverRoutes();
  const vehicles = useDriverVehicles();
  const action = useDriverAction();
  const [route, setRoute] = useState<RouteOption | null>(null);
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [time, setTime] = useState('08:00');
  const [frontSeats, setFrontSeats] = useState('1');
  const [backSeats, setBackSeats] = useState('3');
  const [frontFare, setFrontFare] = useState('500');
  const [backFare, setBackFare] = useState('350');
  const [pickupPoint, setPickupPoint] = useState('');
  const [luggagePolicy, setLuggagePolicy] = useState('Small bag included');
  const [notes, setNotes] = useState('');

  const departureAt = useMemo(() => new Date(`${date}T${time}:00`).toISOString(), [date, time]);
  const canSubmit = !!route && !!vehicle && pickupPoint.trim().length >= 3;

  const submit = () => {
    if (!route || !vehicle || !canSubmit) return;
    action.mutate(
      {
        path: '/driver/trips',
        body: {
          routeId: route.id,
          vehicleId: vehicle.id,
          departureAt,
          frontSeatsTotal: Number(frontSeats) || 0,
          backSeatsTotal: Number(backSeats) || 0,
          frontFarePaise: (Number(frontFare) || 0) * 100,
          backFarePaise: (Number(backFare) || 0) * 100,
          pickupPoint: pickupPoint.trim(),
          luggagePolicy: luggagePolicy.trim(),
          notes: notes.trim() || undefined,
        },
      },
      {
        onSuccess: (res) => {
          const record = typeof res === 'object' && res !== null ? res as { data?: { id?: string }; id?: string } : {};
          const tripId = record.data?.id ?? record.id;
          Toast.show({ type: 'success', text1: 'Trip posted' });
          if (tripId) navigation.replace('DriverManifest', { tripId });
          else navigation.goBack();
        },
        onError: () => Toast.show({ type: 'error', text1: 'Could not post trip' }),
      },
    );
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.header}>
          <Pressable style={styles.back} onPress={() => navigation.goBack()}><Text style={styles.backText}>Back</Text></Pressable>
          <Text style={styles.title}>Post trip</Text>
          <View style={styles.headerSpacer} />
        </View>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <DriverCard title="Route">
            {routes.isLoading ? <ActivityIndicator color="#0F52BA" /> : (routes.data ?? []).map((item) => (
              <Pressable key={item.id} style={[styles.choice, route?.id === item.id && styles.choiceActive]} onPress={() => setRoute(item)}>
                <Text style={styles.choiceTitle}>{item.from} to {item.to}</Text>
                <Text style={styles.choiceSub}>{item.durationHours}h · {item.distanceKm} km</Text>
              </Pressable>
            ))}
          </DriverCard>

          <DriverCard title="Vehicle">
            {vehicles.isLoading ? <ActivityIndicator color="#0F52BA" /> : (vehicles.data ?? []).map((item) => (
              <Pressable key={item.id} style={[styles.choice, vehicle?.id === item.id && styles.choiceActive]} onPress={() => setVehicle(item)}>
                <Text style={styles.choiceTitle}>{item.vehicleName || item.vehicleType}</Text>
                <Text style={styles.choiceSub}>{item.vehicleNumber}</Text>
              </Pressable>
            ))}
          </DriverCard>

          <DriverCard title="Departure">
            <Field label="Date" value={date} onChange={setDate} placeholder="YYYY-MM-DD" />
            <Field label="Time" value={time} onChange={setTime} placeholder="HH:mm" />
            <Field label="Pickup point" value={pickupPoint} onChange={setPickupPoint} placeholder="Exact boarding area" />
          </DriverCard>

          <DriverCard title="Seats and fare">
            <View style={styles.twoCol}>
              <Field label="Front seats" value={frontSeats} onChange={(v) => setFrontSeats(v.replace(/\D/g, '').slice(0, 1))} keyboardType="number-pad" />
              <Field label="Back seats" value={backSeats} onChange={(v) => setBackSeats(v.replace(/\D/g, '').slice(0, 1))} keyboardType="number-pad" />
            </View>
            <View style={styles.twoCol}>
              <Field label="Front fare" value={frontFare} onChange={(v) => setFrontFare(v.replace(/\D/g, ''))} keyboardType="number-pad" />
              <Field label="Back fare" value={backFare} onChange={(v) => setBackFare(v.replace(/\D/g, ''))} keyboardType="number-pad" />
            </View>
          </DriverCard>

          <DriverCard title="Passenger notes">
            <Field label="Luggage policy" value={luggagePolicy} onChange={setLuggagePolicy} />
            <Field label="Notes" value={notes} onChange={setNotes} multiline />
          </DriverCard>
        </ScrollView>
        <View style={styles.footer}>
          <DriverButton label="Post trip" onPress={submit} loading={action.isPending} disabled={!canSubmit} />
        </View>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

function Field({ label, value, onChange, placeholder, keyboardType = 'default', multiline }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  keyboardType?: 'default' | 'number-pad';
  multiline?: boolean;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={[styles.input, multiline && styles.multiline]}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor="#98A2B3"
        keyboardType={keyboardType}
        multiline={multiline}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  safe: { flex: 1, backgroundColor: '#F8FAFC' },
  header: { flexDirection: 'row', alignItems: 'center', padding: 16, backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderColor: '#E4E7EC' },
  back: { width: 64 },
  backText: { color: '#0F52BA', fontWeight: '800' },
  title: { flex: 1, textAlign: 'center', fontSize: 18, fontWeight: '800', color: '#0F172A' },
  headerSpacer: { width: 64 },
  scroll: { padding: 16, gap: 14, paddingBottom: 24 },
  choice: { backgroundColor: '#F8FAFC', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#E4E7EC' },
  choiceActive: { borderColor: '#0F52BA', backgroundColor: '#EEF4FF' },
  choiceTitle: { color: '#0F172A', fontSize: 14, fontWeight: '800' },
  choiceSub: { color: '#667085', fontSize: 12, marginTop: 3 },
  field: { gap: 6 },
  label: { color: '#475467', fontSize: 12, fontWeight: '800' },
  input: { backgroundColor: '#F8FAFC', borderRadius: 12, borderWidth: 1, borderColor: '#E4E7EC', paddingHorizontal: 12, paddingVertical: 12, color: '#0F172A', fontSize: 15 },
  multiline: { minHeight: 88, textAlignVertical: 'top' },
  twoCol: { flexDirection: 'row', gap: 10 },
  footer: { padding: 16, backgroundColor: '#FFFFFF', borderTopWidth: 1, borderColor: '#E4E7EC' },
});
