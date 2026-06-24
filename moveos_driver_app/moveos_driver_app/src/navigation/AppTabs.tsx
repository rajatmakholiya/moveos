import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import Feather, { FeatherIconName } from '@react-native-vector-icons/feather';

import DriverDashboardScreen from '@/features/driver/screens/DriverDashboardScreen';
import DriverOfferingsScreen from '@/features/driver/screens/DriverOfferingsScreen';
import DriverTripsScreen from '@/features/driver/screens/DriverTripsScreen';
import DriverFleetScreen from '@/features/driver/screens/DriverFleetScreen';
import DriverProfileScreen from '@/features/driver/screens/DriverProfileScreen';
import type { AppTabParamList } from './types';

const Tab = createBottomTabNavigator<AppTabParamList>();

function icon(name: FeatherIconName) {
  return ({ color, size }: { color: string; size: number }) => (
    <Feather name={name} color={color} size={size} />
  );
}

export default function AppTabs() {
  return (
    <Tab.Navigator
      initialRouteName="DriverHome"
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#0F52BA',
        tabBarInactiveTintColor: '#98A2B3',
        tabBarLabelStyle: { fontSize: 11, fontWeight: '800' },
        tabBarStyle: { height: 82, paddingTop: 8, paddingBottom: 14 },
      }}
    >
      <Tab.Screen name="DriverHome" component={DriverDashboardScreen} options={{ title: 'Home', tabBarIcon: icon('activity') }} />
      <Tab.Screen name="DriverOfferings" component={DriverOfferingsScreen} options={{ title: 'Work', tabBarIcon: icon('briefcase') }} />
      <Tab.Screen name="DriverTrips" component={DriverTripsScreen} options={{ title: 'Trips', tabBarIcon: icon('map') }} />
      <Tab.Screen name="DriverFleet" component={DriverFleetScreen} options={{ title: 'Fleet', tabBarIcon: icon('truck') }} />
      <Tab.Screen name="DriverProfileTab" component={DriverProfileScreen} options={{ title: 'Profile', tabBarIcon: icon('user') }} />
    </Tab.Navigator>
  );
}
