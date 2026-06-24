import React from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';

import { useAuthStore } from '@/store/auth';
import { useLanguageStore } from '@/store/language';
import { useWalletBalance } from '@/features/profile/hooks/useWalletBalance';
import { formatPaise } from '@/utils/currency';
import type { RootStackParamList } from '@/navigation/types';
import type { Lang } from '@/types';

type Navigation = NativeStackNavigationProp<RootStackParamList, 'AppShell'>;

const ProfileScreen: React.FC = () => {
  const navigation = useNavigation<Navigation>();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const lang = useLanguageStore((s) => s.lang);
  const setLang = useLanguageStore((s) => s.setLang);
  const tx = useLanguageStore((s) => s.tx);
  const queryClient = useQueryClient();

  const { data: balance, isLoading: balanceLoading } = useWalletBalance();

  const initial = user?.name?.trim()?.[0]?.toUpperCase() ?? 'U';

  const handleLogout = () => {
    Alert.alert('Logout', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Logout',
        style: 'destructive',
        onPress: async () => {
          await logout();
          queryClient.clear();
          navigation.reset({ index: 0, routes: [{ name: 'AuthPhoneEntry' }] });
        },
      },
    ]);
  };

  const handleLang = (next: Lang) => {
    void setLang(next);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.headerTitle}>{tx('profile_title')}</Text>

        {/* Hero — real user */}
        <View style={styles.hero}>
          <View style={styles.avatar}>
            <Text style={styles.avatarLetter}>{initial}</Text>
          </View>
          <Text style={styles.name}>{user?.name ?? 'Guest user'}</Text>
          {!!user?.phone && <Text style={styles.phone}>+91 {user.phone}</Text>}
          {!!user?.role && (
            <View style={styles.roleBadge}>
              <Text style={styles.roleBadgeText}>{user.role}</Text>
            </View>
          )}
        </View>

        {/* Wallet */}
        <View style={styles.walletCard}>
          <View>
            <Text style={styles.walletLabel}>{tx('profile_wallet_balance')}</Text>
            {balanceLoading ? (
              <ActivityIndicator color="#FFFFFF" style={{ marginTop: 6, alignSelf: 'flex-start' }} />
            ) : (
              <Text style={styles.walletValue}>{formatPaise(balance ?? 0)}</Text>
            )}
          </View>
          <Text style={styles.walletIcon}>💳</Text>
        </View>

        {/* Language toggle */}
        <Text style={styles.sectionTitle}>{tx('profile_language')}</Text>
        <View style={styles.langRow}>
          {(['en', 'hi'] as Lang[]).map((l) => (
            <Pressable
              key={l}
              style={[styles.langChip, lang === l && styles.langChipActive]}
              onPress={() => handleLang(l)}
            >
              <Text style={[styles.langChipText, lang === l && styles.langChipTextActive]}>
                {l === 'en' ? 'English' : 'हिन्दी'}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Menu */}
        <Text style={styles.sectionTitle}>Account</Text>
        <View style={styles.menu}>
          <MenuRow
            icon="🧾"
            title="My Bookings"
            onPress={() => navigation.navigate('AppShell')}
          />
          <MenuRow
            icon="➕"
            title="Request a ride"
            onPress={() => navigation.navigate('RequestsNew')}
          />
          <MenuRow icon="🛟" title="Help & Support" onPress={() => {}} />
        </View>

        {/* Logout */}
        <Pressable style={styles.logout} onPress={handleLogout}>
          <Text style={styles.logoutText}>{tx('profile_logout')}</Text>
        </Pressable>
        <Text style={styles.version}>Moveos v0.1 · Made for India</Text>
      </ScrollView>
    </SafeAreaView>
  );
};

const MenuRow: React.FC<{ icon: string; title: string; onPress: () => void }> = ({
  icon,
  title,
  onPress,
}) => (
  <Pressable style={styles.menuRow} onPress={onPress}>
    <Text style={styles.menuIcon}>{icon}</Text>
    <Text style={styles.menuTitle}>{title}</Text>
    <Text style={styles.menuChevron}>›</Text>
  </Pressable>
);

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F8FAFC' },
  content: { padding: 20, paddingBottom: 40 },

  headerTitle: { fontSize: 24, fontWeight: '800', color: '#0F172A', marginBottom: 16 },

  hero: { alignItems: 'center', gap: 6, paddingVertical: 12 },
  avatar: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: '#0F52BA',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0F52BA',
    shadowOpacity: 0.3,
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 14,
    elevation: 6,
  },
  avatarLetter: { fontSize: 36, fontWeight: '800', color: '#FFFFFF' },
  name: { fontSize: 20, fontWeight: '800', color: '#0F172A', marginTop: 6 },
  phone: { fontSize: 14, color: '#475467' },
  roleBadge: {
    backgroundColor: '#EEF4FF',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 4,
    marginTop: 4,
  },
  roleBadgeText: { fontSize: 12, fontWeight: '800', color: '#0F52BA', letterSpacing: 0.5 },

  walletCard: {
    marginTop: 20,
    backgroundColor: '#0F52BA',
    borderRadius: 18,
    padding: 18,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    shadowColor: '#0F52BA',
    shadowOpacity: 0.25,
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 14,
    elevation: 6,
  },
  walletLabel: { color: '#A8C0FF', fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  walletValue: { color: '#FFFFFF', fontSize: 28, fontWeight: '800', marginTop: 4 },
  walletIcon: { fontSize: 32 },

  sectionTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 24,
    marginBottom: 10,
  },

  langRow: { flexDirection: 'row', gap: 10 },
  langChip: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#E4E7EC',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
  },
  langChipActive: { borderColor: '#0F52BA', backgroundColor: '#EEF4FF' },
  langChipText: { fontSize: 15, fontWeight: '700', color: '#475467' },
  langChipTextActive: { color: '#0F52BA' },

  menu: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E4E7EC',
    overflow: 'hidden',
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 12,
    borderBottomWidth: 1,
    borderColor: '#F2F4F7',
  },
  menuIcon: { fontSize: 20 },
  menuTitle: { flex: 1, fontSize: 15, fontWeight: '700', color: '#0F172A' },
  menuChevron: { fontSize: 22, color: '#98A2B3' },

  logout: {
    marginTop: 24,
    borderWidth: 1,
    borderColor: '#FDB4A8',
    backgroundColor: '#FEE4E2',
    borderRadius: 14,
    alignItems: 'center',
    paddingVertical: 15,
  },
  logoutText: { color: '#D92D20', fontWeight: '800', fontSize: 15 },
  version: { textAlign: 'center', fontSize: 12, color: '#98A2B3', marginTop: 16 },
});

export default ProfileScreen;
