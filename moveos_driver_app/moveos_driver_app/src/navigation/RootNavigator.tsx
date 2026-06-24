import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import SplashScreen from '@/features/onboarding/screens/SplashScreen';
import OnboardingScreen from '@/features/onboarding/screens/OnboardingScreen';
import PhoneEntryScreen from '@/features/auth/screens/PhoneEntryScreen';
import OtpVerificationScreen from '@/features/auth/screens/OtpVerificationScreen';
import ProfileCreateScreen from '@/features/auth/screens/ProfileCreateScreen';
import AppTabs from './AppTabs';
import DriverManifestScreen from '@/features/driver/screens/DriverManifestScreen';
import DriverPostTripScreen from '@/features/driver/screens/DriverPostTripScreen';
import DriverProfileScreen from '@/features/driver/screens/DriverProfileScreen';
import type { RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function RootNavigator() {
  return (
    <Stack.Navigator initialRouteName="Splash" screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Splash" component={SplashScreen} />
      <Stack.Screen name="Onboarding" component={OnboardingScreen} />
      <Stack.Screen name="AuthPhoneEntry" component={PhoneEntryScreen} />
      <Stack.Screen name="AuthOtpVerify" component={OtpVerificationScreen} />
      <Stack.Screen name="ProfileCreate" component={ProfileCreateScreen} />
      <Stack.Screen name="AppShell" component={AppTabs} />
      <Stack.Screen name="DriverManifest" component={DriverManifestScreen} />
      <Stack.Screen name="DriverPostTrip" component={DriverPostTripScreen} options={{ presentation: 'modal' }} />
      <Stack.Screen name="DriverProfile" component={DriverProfileScreen} />
    </Stack.Navigator>
  );
}
