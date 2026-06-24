import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Dimensions,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { formatDateTime } from '@/utils/date';
import { formatPaise } from '@/utils/currency';
import type { Trip, SeatType } from '@/types';

const SCREEN_HEIGHT = Dimensions.get('window').height;
const SHEET_HEIGHT = SCREEN_HEIGHT * 0.85;

type Props = {
  trip: Trip | null;
  onClose: () => void;
  onBook: (seatType: SeatType) => void;
};

export const TripDetailSheet: React.FC<Props> = ({ trip, onClose, onBook }) => {
  const slideAnim = useRef(new Animated.Value(SHEET_HEIGHT)).current;

  useEffect(() => {
    if (trip) {
      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
        friction: 9,
        tension: 80,
      }).start();
    } else {
      slideAnim.setValue(SHEET_HEIGHT);
    }
  }, [trip, slideAnim]);

  const handleClose = () => {
    Animated.timing(slideAnim, {
      toValue: SHEET_HEIGHT,
      duration: 220,
      useNativeDriver: true,
    }).start(onClose);
  };

  if (!trip) return null;

  const frontFull = trip.frontSeatsLeft === 0;
  const backFull = trip.backSeatsLeft === 0;

  return (
    <Modal
      visible={!!trip}
      transparent
      animationType="none"
      onRequestClose={handleClose}
      statusBarTranslucent
    >
      {/* Backdrop */}
      <Pressable style={styles.backdrop} onPress={handleClose} />

      {/* Sheet */}
      <Animated.View
        style={[styles.sheet, { transform: [{ translateY: slideAnim }] }]}
      >
        <SafeAreaView edges={['bottom']} style={{ flex: 1 }}>
          <View style={styles.handle} />

          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>Trip Details</Text>
            <Pressable onPress={handleClose} hitSlop={12}>
              <Text style={styles.closeIcon}>✕</Text>
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.sheetContent} showsVerticalScrollIndicator={false}>
            {/* Departure */}
            <View style={styles.infoRow}>
              <Text style={styles.infoIcon}>🕐</Text>
              <View>
                <Text style={styles.infoLabel}>Departure</Text>
                <Text style={styles.infoValue}>{formatDateTime(trip.departureAt)}</Text>
              </View>
            </View>

            {/* Driver */}
            <View style={styles.infoRow}>
              <Text style={styles.infoIcon}>👤</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.infoLabel}>Driver</Text>
                <View style={styles.driverRow}>
                  <Text style={styles.infoValue}>{trip.driverName}</Text>
                  {trip.driverRating != null && (
                    <Text style={styles.rating}>⭐ {trip.driverRating.toFixed(1)}</Text>
                  )}
                  {trip.driverTrips != null && (
                    <Text style={styles.trips}>{trip.driverTrips} trips</Text>
                  )}
                </View>
              </View>
            </View>

            {/* Vehicle */}
            <View style={styles.infoRow}>
              <Text style={styles.infoIcon}>🚗</Text>
              <View>
                <Text style={styles.infoLabel}>Vehicle</Text>
                <Text style={styles.infoValue}>{trip.vehicleName}</Text>
                <Text style={styles.infoSub}>{trip.vehicleNumber}</Text>
              </View>
            </View>

            {/* Pickup */}
            {trip.pickupPoint ? (
              <View style={styles.infoRow}>
                <Text style={styles.infoIcon}>📍</Text>
                <View>
                  <Text style={styles.infoLabel}>Pickup Point</Text>
                  <Text style={styles.infoValue}>{trip.pickupPoint}</Text>
                </View>
              </View>
            ) : null}

            {/* Notes */}
            {trip.notes ? (
              <View style={styles.notesCard}>
                <Text style={styles.notesLabel}>Driver notes</Text>
                <Text style={styles.notesText}>{trip.notes}</Text>
              </View>
            ) : null}

            {/* Luggage policy */}
            {trip.luggagePolicy ? (
              <View style={styles.infoRow}>
                <Text style={styles.infoIcon}>🧳</Text>
                <View>
                  <Text style={styles.infoLabel}>Luggage Policy</Text>
                  <Text style={styles.infoValue}>{trip.luggagePolicy}</Text>
                </View>
              </View>
            ) : null}

            {/* Organization */}
            {trip.organizationName ? (
              <View style={styles.orgCard}>
                <Text style={styles.orgIcon}>🏢</Text>
                <Text style={styles.orgName}>{trip.organizationName}</Text>
              </View>
            ) : null}

            {/* Seat availability */}
            <View style={styles.seatSection}>
              <Text style={styles.seatTitle}>Choose your seat</Text>
              <View style={styles.seatRow}>
                <View style={[styles.seatCard, frontFull && styles.seatCardFull]}>
                  <Text style={styles.seatLabel}>Front Seat</Text>
                  <Text style={[styles.seatFare, frontFull && styles.seatFareFull]}>
                    {frontFull ? 'Sold out' : formatPaise(trip.frontFarePaise)}
                  </Text>
                  {!frontFull && (
                    <Text style={styles.seatLeft}>{trip.frontSeatsLeft} seat{trip.frontSeatsLeft !== 1 ? 's' : ''} left</Text>
                  )}
                </View>
                <View style={[styles.seatCard, backFull && styles.seatCardFull]}>
                  <Text style={styles.seatLabel}>Back Seat</Text>
                  <Text style={[styles.seatFare, backFull && styles.seatFareFull]}>
                    {backFull ? 'Sold out' : formatPaise(trip.backFarePaise)}
                  </Text>
                  {!backFull && (
                    <Text style={styles.seatLeft}>{trip.backSeatsLeft} seat{trip.backSeatsLeft !== 1 ? 's' : ''} left</Text>
                  )}
                </View>
              </View>
            </View>
          </ScrollView>

          {/* CTA Buttons */}
          <View style={styles.ctaRow}>
            <Pressable
              style={[styles.ctaBtn, styles.ctaFront, frontFull && styles.ctaDisabled]}
              onPress={() => !frontFull && onBook('FRONT')}
              disabled={frontFull}
            >
              <Text style={styles.ctaBtnText}>
                {frontFull ? 'Front Full' : `Book Front · ${formatPaise(trip.frontFarePaise)}`}
              </Text>
            </Pressable>
            <Pressable
              style={[styles.ctaBtn, styles.ctaBack, backFull && styles.ctaDisabled]}
              onPress={() => !backFull && onBook('BACK')}
              disabled={backFull}
            >
              <Text style={[styles.ctaBtnText, styles.ctaBackText]}>
                {backFull ? 'Back Full' : `Book Back · ${formatPaise(trip.backFarePaise)}`}
              </Text>
            </Pressable>
          </View>
        </SafeAreaView>
      </Animated.View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: SHEET_HEIGHT,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    shadowColor: '#0F172A',
    shadowOpacity: 0.2,
    shadowOffset: { width: 0, height: -4 },
    shadowRadius: 16,
    elevation: 20,
  },
  handle: {
    alignSelf: 'center',
    width: 48,
    height: 5,
    borderRadius: 99,
    backgroundColor: '#E4E7EC',
    marginTop: 12,
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderColor: '#F0F0F0',
  },
  sheetTitle: { fontSize: 18, fontWeight: '800', color: '#0F172A' },
  closeIcon: { fontSize: 18, color: '#475467', fontWeight: '700' },
  sheetContent: { padding: 20, gap: 16 },

  infoRow: { flexDirection: 'row', gap: 14, alignItems: 'flex-start' },
  infoIcon: { fontSize: 20, marginTop: 2 },
  infoLabel: { fontSize: 11, fontWeight: '700', color: '#98A2B3', textTransform: 'uppercase', letterSpacing: 0.5 },
  infoValue: { fontSize: 15, fontWeight: '700', color: '#0F172A', marginTop: 2 },
  infoSub: { fontSize: 13, color: '#475467', marginTop: 1 },

  driverRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 },
  rating: { fontSize: 13, color: '#475467' },
  trips: { fontSize: 12, color: '#98A2B3' },

  notesCard: {
    backgroundColor: '#FFF4E5',
    borderRadius: 12,
    padding: 12,
    gap: 4,
    borderWidth: 1,
    borderColor: '#FDDCB0',
  },
  notesLabel: { fontSize: 11, fontWeight: '700', color: '#C47A20', textTransform: 'uppercase' },
  notesText: { fontSize: 13, color: '#78350F' },

  orgCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#EEF4FF',
    borderRadius: 12,
    padding: 12,
  },
  orgIcon: { fontSize: 18 },
  orgName: { fontSize: 14, fontWeight: '700', color: '#0F52BA' },

  seatSection: { gap: 10 },
  seatTitle: { fontSize: 14, fontWeight: '800', color: '#0F172A' },
  seatRow: { flexDirection: 'row', gap: 10 },
  seatCard: {
    flex: 1,
    backgroundColor: '#F0F7FF',
    borderRadius: 14,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#C7D7FB',
    gap: 4,
  },
  seatCardFull: { backgroundColor: '#F8FAFC', borderColor: '#E4E7EC' },
  seatLabel: { fontSize: 12, fontWeight: '700', color: '#0F52BA', textTransform: 'uppercase' },
  seatFare: { fontSize: 20, fontWeight: '800', color: '#0F172A' },
  seatFareFull: { color: '#98A2B3' },
  seatLeft: { fontSize: 12, color: '#475467' },

  ctaRow: { flexDirection: 'row', gap: 10, paddingHorizontal: 20, paddingBottom: 12 },
  ctaBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    shadowColor: '#0F172A',
    shadowOpacity: 0.1,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 10,
    elevation: 4,
  },
  ctaFront: { backgroundColor: '#0F52BA' },
  ctaBack: { backgroundColor: '#E8F0FF', borderWidth: 1, borderColor: '#BFD4FF' },
  ctaDisabled: { backgroundColor: '#F0F0F0', shadowOpacity: 0, borderColor: 'transparent' },
  ctaBtnText: { fontWeight: '800', fontSize: 14, color: '#FFFFFF' },
  ctaBackText: { color: '#0F52BA' },
});
