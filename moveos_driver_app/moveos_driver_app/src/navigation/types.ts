export type RootStackParamList = {
  Splash: undefined;
  Onboarding: undefined;
  AuthPhoneEntry: undefined;
  AuthOtpVerify: { phoneNumber: string; countryCode: string };
  ProfileCreate: { phoneNumber: string; countryCode: string };
  AppShell: undefined;
  DriverManifest: { tripId: string };
  DriverPostTrip: undefined;
  DriverProfile: undefined;
};

export type AppTabParamList = {
  DriverHome: undefined;
  DriverOfferings: undefined;
  DriverTrips: undefined;
  DriverFleet: undefined;
  DriverProfileTab: undefined;
};
