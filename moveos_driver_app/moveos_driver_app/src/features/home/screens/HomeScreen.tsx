import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { useRoutes } from '@/features/trips/hooks/useRoutes';
import { usePassengerBookings } from '@/features/booking/hooks/usePassengerBookings';
import { useAuthStore } from '@/store/auth';
import { useLanguageStore } from '@/store/language';
import { formatDateForApi, formatDayOfWeek, formatDayNum, formatDateTime, getNext31Days } from '@/utils/date';
import { formatPaise } from '@/utils/currency';
import type { RootStackParamList } from '@/navigation/types';
import type { RouteOption } from '@/types';

type Navigation = NativeStackNavigationProp<RootStackParamList, 'AppShell'>;

const DAYS = getNext31Days();

// ─── City Picker Modal ────────────────────────────────────────────────────────

type CityPickerModalProps = {
  visible: boolean;
  title: string;
  cities: string[];
  onSelect: (city: string) => void;
  onClose: () => void;
};

function CityPickerModal({ visible, title, cities, onSelect, onClose }: CityPickerModalProps) {
  const [query, setQuery] = useState('');
  const filtered = cities.filter((c) => c.toLowerCase().includes(query.toLowerCase()));

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={cpStyles.safeArea} edges={['top']}>
        <View style={cpStyles.header}>
          <Text style={cpStyles.title}>{title}</Text>
          <Pressable onPress={onClose} hitSlop={12}>
            <Text style={cpStyles.close}>✕</Text>
          </Pressable>
        </View>
        <View style={cpStyles.searchBox}>
          <Text style={cpStyles.searchIcon}>🔍</Text>
          <TextInput
            style={cpStyles.searchInput}
            placeholder="Search city…"
            placeholderTextColor="#98A2B3"
            value={query}
            onChangeText={setQuery}
            autoFocus
          />
        </View>
        <FlatList
          data={filtered}
          keyExtractor={(item) => item}
          renderItem={({ item }) => (
            <Pressable
              style={cpStyles.cityRow}
              onPress={() => { onSelect(item); setQuery(''); onClose(); }}
            >
              <Text style={cpStyles.cityIcon}>📍</Text>
              <Text style={cpStyles.cityName}>{item}</Text>
            </Pressable>
          )}
          ItemSeparatorComponent={() => <View style={cpStyles.sep} />}
          ListEmptyComponent={<Text style={cpStyles.empty}>No cities found</Text>}
        />
      </SafeAreaView>
    </Modal>
  );
}

// ─── Home Screen ──────────────────────────────────────────────────────────────

const HomeScreen: React.FC = () => {
  const navigation = useNavigation<Navigation>();
  const tx = useLanguageStore((s) => s.tx);
  const user = useAuthStore((s) => s.user);
  const { data: routes, isLoading: loadingRoutes, refetch: refetchRoutes } = useRoutes();
  const { data: bookingsData, refetch: refetchBookings } = usePassengerBookings();

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([refetchRoutes(), refetchBookings()]);
    } finally {
      setRefreshing(false);
    }
  }, [refetchRoutes, refetchBookings]);

  const [fromCity, setFromCity] = useState('');
  const [toCity, setToCity] = useState('');
  const [selectedDateIdx, setSelectedDateIdx] = useState(0);
  const [showFromPicker, setShowFromPicker] = useState(false);
  const [showToPicker, setShowToPicker] = useState(false);

  const selectedDate = DAYS[selectedDateIdx];

  const fromCities = useMemo(
    () => [...new Set((routes ?? []).map((r) => r.from).filter((c): c is string => !!c))].sort(),
    [routes],
  );

  const toCities = useMemo(
    () =>
      [...new Set((routes ?? []).filter((r) => r.from === fromCity).map((r) => r.to).filter((c): c is string => !!c))].sort(),
    [routes, fromCity],
  );

  const selectedRoute: RouteOption | undefined = useMemo(
    () => (routes ?? []).find((r) => r.from === fromCity && r.to === toCity),
    [routes, fromCity, toCity],
  );

  const canSearch = !!(selectedRoute && fromCity && toCity);

  const upcomingBooking = bookingsData?.upcomingBookings?.[0] ?? null;

  const popularRoutes = useMemo(() => (routes ?? []).slice(0, 5), [routes]);

  const handleSwap = () => {
    const prev = fromCity;
    setFromCity(toCity);
    setToCity(prev);
  };

  const handleSearch = () => {
    if (!selectedRoute) return;
    navigation.navigate('TripList', {
      routeId: selectedRoute.id,
      date: formatDateForApi(selectedDate),
      from: fromCity,
      to: toCity,
    });
  };

  const handlePopularRoute = (route: RouteOption) => {
    setFromCity(route.from);
    setToCity(route.to);
    navigation.navigate('TripList', {
      routeId: route.id,
      date: formatDateForApi(selectedDate),
      from: route.from,
      to: route.to,
    });
  };

  const handleRequest = (type: 'FULL_VEHICLE' | 'PARCEL') => {
    if (!selectedRoute) return;
    navigation.navigate('RequestsNew', {
      type,
      routeId: selectedRoute.id,
      from: selectedRoute.from,
      to: selectedRoute.to,
      date: formatDateForApi(selectedDate),
    });
  };

  const greeting = useMemo(() => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  }, []);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* City Picker Modals */}
      <CityPickerModal
        visible={showFromPicker}
        title="Select departure city"
        cities={fromCities}
        onSelect={(c) => { setFromCity(c); if (toCity && c === toCity) setToCity(''); }}
        onClose={() => setShowFromPicker(false)}
      />
      <CityPickerModal
        visible={showToPicker}
        title="Select destination city"
        cities={toCities}
        onSelect={setToCity}
        onClose={() => setShowToPicker(false)}
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#0F52BA"
            colors={['#0F52BA']}
          />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>{greeting}{user?.name ? `, ${user.name.split(' ')[0]}` : ''} 👋</Text>
            <Text style={styles.tagline}>Book intercity shared rides</Text>
          </View>
          <View style={styles.avatarCircle}>
            <Text style={styles.avatarLetter}>
              {user?.name?.[0]?.toUpperCase() ?? 'M'}
            </Text>
          </View>
        </View>

        {/* Search Card */}
        <View style={styles.searchCard}>
          {/* From */}
          <Pressable style={styles.cityRow} onPress={() => setShowFromPicker(true)}>
            <View style={[styles.dot, styles.dotGreen]} />
            <View style={styles.cityTextWrap}>
              <Text style={styles.cityLabel}>{tx('home_from')}</Text>
              <Text style={[styles.cityValue, !fromCity && styles.cityPlaceholder]}>
                {fromCity || 'Select city'}
              </Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </Pressable>

          {/* Swap button */}
          <View style={styles.swapRow}>
            <View style={styles.dividerLine} />
            <Pressable style={styles.swapButton} onPress={handleSwap}>
              <Text style={styles.swapIcon}>⇅</Text>
            </Pressable>
            <View style={styles.dividerLine} />
          </View>

          {/* To */}
          <Pressable
            style={styles.cityRow}
            onPress={() => { if (!fromCity) { setShowFromPicker(true); } else { setShowToPicker(true); } }}
          >
            <View style={[styles.dot, styles.dotBlue]} />
            <View style={styles.cityTextWrap}>
              <Text style={styles.cityLabel}>{tx('home_to')}</Text>
              <Text style={[styles.cityValue, !toCity && styles.cityPlaceholder]}>
                {toCity || (fromCity ? 'Select destination' : 'Pick departure first')}
              </Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </Pressable>

          {selectedRoute && (
            <View style={styles.routeMeta}>
              <Text style={styles.routeMetaText}>
                🕐 {selectedRoute.durationHours}h · {selectedRoute.distanceKm} km
              </Text>
            </View>
          )}
        </View>

        {/* Date Selector */}
        <Text style={styles.sectionTitle}>{tx('home_date')}</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.dateScroll}
          contentContainerStyle={styles.dateScrollContent}
        >
          {DAYS.map((day, idx) => {
            const active = idx === selectedDateIdx;
            return (
              <Pressable
                key={idx}
                style={[styles.dateChip, active && styles.dateChipActive]}
                onPress={() => setSelectedDateIdx(idx)}
              >
                <Text style={[styles.dateDow, active && styles.dateDowActive]}>
                  {idx === 0 ? 'Today' : idx === 1 ? 'Tmrw' : formatDayOfWeek(day)}
                </Text>
                <Text style={[styles.dateNum, active && styles.dateNumActive]}>
                  {formatDayNum(day)}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* Search Button */}
        <Pressable
          style={[styles.searchBtn, !canSearch && styles.searchBtnDisabled]}
          onPress={handleSearch}
          disabled={!canSearch}
        >
          {loadingRoutes ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.searchBtnText}>
              {canSearch
                ? `${tx('home_search_button')} →`
                : fromCity
                ? 'Select destination to search'
                : tx('home_search_button')}
            </Text>
          )}
        </Pressable>

        {/* Customer modes */}
        <Text style={styles.sectionTitle}>What do you need?</Text>
        <View style={styles.modeGrid}>
          <Pressable
            style={[styles.modeCard, styles.modeCardActive, !canSearch && styles.modeCardDisabled]}
            onPress={handleSearch}
            disabled={!canSearch}
          >
            <Text style={styles.modeIcon}>⌁</Text>
            <Text style={styles.modeTitle}>Single seat</Text>
            <Text style={styles.modeSub}>Book pickup-wise seats</Text>
          </Pressable>
          <Pressable
            style={[styles.modeCard, !canSearch && styles.modeCardDisabled]}
            onPress={() => handleRequest('FULL_VEHICLE')}
            disabled={!canSearch}
          >
            <Text style={styles.modeIcon}>▣</Text>
            <Text style={styles.modeTitle}>Full vehicle</Text>
            <Text style={styles.modeSub}>Family or business trip</Text>
          </Pressable>
          <Pressable
            style={[styles.modeCard, !canSearch && styles.modeCardDisabled]}
            onPress={() => handleRequest('PARCEL')}
            disabled={!canSearch}
          >
            <Text style={styles.modeIcon}>□</Text>
            <Text style={styles.modeTitle}>Parcel</Text>
            <Text style={styles.modeSub}>Request a quote</Text>
          </Pressable>
        </View>

        {/* Upcoming trip banner */}
        {upcomingBooking && (
          <Pressable
            style={styles.upcomingCard}
            onPress={() => navigation.navigate('Ticket', { bookingId: upcomingBooking.id })}
          >
            <View style={styles.upcomingLeft}>
              <Text style={styles.upcomingBadge}>Upcoming Trip</Text>
              <Text style={styles.upcomingRoute}>
                {upcomingBooking.from} → {upcomingBooking.to}
              </Text>
              <Text style={styles.upcomingMeta}>{formatDateTime(upcomingBooking.departureAt)}</Text>
            </View>
            <View style={styles.upcomingRight}>
              <Text style={styles.upcomingAmount}>{formatPaise(upcomingBooking.totalPaise)}</Text>
              <Text style={styles.upcomingCode}>{upcomingBooking.code}</Text>
            </View>
          </Pressable>
        )}

        {bookingsData?.ongoingBookings?.[0] && (
          <Pressable
            style={styles.liveTripCard}
            onPress={() => navigation.navigate('PassengerTracking', { bookingId: bookingsData.ongoingBookings[0].id })}
          >
            <View style={styles.livePulse} />
            <View style={{ flex: 1 }}>
              <Text style={styles.liveTitle}>Trip in progress</Text>
              <Text style={styles.liveSub}>
                {bookingsData.ongoingBookings[0].from} → {bookingsData.ongoingBookings[0].to}
              </Text>
            </View>
            <Text style={styles.liveCta}>Track</Text>
          </Pressable>
        )}

        {/* Popular Routes */}
        {popularRoutes.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>{tx('home_popular_routes')}</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.popularContent}
            >
              {popularRoutes.map((route) => (
                <Pressable
                  key={route.id}
                  style={styles.popularCard}
                  onPress={() => handlePopularRoute(route)}
                >
                  <Text style={styles.popularRoute}>
                    {route.from} → {route.to}
                  </Text>
                  <Text style={styles.popularMeta}>
                    {route.durationHours}h · {route.distanceKm} km
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </>
        )}

        {/* Loading state */}
        {loadingRoutes && (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color="#0F52BA" />
            <Text style={styles.loadingText}>Loading routes…</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F8FAFC' },
  scroll: { paddingHorizontal: 20, paddingBottom: 40 },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 16,
    paddingBottom: 20,
  },
  greeting: { fontSize: 20, fontWeight: '800', color: '#0F172A' },
  tagline: { marginTop: 2, fontSize: 13, color: '#475467' },
  avatarCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#0F52BA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLetter: { color: '#FFFFFF', fontWeight: '800', fontSize: 18 },

  searchCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    shadowColor: '#0F172A',
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 16,
    elevation: 4,
    marginBottom: 20,
  },
  cityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 6,
  },
  dot: { width: 12, height: 12, borderRadius: 6 },
  dotGreen: { backgroundColor: '#16A34A' },
  dotBlue: { backgroundColor: '#0F52BA' },
  cityTextWrap: { flex: 1 },
  cityLabel: { fontSize: 11, fontWeight: '700', color: '#98A2B3', textTransform: 'uppercase', letterSpacing: 0.6 },
  cityValue: { fontSize: 17, fontWeight: '800', color: '#0F172A', marginTop: 2 },
  cityPlaceholder: { color: '#C4CDD5', fontWeight: '500' },
  chevron: { fontSize: 22, color: '#98A2B3' },

  swapRow: { flexDirection: 'row', alignItems: 'center', marginVertical: 8, gap: 8 },
  dividerLine: { flex: 1, height: 1, backgroundColor: '#E4E7EC' },
  swapButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#EEF4FF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#C7D7FB',
  },
  swapIcon: { fontSize: 16, color: '#0F52BA', fontWeight: '700' },

  routeMeta: {
    marginTop: 10,
    backgroundColor: '#F0FBF4',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    alignSelf: 'flex-start',
  },
  routeMetaText: { fontSize: 12, color: '#0E8C5F', fontWeight: '700' },

  sectionTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 12,
    marginTop: 4,
  },

  dateScroll: { marginBottom: 16 },
  dateScrollContent: { gap: 8, paddingRight: 8 },
  dateChip: {
    width: 54,
    height: 64,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#E4E7EC',
    gap: 4,
  },
  dateChipActive: { backgroundColor: '#0F52BA', borderColor: '#0F52BA' },
  dateDow: { fontSize: 11, fontWeight: '700', color: '#98A2B3', textTransform: 'uppercase' },
  dateDowActive: { color: '#BBCFFF' },
  dateNum: { fontSize: 18, fontWeight: '800', color: '#0F172A' },
  dateNumActive: { color: '#FFFFFF' },

  searchBtn: {
    backgroundColor: '#0F52BA',
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 24,
    shadowColor: '#0F52BA',
    shadowOpacity: 0.3,
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 14,
    elevation: 6,
  },
  searchBtnDisabled: { backgroundColor: '#98A2B3', shadowOpacity: 0 },
  searchBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },

  modeGrid: { flexDirection: 'row', gap: 10, marginBottom: 24 },
  modeCard: {
    flex: 1,
    minHeight: 112,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E4E7EC',
    justifyContent: 'space-between',
  },
  modeCardActive: { borderColor: '#BFD4FF', backgroundColor: '#F8FBFF' },
  modeCardDisabled: { opacity: 0.45 },
  modeIcon: { fontSize: 18, color: '#0F52BA', fontWeight: '800' },
  modeTitle: { fontSize: 13, fontWeight: '800', color: '#0F172A' },
  modeSub: { fontSize: 11, lineHeight: 15, color: '#667085' },

  upcomingCard: {
    backgroundColor: '#0F52BA',
    borderRadius: 18,
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
    shadowColor: '#0F52BA',
    shadowOpacity: 0.25,
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 14,
    elevation: 6,
  },
  upcomingLeft: { flex: 1, gap: 4 },
  upcomingBadge: {
    fontSize: 11,
    fontWeight: '700',
    color: '#A8C0FF',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  upcomingRoute: { fontSize: 16, fontWeight: '800', color: '#FFFFFF' },
  upcomingMeta: { fontSize: 12, color: '#BBCFFF' },
  upcomingRight: { alignItems: 'flex-end', gap: 4 },
  upcomingAmount: { fontSize: 20, fontWeight: '800', color: '#FFFFFF' },
  upcomingCode: { fontSize: 12, fontWeight: '700', color: '#A8C0FF', letterSpacing: 1 },

  liveTripCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#FFF7ED',
    borderWidth: 1,
    borderColor: '#FED7AA',
    borderRadius: 16,
    padding: 14,
    marginBottom: 24,
  },
  livePulse: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#F97316' },
  liveTitle: { fontSize: 14, fontWeight: '800', color: '#7C2D12' },
  liveSub: { fontSize: 12, color: '#9A3412', marginTop: 2 },
  liveCta: { fontSize: 13, fontWeight: '800', color: '#0F52BA' },

  popularContent: { gap: 10, paddingBottom: 4 },
  popularCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    minWidth: 160,
    borderWidth: 1,
    borderColor: '#E4E7EC',
    shadowColor: '#0F172A',
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 8,
    elevation: 2,
  },
  popularRoute: { fontSize: 14, fontWeight: '800', color: '#0F172A' },
  popularMeta: { marginTop: 4, fontSize: 12, color: '#475467' },

  loadingWrap: { alignItems: 'center', gap: 8, paddingTop: 24 },
  loadingText: { fontSize: 13, color: '#475467' },
});

const cpStyles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#FFFFFF' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderColor: '#E4E7EC',
  },
  title: { fontSize: 18, fontWeight: '800', color: '#0F172A' },
  close: { fontSize: 18, color: '#475467', fontWeight: '700' },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    margin: 16,
    backgroundColor: '#F5F6F7',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
    borderWidth: 1,
    borderColor: '#E4E7EC',
  },
  searchIcon: { fontSize: 16 },
  searchInput: { flex: 1, fontSize: 16, color: '#0F172A' },
  cityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    gap: 12,
  },
  cityIcon: { fontSize: 20 },
  cityName: { fontSize: 16, fontWeight: '700', color: '#0F172A' },
  sep: { height: 1, backgroundColor: '#F0F0F0', marginHorizontal: 20 },
  empty: { textAlign: 'center', color: '#98A2B3', paddingTop: 32 },
});

export default HomeScreen;
