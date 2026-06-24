import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { formatTime } from '@/utils/date';
import { formatPaise } from '@/utils/currency';
import type { Trip } from '@/types';

type Props = {
  trip: Trip;
  onPress: () => void;
};

export const TripCard: React.FC<Props> = ({ trip, onPress }) => {
  const frontFull = trip.frontSeatsLeft === 0;
  const backFull = trip.backSeatsLeft === 0;
  const allFull = frontFull && backFull;

  return (
    <Pressable style={[styles.card, allFull && styles.cardFull]} onPress={onPress}>
      {/* Time + Status row */}
      <View style={styles.topRow}>
        <Text style={styles.time}>{formatTime(trip.departureAt)}</Text>
        {allFull && (
          <View style={styles.fullBadge}>
            <Text style={styles.fullBadgeText}>Full</Text>
          </View>
        )}
      </View>

      {/* Driver + vehicle */}
      <View style={styles.driverRow}>
        <View style={styles.driverInfo}>
          <Text style={styles.driverName}>{trip.driverName}</Text>
          {trip.driverRating != null && (
            <Text style={styles.rating}>⭐ {trip.driverRating.toFixed(1)}</Text>
          )}
        </View>
        {trip.organizationName && (
          <View style={styles.orgBadge}>
            <Text style={styles.orgBadgeText}>{trip.organizationName}</Text>
          </View>
        )}
      </View>

      <Text style={styles.vehicle}>
        {trip.vehicleName} · {trip.vehicleNumber}
      </Text>

      {trip.pickupPoint ? (
        <Text style={styles.pickup}>📍 {trip.pickupPoint}</Text>
      ) : null}

      {/* Seats + Fares */}
      <View style={styles.fareRow}>
        <View style={[styles.fareChip, frontFull && styles.fareChipFull]}>
          <Text style={[styles.fareLabel, frontFull && styles.fareLabelFull]}>Front</Text>
          <Text style={[styles.farePrice, frontFull && styles.farePriceFull]}>
            {frontFull ? 'Full' : formatPaise(trip.frontFarePaise)}
          </Text>
          {!frontFull && (
            <Text style={styles.seatsLeft}>{trip.frontSeatsLeft} left</Text>
          )}
        </View>
        <View style={[styles.fareChip, backFull && styles.fareChipFull]}>
          <Text style={[styles.fareLabel, backFull && styles.fareLabelFull]}>Back</Text>
          <Text style={[styles.farePrice, backFull && styles.farePriceFull]}>
            {backFull ? 'Full' : formatPaise(trip.backFarePaise)}
          </Text>
          {!backFull && (
            <Text style={styles.seatsLeft}>{trip.backSeatsLeft} left</Text>
          )}
        </View>
        <View style={styles.detailsCta}>
          <Text style={styles.detailsText}>View →</Text>
        </View>
      </View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 16,
    gap: 8,
    shadowColor: '#0F172A',
    shadowOpacity: 0.07,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 14,
    elevation: 3,
    borderWidth: 1,
    borderColor: '#E4E7EC',
  },
  cardFull: { opacity: 0.55 },

  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  time: { fontSize: 22, fontWeight: '800', color: '#0F172A' },
  fullBadge: { backgroundColor: '#F3F4F6', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  fullBadgeText: { fontSize: 12, fontWeight: '700', color: '#475467' },

  driverRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  driverInfo: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  driverName: { fontSize: 15, fontWeight: '700', color: '#0F172A' },
  rating: { fontSize: 13, color: '#475467' },
  orgBadge: { backgroundColor: '#E8F0FF', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  orgBadgeText: { fontSize: 11, fontWeight: '700', color: '#0F52BA' },

  vehicle: { fontSize: 13, color: '#475467' },
  pickup: { fontSize: 12, color: '#0E8C5F', fontWeight: '600' },

  fareRow: { flexDirection: 'row', gap: 8, marginTop: 4, alignItems: 'center' },
  fareChip: {
    flex: 1,
    backgroundColor: '#F0F7FF',
    borderRadius: 12,
    padding: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#C7D7FB',
  },
  fareChipFull: { backgroundColor: '#F8FAFC', borderColor: '#E4E7EC' },
  fareLabel: { fontSize: 11, fontWeight: '700', color: '#0F52BA', textTransform: 'uppercase' },
  fareLabelFull: { color: '#98A2B3' },
  farePrice: { fontSize: 16, fontWeight: '800', color: '#0F172A', marginTop: 2 },
  farePriceFull: { color: '#98A2B3' },
  seatsLeft: { fontSize: 11, color: '#475467', marginTop: 2 },

  detailsCta: { paddingHorizontal: 10, paddingVertical: 8, alignItems: 'center', justifyContent: 'center' },
  detailsText: { fontSize: 14, fontWeight: '800', color: '#0F52BA' },
});
