import React, { useMemo } from 'react';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE, Region } from 'react-native-maps';
import { StyleSheet, View } from 'react-native';

export type MapPoint = {
  latitude: number;
  longitude: number;
  title?: string;
  description?: string;
};

type MapPreviewProps = {
  origin: MapPoint;
  destination: MapPoint;
  height?: number;
  showRoute?: boolean;
  carPosition?: MapPoint;
};

const MapPreview: React.FC<MapPreviewProps> = ({
  origin,
  destination,
  height = 200,
  showRoute = true,
  carPosition,
}) => {
  const region: Region = useMemo(() => {
    const midLat = (origin.latitude + destination.latitude) / 2;
    const midLng = (origin.longitude + destination.longitude) / 2;
    const latDelta = Math.max(Math.abs(origin.latitude - destination.latitude), 0.05) * 1.6;
    const lngDelta =
      Math.max(Math.abs(origin.longitude - destination.longitude), 0.05) * 1.6;
    return {
      latitude: midLat,
      longitude: midLng,
      latitudeDelta: latDelta,
      longitudeDelta: lngDelta,
    };
  }, [destination.latitude, destination.longitude, origin.latitude, origin.longitude]);

  const routePoints = useMemo(() => {
    const points = [origin];
    if (carPosition) {
      points.push(carPosition);
    }
    points.push(destination);
    return points;
  }, [carPosition, destination, origin]);

  return (
    <View style={[styles.container, { height }]}>
      <MapView
        provider={PROVIDER_GOOGLE}
        style={StyleSheet.absoluteFill}
        initialRegion={region}
        zoomControlEnabled={false}
        scrollEnabled={true}
      >
        <Marker coordinate={origin} title={origin.title ?? 'Pickup'} />
        <Marker
          coordinate={destination}
          title={destination.title ?? 'Destination'}
          pinColor="#0F52BA"
        />
        {carPosition ? (
          <Marker
            coordinate={carPosition}
            title={carPosition.title ?? 'Driver'}
            pinColor="#16A34A"
          />
        ) : null}
        {showRoute ? (
          <Polyline
            coordinates={routePoints}
            strokeColor="#0F52BA"
            strokeWidth={4}
            lineDashPattern={[12, 8]}
          />
        ) : null}
      </MapView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
    borderRadius: 16,
    backgroundColor: '#E4E7EC',
  },
});

export default MapPreview;
