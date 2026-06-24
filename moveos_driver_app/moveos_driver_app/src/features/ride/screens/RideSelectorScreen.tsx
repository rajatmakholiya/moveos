import React, { useMemo, useState } from 'react';
import {
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';

import BackButton from '../../shared/components/BackButton';
import DestinationMapSheet from '../../shared/components/DestinationMapSheet';
import type { MapPoint } from '../../shared/components/MapPreview';
import type { RootStackParamList } from '../../../navigation/types';

type Navigation = NativeStackNavigationProp<RootStackParamList, 'RideSelector'>;
type Route = RouteProp<RootStackParamList, 'RideSelector'>;

type Option = {
  id: string;
  name: string;
  price: string;
  eta: string;
  seats: string;
  tag?: string;
  image: string;
};

const RideSelectorScreen: React.FC = () => {
  const navigation = useNavigation<Navigation>();
  const { params } = useRoute<Route>();
  const [selected, setSelected] = useState('sedan');
  const [mapSheetOpen, setMapSheetOpen] = useState(false);
  const [mapSheetMode, setMapSheetMode] = useState<'view' | 'edit'>('edit');
  const [pickupInput, setPickupInput] = useState(params.pickup);
  const [destinationInput, setDestinationInput] = useState(params.dropoff);

  const pickupPoint: MapPoint =
    params.pickupCoords ?? { latitude: 19.076, longitude: 72.8777, title: pickupInput };
  const dropoffPoint: MapPoint =
    params.dropoffCoords ?? { latitude: 19.0896, longitude: 72.8656, title: destinationInput };

  const options = useMemo<Option[]>(() => {
    return [
      {
        id: 'mini',
        name: 'Moveos Mini',
        price: '₹180',
        eta: '2 mins away',
        seats: '4 • AC • Compact',
        image: 'https://cdn-icons-png.flaticon.com/512/7439/7439129.png',
      },
      {
        id: 'sedan',
        name: 'Moveos Sedan',
        price: '₹240',
        eta: '4 mins away',
        seats: '4 • Extra Legroom',
        tag: 'Surge',
        image: 'https://cdn-icons-png.flaticon.com/512/3202/3202926.png',
      },
      {
        id: 'suv',
        name: 'Moveos SUV',
        price: '₹350',
        eta: '6 mins away',
        seats: '6 • Luggage Space',
        image: 'https://cdn-icons-png.flaticon.com/512/3202/3202924.png',
      },
      {
        id: 'premium',
        name: 'Moveos Premium',
        price: '₹500',
        eta: '5 mins away',
        seats: '4 • Top Rated Drivers',
        image: 'https://cdn-icons-png.flaticon.com/512/3202/3202922.png',
      },
    ];
  }, []);

  const selectedOption = options.find((o) => o.id === selected);

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.dragHandle} />

      <FlatList
        data={options}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
            <View style={styles.listHeader}>
              <View style={styles.headerRow}>
                <BackButton variant="close" onPress={() => navigation.goBack()} />
                <Pressable
                  hitSlop={8}
                  onPress={() => {
                    setMapSheetMode('view');
                    setMapSheetOpen(true);
                  }}
                >
                  <Text style={styles.mapLink}>View route map</Text>
                </Pressable>
              </View>

            <View style={styles.locationCard}>
              <View style={styles.locationRow}>
                <View style={[styles.dot, styles.pickupDot]} />
                <View style={styles.locationTextBlock}>
                  <Text style={styles.locationLabel}>Pickup</Text>
                  <TextInput
                    value={pickupInput}
                    onChangeText={setPickupInput}
                    placeholder="Where should we pick you up?"
                    placeholderTextColor="#98A2B3"
                    style={styles.locationInput}
                    returnKeyType="next"
                    autoCapitalize="words"
                  />
                </View>
              </View>

              <View style={styles.locationDivider} />

              <View style={styles.locationRow}>
                <View style={[styles.dot, styles.dropoffDot]} />
                <View style={styles.locationTextBlock}>
                  <Text style={styles.locationLabel}>Dropoff</Text>
                  <TextInput
                    value={destinationInput}
                    onChangeText={setDestinationInput}
                    placeholder="Where are you heading?"
                    placeholderTextColor="#98A2B3"
                    style={styles.locationInput}
                    returnKeyType="done"
                    autoCapitalize="words"
                  />
                </View>
              </View>

              <Pressable
                style={styles.editOnMap}
                onPress={() => {
                  setMapSheetMode('edit');
                  setMapSheetOpen(true);
                }}
              >
                <Text style={styles.editOnMapText}>Adjust on map</Text>
              </Pressable>
            </View>
          </View>
        }
        renderItem={({ item }) => {
          const isActive = item.id === selected;
          return (
            <Pressable
              style={[styles.optionCard, isActive ? styles.optionCardActive : null]}
              onPress={() => setSelected(item.id)}
            >
              <Image source={{ uri: item.image }} style={styles.optionImage} />
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={styles.optionTitle}>{item.name}</Text>
                <Text style={styles.optionMeta}>{item.seats}</Text>
                <Text style={styles.optionEta}>{item.eta}</Text>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 6 }}>
                {item.tag ? <Text style={styles.badge}>{item.tag}</Text> : null}
                <Text style={styles.optionPrice}>{item.price}</Text>
                {isActive ? <Text style={styles.check}>✔</Text> : null}
              </View>
            </Pressable>
          );
        }}
        ListFooterComponent={
          <View style={styles.footer}>
            <View style={styles.paymentRow}>
              <Text style={styles.paymentLabel}>Payment method</Text>
              <Pressable
                hitSlop={8}
                onPress={() => navigation.navigate('PaymentMethods', { selectedId: selected })}
              >
                <Text style={styles.link}>Change</Text>
              </Pressable>
            </View>
            <Text style={styles.paymentValue}>
              {params.paymentMethod ?? 'Google Pay • .... 4821'}
            </Text>
            <Pressable
              style={styles.confirmCta}
              onPress={() =>
                navigation.navigate('RideFinding', {
                  pickup: pickupInput,
                  dropoff: destinationInput,
                  pickupCoords: pickupPoint,
                  dropoffCoords: dropoffPoint,
                  vehicle: selectedOption ? selectedOption.name : 'Moveos Sedan',
                  price: selectedOption ? selectedOption.price : '₹240',
                  eta: selectedOption ? selectedOption.eta : '4 mins away',
                })
              }
            >
              <Text style={styles.confirmText}>
                Confirm {selectedOption ? selectedOption.name : 'ride'}
              </Text>
            </Pressable>
          </View>
        }
      />
      <DestinationMapSheet
        visible={mapSheetOpen}
        onClose={() => setMapSheetOpen(false)}
        onConfirm={() => setMapSheetOpen(false)}
        pickupValue={pickupInput}
        destinationValue={destinationInput}
        onChangePickup={setPickupInput}
        onChangeDestination={setDestinationInput}
        origin={{ ...pickupPoint, title: pickupInput }}
        destination={{ ...dropoffPoint, title: destinationInput }}
        showInputs={mapSheetMode === 'edit'}
      />
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
    marginTop: 14,
    backgroundColor: '#E4E7EC',
  },

  listHeader: {
    gap: 16,
    marginBottom: 8,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  mapLink: {
    fontSize: 13,
    color: '#0F52BA',
    fontWeight: '800',
  },
  listContent: {
    padding: 16,
    gap: 12,
    paddingBottom: 32,
  },
  locationCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E4E7EC',
    shadowColor: '#0F172A',
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 10 },
    shadowRadius: 14,
    elevation: 4,
  },
  locationRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 999,
    marginTop: 6,
  },
  pickupDot: {
    backgroundColor: '#16A34A',
  },
  dropoffDot: {
    backgroundColor: '#0F52BA',
  },
  locationTextBlock: {
    flex: 1,
    gap: 6,
  },
  locationLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475467',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  locationInput: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#D0D5DD',
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  locationDivider: {
    height: 1,
    backgroundColor: '#E4E7EC',
    marginVertical: 12,
  },
  editOnMap: {
    marginTop: 4,
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: '#0F52BA',
  },
  editOnMapText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 13,
  },
  optionCard: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 12,
    gap: 12,
    borderWidth: 1,
    borderColor: '#E4E7EC',
    shadowColor: '#0F172A',
    shadowOpacity: 0.06,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 10,
    elevation: 3,
  },
  optionCardActive: {
    borderColor: '#0F52BA',
    shadowOpacity: 0.12,
  },
  optionImage: {
    width: 52,
    height: 52,
    borderRadius: 12,
    backgroundColor: '#EEF2F6',
  },
  optionTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
  },
  optionMeta: {
    fontSize: 13,
    color: '#475467',
  },
  optionEta: {
    fontSize: 12,
    color: '#0F52BA',
    fontWeight: '700',
  },
  badge: {
    fontSize: 12,
    fontWeight: '800',
    color: '#F97316',
    backgroundColor: '#FEF3E7',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  optionPrice: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  check: {
    fontSize: 16,
    color: '#0F52BA',
    fontWeight: '800',
  },
  footer: {
    marginTop: 10,
    gap: 10,
  },
  paymentRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  paymentLabel: {
    fontSize: 13,
    color: '#475467',
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  paymentValue: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },
  link: {
    color: '#0F52BA',
    fontWeight: '800',
  },
  confirmCta: {
    marginTop: 8,
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
  confirmText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 16,
  },
});

export default RideSelectorScreen;
