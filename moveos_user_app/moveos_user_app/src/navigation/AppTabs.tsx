import React, { useEffect, useRef } from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Animated, StyleSheet, Text, View } from 'react-native';
import Feather, { FeatherIconName } from '@react-native-vector-icons/feather';
import HomeScreen from '../features/home/screens/HomeScreen';
import WalletScreen from '../features/payments/screens/WalletScreen';
import ProfileScreen from '../features/profile/screens/ProfileScreen';
import BookingsListScreen from '../features/booking/screens/BookingsListScreen';
import type { AppTabParamList } from './types';

const Tab = createBottomTabNavigator<AppTabParamList>();

const TabIcon = ({
  label,
  icon,
  focused,
}: {
  label: string;
  icon: FeatherIconName;
  focused: boolean;
}) => {
  const scale = useRef(new Animated.Value(focused ? 1 : 0)).current;

  useEffect(() => {
    Animated.spring(scale, {
      toValue: focused ? 1 : 0,
      useNativeDriver: true,
      friction: 7,
      tension: 90,
    }).start();
  }, [focused, scale]);

  const iconScale = scale.interpolate({
    inputRange: [0, 1],
    outputRange: [0.94, 1.12],
  });
  const labelOpacity = scale.interpolate({
    inputRange: [0, 1],
    outputRange: [0.8, 1],
  });

  const activeColor = '#0F52BA';
  const inactiveColor = '#98A2B3';

  return (
    <View style={styles.iconWrap}>
      <Animated.View style={[styles.iconBadge, { transform: [{ scale: iconScale }] }]}>
        <Feather name={icon} size={18} color={focused ? activeColor : inactiveColor} />
      </Animated.View>
      <Animated.Text
        numberOfLines={1}
        style={[
          styles.label,
          {
            opacity: labelOpacity,
            color: focused ? activeColor : inactiveColor,
          },
        ]}
      >
        {label}
      </Animated.Text>
      <Animated.View
        style={[
          styles.activeBar,
          { opacity: focused ? 1 : 0, transform: [{ scaleX: focused ? 1 : 0.6 }] },
        ]}
      />
    </View>
  );
};

const AppTabs: React.FC = () => {
  return (
    <Tab.Navigator
      initialRouteName="Explore"
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        tabBarStyle: {
          height: 82,
          paddingBottom: 14,
          paddingTop: 10,
        },
      }}
    >
      <Tab.Screen
        name="Explore"
        component={HomeScreen}
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon label="Explore" icon="compass" focused={focused} />
          ),
        }}
      />
      <Tab.Screen
        name="Rides"
        component={BookingsListScreen}
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon label="Rides" icon="map" focused={focused} />
          ),
        }}
      />
      <Tab.Screen
        name="Wallet"
        component={WalletScreen}
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon label="Wallet" icon="credit-card" focused={focused} />
          ),
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon label="Profile" icon="user" focused={focused} />
          ),
        }}
      />
    </Tab.Navigator>
  );
};

export default AppTabs;

const styles = StyleSheet.create({
  iconWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 4,
  },
  iconBadge: {
    width: 36,
    height: 20,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 14,
    minWidth: 48,
    textAlign: 'center',
  },
  activeBar: {
    marginTop: 6,
    height: 3,
    width: 30,
    backgroundColor: '#0F52BA',
    borderRadius: 999,
  },
});
