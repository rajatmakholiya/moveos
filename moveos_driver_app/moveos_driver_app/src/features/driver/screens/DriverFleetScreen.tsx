import React from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DriverCard } from '@/features/driver/components/DriverCard';
import { useDriverDashboard, useDriverVehicles } from '@/features/driver/api/driverClient';

export default function DriverFleetScreen() {
  const dashboard = useDriverDashboard();
  const vehicles = useDriverVehicles();
  const refreshing = dashboard.isFetching || vehicles.isFetching;

  const refresh = () => {
    void dashboard.refetch();
    void vehicles.refetch();
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}>
        <View>
          <Text style={styles.title}>Fleet</Text>
          <Text style={styles.subtitle}>Organizations, operating contexts, and assigned vehicles.</Text>
        </View>

        {dashboard.isLoading ? <ActivityIndicator color="#0F52BA" /> : (
          <DriverCard title="Operating contexts">
            {(dashboard.data?.contexts ?? []).length === 0 ? (
              <Text style={styles.empty}>No organization contexts returned yet.</Text>
            ) : dashboard.data?.contexts.map((context) => (
              <View key={context.id} style={styles.row}>
                <View>
                  <Text style={styles.rowTitle}>{context.label}</Text>
                  <Text style={styles.rowSub}>{context.type} · {context.activeVehicleCount} vehicles</Text>
                </View>
                <Text style={[styles.status, context.canOperate ? styles.ready : styles.blocked]}>
                  {context.canOperate ? 'Ready' : 'Blocked'}
                </Text>
              </View>
            ))}
          </DriverCard>
        )}

        <DriverCard title="Vehicles">
          {vehicles.isLoading ? <ActivityIndicator color="#0F52BA" /> : (vehicles.data ?? []).length === 0 ? (
            <Text style={styles.empty}>No vehicles assigned yet. Complete driver onboarding or contact fleet admin.</Text>
          ) : vehicles.data?.map((vehicle) => (
            <View key={vehicle.id} style={styles.row}>
              <View>
                <Text style={styles.rowTitle}>{vehicle.vehicleName || vehicle.vehicleType}</Text>
                <Text style={styles.rowSub}>{vehicle.vehicleNumber}</Text>
              </View>
              <Text style={[styles.status, vehicle.isActive ? styles.ready : styles.blocked]}>
                {vehicle.isActive ? 'Active' : 'Inactive'}
              </Text>
            </View>
          ))}
        </DriverCard>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F8FAFC' },
  scroll: { padding: 16, gap: 14, paddingBottom: 32 },
  title: { fontSize: 24, fontWeight: '800', color: '#0F172A' },
  subtitle: { marginTop: 4, color: '#667085', fontSize: 14 },
  empty: { color: '#667085', fontSize: 13 },
  row: { backgroundColor: '#F8FAFC', borderRadius: 12, padding: 12, flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  rowTitle: { color: '#0F172A', fontWeight: '800', fontSize: 14 },
  rowSub: { color: '#667085', fontSize: 12, marginTop: 3 },
  status: { fontSize: 12, fontWeight: '800' },
  ready: { color: '#0E8C5F' },
  blocked: { color: '#D92D20' },
});
