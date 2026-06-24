import React, { useState } from 'react';
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';

import BackButton from '../../shared/components/BackButton';
import type { RootStackParamList } from '../../../navigation/types';
import { SafeAreaView } from 'react-native-safe-area-context';

type Navigation = NativeStackNavigationProp<RootStackParamList, 'RideComplete'>;
type Route = RouteProp<RootStackParamList, 'RideComplete'>;

const tips = ['₹10', '₹20', '₹50', 'Other'];

const RideCompleteScreen: React.FC = () => {
  const navigation = useNavigation<Navigation>();
  const { params } = useRoute<Route>();
  const [selectedTip, setSelectedTip] = useState('₹20');
  const [comment, setComment] = useState('');

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <BackButton variant="close" onPress={() => navigation.goBack()} />
        <Text style={styles.headerTitle}>Ride Summary</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.fareCard}>
          <View style={styles.fareIconWrap}>
            <Text style={styles.fareIcon}>🛡️</Text>
          </View>
          <Text style={styles.fareLabel}>Total Fare</Text>
          <Text style={styles.fareValue}>{params.fare}</Text>
          {params.promo ? <Text style={styles.farePromo}>{params.promo}</Text> : null}
        </View>

        <View style={styles.driverCard}>
          <Text style={styles.sectionTitle}>Driver</Text>
          <View style={styles.driverRow}>
            <Image source={{ uri: params.driver.avatar }} style={styles.avatar} />
            <View>
              <Text style={styles.driverName}>{params.driver.name}</Text>
              <Text style={styles.driverMeta}>Thank you for riding with Moveos</Text>
            </View>
          </View>
        </View>

        <View style={styles.breakdownCard}>
          <Text style={styles.sectionTitle}>Trip Breakdown</Text>
          {params.breakdown.map((item) => (
            <View key={item.label} style={styles.breakdownRow}>
              <Text style={styles.breakdownLabel}>{item.label}</Text>
              <Text style={styles.breakdownValue}>{item.value}</Text>
            </View>
          ))}
        </View>

        <View style={styles.paymentCard}>
          <Text style={styles.sectionTitle}>Payment Method</Text>
          <View style={styles.paymentRow}>
            <View>
              <Text style={styles.paymentMethod}>{params.paymentMethod}</Text>
              <Text style={styles.paymentNote}>Change or add methods later</Text>
            </View>
            <Text style={styles.check}>✔</Text>
          </View>
        </View>

        <View style={styles.tipCard}>
          <Text style={styles.sectionTitle}>Tip Driver</Text>
          <View style={styles.tipRow}>
            {tips.map((tip) => {
              const active = tip === selectedTip;
              return (
                <Pressable
                  key={tip}
                  style={[styles.tipChip, active ? styles.tipChipActive : null]}
                  onPress={() => setSelectedTip(tip)}
                >
                  <Text style={[styles.tipText, active ? styles.tipTextActive : null]}>
                    {tip}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <Pressable
          style={styles.confirmButton}
          onPress={() => navigation.navigate('AppShell', { ratingPrompt: true })}
        >
          <Text style={styles.confirmButtonText}>
            Complete Payment • {params.fare}
          </Text>
        </Pressable>
        <Text style={styles.footerNote}>Securely processed by Moveos Pay</Text>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
    flex: 1,
    textAlign: 'center',
  },
  content: {
    paddingHorizontal: 16,
    paddingBottom: 24,
    gap: 14,
  },
  fareCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    gap: 6,
    shadowColor: '#0F172A',
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 12,
    elevation: 5,
  },
  fareIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#E8F0FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fareIcon: {
    fontSize: 20,
  },
  fareLabel: {
    fontSize: 14,
    color: '#475467',
  },
  fareValue: {
    fontSize: 28,
    fontWeight: '800',
    color: '#0F172A',
  },
  farePromo: {
    fontSize: 13,
    color: '#0E8C5F',
  },
  driverCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    shadowColor: '#0F172A',
    shadowOpacity: 0.06,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 10,
    elevation: 4,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  driverRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 10,
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#EEF2F6',
  },
  driverName: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  driverMeta: {
    fontSize: 13,
    color: '#475467',
  },
  breakdownCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    shadowColor: '#0F172A',
    shadowOpacity: 0.06,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 10,
    elevation: 4,
    gap: 10,
  },
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  breakdownLabel: {
    fontSize: 14,
    color: '#475467',
  },
  breakdownValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  paymentCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    shadowColor: '#0F172A',
    shadowOpacity: 0.06,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 10,
    elevation: 4,
    gap: 8,
  },
  paymentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  paymentMethod: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
  },
  paymentNote: {
    fontSize: 12,
    color: '#98A2B3',
  },
  check: {
    fontSize: 18,
    color: '#0F52BA',
  },
  tipCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    shadowColor: '#0F172A',
    shadowOpacity: 0.06,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 10,
    elevation: 4,
    gap: 8,
  },
  tipRow: {
    flexDirection: 'row',
    gap: 10,
  },
  tipChip: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E4E7EC',
    backgroundColor: '#F8FAFC',
  },
  tipChipActive: {
    borderColor: '#0F52BA',
    backgroundColor: '#E8F0FF',
  },
  tipText: {
    color: '#475467',
    fontWeight: '700',
  },
  tipTextActive: {
    color: '#0F52BA',
  },
  ratingCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    shadowColor: '#0F172A',
    shadowOpacity: 0.06,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 10,
    elevation: 4,
    gap: 10,
  },
  starsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  star: {
    fontSize: 28,
    color: '#D0D5DD',
  },
  starActive: {
    color: '#0F52BA',
  },
  comment: {
    minHeight: 90,
    borderWidth: 1,
    borderColor: '#E4E7EC',
    borderRadius: 12,
    padding: 10,
    textAlignVertical: 'top',
    color: '#0F172A',
  },
  confirmButton: {
    marginTop: 6,
    backgroundColor: '#0F52BA',
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
    shadowColor: '#0F172A',
    shadowOpacity: 0.12,
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 12,
    elevation: 6,
  },
  confirmButtonText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 16,
  },
  footerNote: {
    textAlign: 'center',
    color: '#98A2B3',
    marginTop: 4,
  },
});

export default RideCompleteScreen;
