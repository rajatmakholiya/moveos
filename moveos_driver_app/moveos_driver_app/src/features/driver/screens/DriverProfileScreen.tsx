import React from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DriverButton } from '@/features/driver/components/DriverButton';
import { DriverCard } from '@/features/driver/components/DriverCard';
import { useDriverDashboard } from '@/features/driver/api/driverClient';
import { useAuthStore } from '@/store/auth';

export default function DriverProfileScreen() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const dashboard = useDriverDashboard();

  const confirmLogout = () => {
    Alert.alert('Sign out?', 'You will need OTP to sign back in.', [
      { text: 'Cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => void logout() },
    ]);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.profileTop}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{user?.name?.[0]?.toUpperCase() ?? 'D'}</Text>
          </View>
          <Text style={styles.name}>{user?.name ?? 'Driver'}</Text>
          <Text style={styles.phone}>{user?.phone ?? ''}</Text>
        </View>

        <DriverCard title="Driver account" subtitle={`Role: ${user?.role ?? 'DRIVER'}`}>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Driver ID</Text>
            <Text style={styles.rowValue}>{user?.driverId ?? '-'}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Compliance</Text>
            <Text style={styles.rowValue}>{dashboard.data?.compliance.canAcceptBookings ? 'Ready' : 'Blocked'}</Text>
          </View>
        </DriverCard>

        <DriverCard title="Onboarding" subtitle="Native document upload screens can be added here. For now, profile completion follows backend status from dashboard." />

        <Pressable style={styles.dangerZone} onPress={confirmLogout}>
          <Text style={styles.dangerText}>Sign out</Text>
        </Pressable>
        <DriverButton label="Refresh profile" variant="secondary" onPress={() => void dashboard.refetch()} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F8FAFC' },
  scroll: { padding: 16, gap: 14, paddingBottom: 32 },
  profileTop: { alignItems: 'center', paddingVertical: 18 },
  avatar: { width: 76, height: 76, borderRadius: 38, backgroundColor: '#0F52BA', alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#FFFFFF', fontSize: 30, fontWeight: '800' },
  name: { marginTop: 12, color: '#0F172A', fontSize: 22, fontWeight: '800' },
  phone: { marginTop: 3, color: '#667085', fontSize: 14 },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, backgroundColor: '#F8FAFC', borderRadius: 12, padding: 12 },
  rowLabel: { color: '#667085', fontSize: 13, fontWeight: '700' },
  rowValue: { color: '#0F172A', fontSize: 13, fontWeight: '800' },
  dangerZone: { backgroundColor: '#FEE4E2', borderRadius: 14, paddingVertical: 14, alignItems: 'center', borderWidth: 1, borderColor: '#FDB4A8' },
  dangerText: { color: '#D92D20', fontWeight: '800' },
});
