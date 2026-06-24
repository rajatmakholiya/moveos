import React, { useMemo } from 'react';
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import BackButton from '../../shared/components/BackButton';

type LinkedAccount = {
  id: string;
  title: string;
  subtitle: string;
  icon: string;
};

type Activity = {
  id: string;
  title: string;
  timestamp: string;
  amount: string;
  status: 'success' | 'pending' | 'failed';
  icon: string;
};

const WalletScreen: React.FC = () => {
  const navigation = useNavigation();
  const linkedAccounts = useMemo<LinkedAccount[]>(
    () => [
      {
        id: 'gpay',
        title: 'Google Pay / PhonePe',
        subtitle: 'Linked via UPI (Primary)',
        icon: 'https://cdn-icons-png.flaticon.com/512/6124/6124990.png',
      },
      {
        id: 'hdfc',
        title: 'HDFC Bank • • • • 4582',
        subtitle: 'Expires 12/26',
        icon: 'https://cdn-icons-png.flaticon.com/512/854/854878.png',
      },
    ],
    [],
  );

  const activity = useMemo<Activity[]>(
    () => [
      {
        id: 'ride1',
        title: 'Ride to Indiranagar',
        timestamp: 'Today, 02:15 PM',
        amount: '- ₹342.00',
        status: 'success',
        icon: 'https://cdn-icons-png.flaticon.com/512/744/744465.png',
      },
      {
        id: 'topup1',
        title: 'Wallet Top-up',
        timestamp: 'Yesterday, 10:30 AM',
        amount: '+ ₹1,000.00',
        status: 'success',
        icon: 'https://cdn-icons-png.flaticon.com/512/1828/1828817.png',
      },
    ],
    [],
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <BackButton onPress={() => navigation.goBack()} />
        <Text style={styles.headerTitle}>Wallet & Payments</Text>
        <Pressable hitSlop={8} style={styles.headerAction}>
          <Text style={styles.headerIcon}>?</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.balanceCard}>
          <View>
            <Text style={styles.balanceLabel}>Available Balance</Text>
            <Text style={styles.balanceValue}>₹1,240.50</Text>
            <Text style={styles.balanceSub}>Moveos Digital Wallet</Text>
            <View style={styles.securePill}>
              <Text style={styles.secureIcon}>🛡️</Text>
              <Text style={styles.secureText}>Securely Encrypted</Text>
            </View>
          </View>
          <Pressable style={styles.addMoney}>
            <Text style={styles.addMoneyText}>Add Money</Text>
          </Pressable>
        </View>

        <Text style={styles.sectionTitle}>Linked Accounts</Text>
        <View style={styles.cardList}>
          {linkedAccounts.map((item) => (
            <Pressable key={item.id} style={styles.accountCard}>
              <Image source={{ uri: item.icon }} style={styles.accountIcon} />
              <View style={{ flex: 1 }}>
                <Text style={styles.accountTitle}>{item.title}</Text>
                <Text style={styles.accountSubtitle}>{item.subtitle}</Text>
              </View>
              <Text style={styles.chevron}>›</Text>
            </Pressable>
          ))}
          <Pressable style={styles.linkNew}>
            <Text style={styles.linkNewText}>＋ Link New Account</Text>
          </Pressable>
        </View>

        <View style={styles.activityHeader}>
          <Text style={styles.sectionTitle}>Recent Activity</Text>
          <Pressable>
            <Text style={styles.link}>View All</Text>
          </Pressable>
        </View>
        <View style={styles.cardList}>
          {activity.map((item) => (
            <View key={item.id} style={styles.activityRow}>
              <Image source={{ uri: item.icon }} style={styles.activityIcon} />
              <View style={{ flex: 1 }}>
                <Text style={styles.activityTitle}>{item.title}</Text>
                <Text style={styles.activityTime}>{item.timestamp}</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text
                  style={[
                    styles.activityAmount,
                    item.amount.startsWith('-')
                      ? { color: '#D92D20' }
                      : { color: '#0E8C5F' },
                  ]}
                >
                  {item.amount}
                </Text>
                <Text style={styles.activityStatus}>SUCCESS</Text>
              </View>
            </View>
          ))}
        </View>
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
  headerAction: {
    width: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerIcon: {
    fontSize: 18,
    color: '#0F172A',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
    flex: 1,
    textAlign: 'center',
  },
  content: {
    padding: 16,
    gap: 14,
    paddingBottom: 30,
  },
  balanceCard: {
    backgroundColor: '#0F52BA',
    borderRadius: 18,
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    shadowColor: '#0F172A',
    shadowOpacity: 0.16,
    shadowOffset: { width: 0, height: 10 },
    shadowRadius: 18,
    elevation: 8,
  },
  balanceLabel: {
    color: '#E0EAFF',
    fontWeight: '700',
    letterSpacing: 0.2,
    textTransform: 'uppercase',
    fontSize: 12,
  },
  balanceValue: {
    marginTop: 6,
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '800',
  },
  balanceSub: {
    color: '#DCE7FF',
    marginTop: 4,
    fontSize: 14,
  },
  securePill: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.16)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
  },
  secureIcon: {
    color: '#FFFFFF',
  },
  secureText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  addMoney: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    shadowColor: '#0F172A',
    shadowOpacity: 0.12,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 10,
    elevation: 6,
  },
  addMoneyText: {
    color: '#0F52BA',
    fontWeight: '800',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  cardList: {
    gap: 10,
  },
  accountCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    padding: 14,
    borderRadius: 14,
    shadowColor: '#0F172A',
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 10,
    elevation: 3,
    gap: 12,
  },
  accountIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#EEF2F6',
  },
  accountTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
  },
  accountSubtitle: {
    fontSize: 13,
    color: '#475467',
    marginTop: 2,
  },
  chevron: {
    fontSize: 20,
    color: '#98A2B3',
  },
  linkNew: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#CBD5E1',
    padding: 14,
    borderRadius: 14,
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
  },
  linkNewText: {
    color: '#0F52BA',
    fontWeight: '800',
  },
  activityHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  link: {
    color: '#0F52BA',
    fontWeight: '800',
  },
  activityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#FFFFFF',
    padding: 14,
    borderRadius: 14,
    shadowColor: '#0F172A',
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 10,
    elevation: 3,
  },
  activityIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#EEF2F6',
  },
  activityTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
  },
  activityTime: {
    fontSize: 13,
    color: '#475467',
  },
  activityAmount: {
    fontSize: 15,
    fontWeight: '800',
  },
  activityStatus: {
    marginTop: 4,
    fontSize: 12,
    color: '#0E8C5F',
    fontWeight: '700',
  },
});

export default WalletScreen;
