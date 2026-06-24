import React from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import BackButton from '../../shared/components/BackButton';
import type { RootStackParamList } from '../../../navigation/types';

type Navigation = NativeStackNavigationProp<RootStackParamList, 'RideScheduler'>;

const RideSchedulerScreen: React.FC = () => {
  const navigation = useNavigation<Navigation>();

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.dragHandle} />
      <View style={styles.header}>
        <BackButton variant="close" onPress={() => navigation.goBack()} />
        <Text style={styles.title}>Schedule a Ride</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.row}>
          {['Today', 'Tomorrow', 'Fri', 'Sat'].map((label, idx) => (
            <View key={label} style={[styles.datePill, idx === 0 ? styles.datePillActive : null]}>
              <Text style={[styles.datePillLabel, idx === 0 ? styles.datePillLabelActive : null]}>
                {label}
              </Text>
              <Text style={[styles.datePillDay, idx === 0 ? styles.datePillDayActive : null]}>
                {25 + idx}
              </Text>
              <Text style={[styles.datePillSub, idx === 0 ? styles.datePillLabelActive : null]}>
                OCT
              </Text>
            </View>
          ))}
        </View>

        <View style={styles.timeWheel}>
          <Text style={styles.timeText}>08 : 30 PM</Text>
          <Text style={styles.timeHint}>Driver will be assigned closer to pickup</Text>
        </View>

        <Pressable
          style={styles.cta}
          onPress={() => navigation.navigate('RideSelector', { pickup: 'Terminal 2', dropoff: 'Bandra West' })}
        >
          <Text style={styles.ctaText}>Set Pickup Time</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  dragHandle: {
    alignSelf: 'center',
    width: 80,
    height: 6,
    borderRadius: 99,
    marginTop: 8,
    backgroundColor: '#E4E7EC',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
    flex: 1,
    textAlign: 'center',
  },
  content: {
    padding: 20,
    gap: 20,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  datePill: {
    flex: 1,
    borderRadius: 18,
    paddingVertical: 14,
    backgroundColor: '#F2F4F7',
    alignItems: 'center',
    gap: 4,
  },
  datePillActive: {
    backgroundColor: '#0F52BA',
    shadowColor: '#0F172A',
    shadowOpacity: 0.12,
    shadowOffset: { width: 0, height: 10 },
    shadowRadius: 14,
    elevation: 6,
  },
  datePillLabel: {
    fontSize: 12,
    color: '#475467',
    fontWeight: '700',
  },
  datePillLabelActive: {
    color: '#FFFFFF',
  },
  datePillDay: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0F172A',
  },
  datePillDayActive: {
    color: '#FFFFFF',
  },
  datePillSub: {
    fontSize: 12,
    color: '#475467',
    fontWeight: '700',
  },
  timeWheel: {
    borderRadius: 16,
    paddingVertical: 20,
    backgroundColor: '#F2F4F7',
    alignItems: 'center',
    gap: 8,
  },
  timeText: {
    fontSize: 28,
    fontWeight: '800',
    color: '#0F172A',
  },
  timeHint: {
    fontSize: 13,
    color: '#475467',
  },
  cta: {
    backgroundColor: '#0F52BA',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    shadowColor: '#0F172A',
    shadowOpacity: 0.12,
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 14,
    elevation: 6,
  },
  ctaText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 16,
  },
});

export default RideSchedulerScreen;
