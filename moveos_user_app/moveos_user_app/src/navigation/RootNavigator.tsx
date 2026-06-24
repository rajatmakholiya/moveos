import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import type { RootStackParamList } from './types';

// Bootstrap
import SplashScreen from '@/features/onboarding/screens/SplashScreen';
import OnboardingScreen from '@/features/onboarding/screens/OnboardingScreen';

// Auth flow
import PhoneEntryScreen from '@/features/auth/screens/PhoneEntryScreen';
import OtpVerificationScreen from '@/features/auth/screens/OtpVerificationScreen';
import ProfileCreateScreen from '@/features/auth/screens/ProfileCreateScreen';

// Main app shell (tabs)
import AppTabs from './AppTabs';

// Phase 2 — Passenger booking flow
import TripListScreen from '@/features/trips/screens/TripListScreen';
import BookingFormScreen from '@/features/booking/screens/BookingFormScreen';
import PaymentScreen from '@/features/booking/screens/PaymentScreen';
import TicketScreen from '@/features/booking/screens/TicketScreen';
import TrackingScreen from '@/features/booking/screens/TrackingScreen';
import RequestsNewScreen from '@/features/requests/screens/RequestsNewScreen';

// Legacy ride screens (kept during migration)
import MainAppPlaceholder from '@/features/onboarding/screens/MainAppPlaceholder';
import SchemesScreen from '@/features/schemes/screens/SchemesScreen';
import SchemeDetailScreen from '@/features/schemes/screens/SchemeDetailScreen';
import PaymentMethodsScreen from '@/features/payments/screens/PaymentMethodsScreen';
import RideDetailScreen from '@/features/ride/screens/RideDetailScreen';
import RideFindingScreen from '@/features/ride/screens/RideFindingScreen';
import RideSchedulerScreen from '@/features/ride/screens/RideSchedulerScreen';
import RideSelectorScreen from '@/features/ride/screens/RideSelectorScreen';
import RideTrackingScreen from '@/features/ride/screens/RideTrackingScreen';
import RideVerifiedScreen from '@/features/ride/screens/RideVerifiedScreen';
import RideCompleteScreen from '@/features/ride/screens/RideCompleteScreen';
import UpcomingRidesScreen from '@/features/ride/screens/UpcomingRidesScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();

/**
 * A single, stable navigator that always starts at Splash.
 *
 * IMPORTANT: do NOT branch on `isReady`/`token` to render a different navigator
 * tree. Swapping the whole <Stack.Navigator> on a state flip causes React to
 * reconcile it as the same instance — `initialRouteName` is only honoured on the
 * first mount, so the swap silently lands on the first declared screen
 * (Onboarding) and the user is forced to log in again every launch.
 *
 * Instead we keep one navigator and let SplashScreen redirect once the auth
 * store has hydrated (token → AppShell, otherwise Onboarding / Auth).
 */
const RootNavigator: React.FC = () => {
  return (
    <Stack.Navigator
      initialRouteName="Splash"
      screenOptions={{ headerShown: false }}
    >
      {/* Bootstrap */}
      <Stack.Screen name="Splash" component={SplashScreen} />
      <Stack.Screen name="Onboarding" component={OnboardingScreen} />

      {/* Auth */}
      <Stack.Screen name="AuthPhoneEntry" component={PhoneEntryScreen} />
      <Stack.Screen name="AuthOtpVerify" component={OtpVerificationScreen} />
      <Stack.Screen name="ProfileCreate" component={ProfileCreateScreen} />

      {/* Main app */}
      <Stack.Screen name="AppShell" component={AppTabs} />

      {/* Phase 2 — Passenger booking */}
      <Stack.Screen name="TripList" component={TripListScreen} />
      <Stack.Screen name="BookingForm" component={BookingFormScreen} />
      <Stack.Screen
        name="PassengerPayment"
        component={PaymentScreen}
        options={{ presentation: 'modal' }}
      />
      <Stack.Screen name="Ticket" component={TicketScreen} />
      <Stack.Screen name="PassengerTracking" component={TrackingScreen} />
      <Stack.Screen
        name="RequestsNew"
        component={RequestsNewScreen}
        options={{ presentation: 'modal' }}
      />

      {/* Legacy ride screens */}
      <Stack.Screen name="Schemes" component={SchemesScreen} />
      <Stack.Screen name="SchemeDetail" component={SchemeDetailScreen} />
      <Stack.Screen name="RideDetail" component={RideDetailScreen} />
      <Stack.Screen
        name="PaymentMethods"
        component={PaymentMethodsScreen}
        options={{ presentation: 'modal' }}
      />
      <Stack.Screen
        name="RideScheduler"
        component={RideSchedulerScreen}
        options={{ presentation: 'modal' }}
      />
      <Stack.Screen
        name="RideSelector"
        component={RideSelectorScreen}
        options={{ presentation: 'modal' }}
      />
      <Stack.Screen name="RideFinding" component={RideFindingScreen} />
      <Stack.Screen name="RideTracking" component={RideTrackingScreen} />
      <Stack.Screen name="RideVerified" component={RideVerifiedScreen} />
      <Stack.Screen name="RideComplete" component={RideCompleteScreen} />
      <Stack.Screen name="UpcomingRides" component={UpcomingRidesScreen} />
      <Stack.Screen name="MainAppPlaceholder" component={MainAppPlaceholder} />
    </Stack.Navigator>
  );
};

export default RootNavigator;
