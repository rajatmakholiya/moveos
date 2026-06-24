import React, { useMemo, useState } from 'react';
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';

import BackButton from '../../shared/components/BackButton';
import type { RootStackParamList } from '../../../navigation/types';

type Navigation = NativeStackNavigationProp<RootStackParamList, 'PaymentMethods'>;
type Route = RouteProp<RootStackParamList, 'PaymentMethods'>;

type Method = {
  id: string;
  title: string;
  subtitle: string;
  group: 'UPI' | 'Wallets' | 'Cards' | 'Others';
  icon: string;
  balance?: string;
};

const PaymentMethodsScreen: React.FC = () => {
  const navigation = useNavigation<Navigation>();
  const { params } = useRoute<Route>();
  const [selected, setSelected] = useState(params?.selectedId ?? 'gpay');

  const methods = useMemo<Method[]>(() => {
    return [
      {
        id: 'gpay',
        title: 'Google Pay',
        subtitle: 'Fast & Secure',
        group: 'UPI',
        icon: 'https://cdn-icons-png.flaticon.com/512/6124/6124990.png',
      },
      {
        id: 'phonepe',
        title: 'PhonePe',
        subtitle: 'Pay directly from bank',
        group: 'UPI',
        icon: 'https://cdn-icons-png.flaticon.com/512/8258/8258626.png',
      },
      {
        id: 'wallet',
        title: 'Moveos Wallet',
        subtitle: '₹450.00',
        group: 'Wallets',
        icon: 'https://cdn-icons-png.flaticon.com/512/649/649395.png',
        balance: '₹450.00',
      },
      {
        id: 'paytm',
        title: 'Paytm',
        subtitle: 'Linked',
        group: 'Wallets',
        icon: 'https://cdn-icons-png.flaticon.com/512/6124/6124995.png',
      },
      {
        id: 'visa',
        title: 'Visa ending in 1234',
        subtitle: 'Personal Account',
        group: 'Cards',
        icon: 'https://cdn-icons-png.flaticon.com/512/196/196578.png',
      },
      {
        id: 'cash',
        title: 'Cash',
        subtitle: 'Pay at drop-off',
        group: 'Others',
        icon: 'https://cdn-icons-png.flaticon.com/512/1170/1170678.png',
      },
    ];
  }, []);

  const grouped = useMemo(() => {
    const groups: Record<string, Method[]> = {};
    methods.forEach((m) => {
      groups[m.group] = groups[m.group] ? [...groups[m.group], m] : [m];
    });
    return groups;
  }, [methods]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <BackButton onPress={() => navigation.goBack()} />
        <Text style={styles.headerTitle}>Select Payment Method</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {Object.entries(grouped).map(([group, items]) => (
          <View key={group} style={{ gap: 10 }}>
            <Text style={styles.groupLabel}>{group}</Text>
            {items.map((item) => {
              const isActive = item.id === selected;
              return (
                <Pressable
                  key={item.id}
                  style={[styles.card, isActive ? styles.cardActive : null]}
                  onPress={() => setSelected(item.id)}
                >
                  <Image source={{ uri: item.icon }} style={styles.icon} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardTitle}>{item.title}</Text>
                    <Text style={styles.cardSubtitle}>
                      {item.balance ? item.balance : item.subtitle}
                    </Text>
                  </View>
                  <View style={[styles.radio, isActive ? styles.radioActive : null]}>
                    {isActive ? <View style={styles.radioInner} /> : null}
                  </View>
                </Pressable>
              );
            })}
          </View>
        ))}
      </ScrollView>

      <View style={styles.footer}>
        <Pressable style={styles.addButton}>
          <Text style={styles.addButtonText}>＋ Add New Payment Method</Text>
        </Pressable>
        <Pressable
          style={styles.confirm}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.confirmText}>Use Selected</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#FFFFFF',
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
    paddingBottom: 20,
    gap: 16,
  },
  groupLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#98A2B3',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E4E7EC',
    gap: 12,
    shadowColor: '#0F172A',
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 10,
    elevation: 3,
  },
  cardActive: {
    borderColor: '#0F52BA',
    shadowOpacity: 0.12,
  },
  icon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#EEF2F6',
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  cardSubtitle: {
    fontSize: 13,
    color: '#475467',
    marginTop: 2,
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: '#D0D5DD',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioActive: {
    borderColor: '#0F52BA',
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#0F52BA',
  },
  footer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 10,
    borderTopWidth: 1,
    borderColor: '#EEF2F6',
  },
  addButton: {
    backgroundColor: '#E8F0FF',
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
  },
  addButtonText: {
    color: '#0F52BA',
    fontWeight: '800',
  },
  confirm: {
    backgroundColor: '#0F52BA',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    shadowColor: '#0F172A',
    shadowOpacity: 0.12,
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 12,
    elevation: 5,
  },
  confirmText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 16,
  },
});

export default PaymentMethodsScreen;
