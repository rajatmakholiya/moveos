import { Platform } from 'react-native';

/**
 * Environment config — no native module required.
 *
 * Change API_URL to match your setup:
 *   iOS Simulator  → http://localhost:3000/api
 *   Android Emu    → http://10.0.2.2:3000/api
 *   Real device    → http://<your-machine-lan-ip>:3000/api
 *   Production     → https://api.pahadi.com/api
 */
const DEV_API_URL = Platform.OS === 'android'
  ? 'http://10.0.2.2:3000/api'
  : 'http://localhost:3000/api';

export const ENV = {
  API_URL: __DEV__
    ? DEV_API_URL
    : 'https://api.pahadi.com/api',
  RAZORPAY_KEY_ID: __DEV__ ? 'rzp_test_xxx' : 'rzp_live_xxx',
  GOOGLE_MAPS_API_KEY: 'AIzaSyDbQiGGaZbyoqJzZ6Y7k1bfL0ENEAMsSVU',
} as const;
