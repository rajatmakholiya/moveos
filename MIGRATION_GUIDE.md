# MoveOS React Native Migration Guide

> **How to use this document:** This is a developer prompt. Each section describes what to build, the exact API contracts to use, the TypeScript types expected, validation rules, edge cases, and role/guard logic. Work through it phase by phase following `MIGRATION_PLAN.md`. When in doubt, the PWA at `/Users/shubhamjoshi/new/moveos-pwa` is the source of truth.
>
> **Stack assumption:** React Native CLI (not Expo). All packages require manual native linking. After any `npm install`, run `cd ios && pod install` then rebuild.

---

## 0. Project Configuration

### Environment variables

Use `react-native-config` to load `.env` values into JS without any special prefix.

```
# .env
API_URL=https://api.pahadi.com/api
RAZORPAY_KEY_ID=rzp_live_xxx
```

```
# .env.development
API_URL=http://localhost:3000/api
RAZORPAY_KEY_ID=rzp_test_xxx
```

Access anywhere in JS:

```typescript
import Config from 'react-native-config';

const BASE = Config.API_URL;              // 'https://api.pahadi.com/api'
const RZPKEY = Config.RAZORPAY_KEY_ID;
```

> `react-native-config` requires a native rebuild after first install. It also needs the Android `buildConfigField` setup — follow the package README exactly.

### Required packages

```bash
# Core
npm install react-native-keychain
npm install @react-native-async-storage/async-storage
npm install react-native-config
npm install react-native-get-random-values uuid
npm install react-native-device-info

# Navigation
npm install @react-navigation/native @react-navigation/native-stack @react-navigation/bottom-tabs
npm install react-native-screens react-native-safe-area-context

# Maps & location
npm install react-native-maps

# Payments
npm install react-native-razorpay

# UI
npm install react-native-toast-message
npm install react-native-qrcode-svg react-native-svg

# Network
npm install @react-native-community/netinfo

# File handling
npm install react-native-blob-util
npm install react-native-image-resizer

# Image picker (for KYC doc upload)
npm install react-native-image-picker

# State
npm install zustand

# Performance
npm install react-native-fast-image

# OTA (optional, Phase 7)
npm install react-native-code-push

cd ios && pod install
```

### Absolute imports

In `babel.config.js`, add `babel-plugin-module-resolver` so you can import from `@/`:

```javascript
module.exports = {
  plugins: [
    ['module-resolver', {
      root: ['./src'],
      alias: { '@': './src' },
    }],
  ],
};
```

---

## 1. Storage Keys Reference

Map every `localStorage`/`sessionStorage` key from the PWA to the correct RN storage layer.

| PWA Key | PWA Storage | RN Storage | RN Key / Service | Notes |
|---|---|---|---|---|
| `pahadi_auth.token` | localStorage | **react-native-keychain** | service: `pahadi_token` | JWT, encrypted by OS |
| `pahadi_auth.refreshToken` | localStorage | **react-native-keychain** | service: `pahadi_refresh_token` | |
| `pahadi_auth.user` | localStorage | AsyncStorage | `pahadi_user` | JSON-stringified `AuthUser` |
| `pahadi_device_fingerprint` | localStorage | AsyncStorage | `pahadi_device_fingerprint` | Generated once, never cleared |
| `pahadi_splash_seen` | localStorage | AsyncStorage | `pahadi_splash_seen` | Set to `'true'` after first view |
| `pahadi_lang` | localStorage | AsyncStorage | `pahadi_lang` | `'en'` or `'hi'` |
| `pahadi_booking_form_{tripId}` | sessionStorage | AsyncStorage | `pahadi_booking_form_{tripId}` | Cleared after successful booking |
| `pahadi_selected_context` | n/a | AsyncStorage | `pahadi_selected_context` | Driver's active operating context ID |
| `pahadi_onboarding` | sessionStorage | In-memory Zustand | — | Never persisted to disk |
| `pahadi_intended_route` | sessionStorage | In-memory Zustand | — | Pending navigation after login |

---

## 2. TypeScript Types

Define these in `src/types/index.ts`. Derived from the backend API responses and matching the PWA's `lib/pahadi.ts`.

```typescript
// ─── Auth ────────────────────────────────────────────────────────────────────

export type UserRole = 'PASSENGER' | 'DRIVER' | 'AGENT' | 'ADMIN';

export type AuthUser = {
  userId: string;
  role: UserRole;
  passengerId?: string;
  driverId?: string;
  name?: string;
  phone?: string;
};

export type AuthPayload = {
  token: string;
  refreshToken?: string;
  user: AuthUser;
};

// ─── Routes ──────────────────────────────────────────────────────────────────

export type RouteOption = {
  id: string;
  from: string;
  to: string;
  durationHours: number;
  distanceKm: number;
};

// ─── Trips ───────────────────────────────────────────────────────────────────

export type TripStatus = 'DRAFT' | 'OPEN' | 'DEPARTED' | 'COMPLETED' | 'CANCELLED';
export type SeatType = 'FRONT' | 'BACK';
export type LuggageSize = 'SMALL' | 'LARGE' | 'OVERSIZED';

export type Trip = {
  id: string;
  routeId: string;
  from: string;
  to: string;
  departureAt: string; // ISO 8601
  driverName: string;
  organizationName?: string;
  driverRating: number | null;
  driverTrips: number | null;
  vehicleName: string;
  vehicleNumber: string;
  pickupPoint: string;
  notes?: string;
  status: TripStatus;
  frontFarePaise: number;
  backFarePaise: number;
  frontSeatsLeft: number;
  backSeatsLeft: number;
  luggagePolicy?: string;
};

// ─── Bookings ────────────────────────────────────────────────────────────────

export type BookingStatus = 'CONFIRMED' | 'PENDING' | 'CANCELLED' | 'COMPLETED' | 'NO_SHOW';
export type PaymentMethod = 'UPI' | 'CASH';
export type PaymentStatus = 'PENDING' | 'PAID' | 'REFUNDED' | 'FAILED';

export type Booking = {
  id: string;
  code: string;
  routeId: string;
  tripId: string;
  from: string;
  to: string;
  departureAt: string;
  seatType: SeatType;
  farePaise: number;
  luggagePaise?: number;
  totalPaise: number;
  status: BookingStatus;
  tripStatus: TripStatus;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  passengerName: string;
  phone: string;
  driverName: string;
  vehicleName: string;
  vehicleNumber: string;
  pickupPoint: string;
};

export type ExtraPassenger = {
  name: string;
  phone: string;
  seatType: SeatType;
};

export type BookingFormData = {
  passengerName: string;
  phone: string;
  emergencyContact?: string;
  gstin?: string;
  seatType: SeatType;
  luggageSize: LuggageSize;
  paymentMethod: PaymentMethod;
  extraPassengers: ExtraPassenger[];
};

// Luggage surcharge rules (mirror PWA logic exactly)
export const LUGGAGE_PAISE: Record<LuggageSize, number> = {
  SMALL: 0,
  LARGE: 5000,       // ₹50
  OVERSIZED: 15000,  // ₹150
};

// ─── Requests (Custom Rides) ──────────────────────────────────────────────────

export type RequestType = 'SEAT' | 'FULL_VEHICLE' | 'PARCEL';

export type TransportRequest = {
  id: string;
  type: RequestType;
  status: string;
  paymentStatus?: string;
  from: string;
  to: string;
  pickupLocation?: string;
  dropoffLocation?: string;
  requestedFor: string; // ISO 8601
  seats?: number;
  budgetPaise?: number;
  agreedAmountPaise?: number;
  acceptedByDriverId?: string;
  passengerName?: string;
  passengerPhone?: string;
  note?: string;
  driver?: { name?: string; phone?: string };
  vehicle?: { vehicleNumber?: string; vehicleType?: string };
};

// ─── Organizations ───────────────────────────────────────────────────────────

export type OrgStatus = 'DRAFT' | 'PENDING_REVIEW' | 'ACTIVE' | 'SUSPENDED' | 'REJECTED';

export type Organization = {
  id: string;
  legalName: string;
  tradeName?: string;
  status: OrgStatus;
  planTier: string;
  primaryPhone?: string;
  _count?: { drivers: number; vehicles: number };
};

export type BlockedReason = {
  code: string;
  message: string;
  owner: 'DRIVER' | 'ORGANIZATION' | 'PLATFORM';
};

export type OperatingContext = {
  id: string;
  type: 'INDIVIDUAL' | 'ORGANIZATION';
  label: string;
  activeVehicleCount: number;
  canOperate: boolean;
  blockedReasons?: BlockedReason[];
};

// ─── KYC / Documents ─────────────────────────────────────────────────────────

export type DocumentType = 'DRIVING_LICENSE' | 'AADHAAR' | 'PAN_CARD' | 'RC' | 'INSURANCE' | 'PERMIT';
export type DocumentStatus = 'PENDING' | 'VERIFIED' | 'REJECTED';

export type DriverDocument = {
  type: DocumentType;
  status: DocumentStatus;
  rejectionReason?: string;
  expiresAt?: string;
  documentNumber?: string;
};

// ─── Geo ─────────────────────────────────────────────────────────────────────

export type GeoPlace = {
  id: string;
  name: string;
  lat: number;
  lng: number;
};

export type DriverLocation = {
  lat: number;
  lng: number;
  updatedAt: string;
};

// ─── Feature Flags ───────────────────────────────────────────────────────────

export type FeatureFlags = {
  enableLocationNudge?: boolean;
  enableWalletPrompt?: boolean;
};

// ─── Language ────────────────────────────────────────────────────────────────

export type Lang = 'en' | 'hi';
```

---

## 3. API Client

Create `src/lib/api.ts`. Mirrors the PWA's retry and auth-refresh behavior exactly. Uses `react-native-keychain` for token reads instead of `expo-secure-store`.

```typescript
import * as Keychain from 'react-native-keychain';
import Config from 'react-native-config';

const BASE = Config.API_URL ?? 'http://localhost:3000/api';

export class ApiError extends Error {
  constructor(public status: number, public body: unknown) {
    super(`API ${status}`);
  }
}

// ─── Token helpers ────────────────────────────────────────────────────────────

export async function getStoredToken(): Promise<string | null> {
  const creds = await Keychain.getGenericPassword({ service: 'pahadi_token' });
  return creds ? creds.password : null;
}

export async function setStoredToken(token: string): Promise<void> {
  await Keychain.setGenericPassword('pahadi', token, { service: 'pahadi_token' });
}

async function getStoredRefreshToken(): Promise<string | null> {
  const creds = await Keychain.getGenericPassword({ service: 'pahadi_refresh_token' });
  return creds ? creds.password : null;
}

async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = await getStoredRefreshToken();
  if (!refreshToken) return null;
  try {
    const res = await fetch(`${BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
    if (!res.ok) return null;
    const { accessToken } = await res.json();
    await setStoredToken(accessToken);
    return accessToken;
  } catch {
    return null;
  }
}

// ─── Core request ─────────────────────────────────────────────────────────────

type RequestOptions = {
  method?: string;
  body?: unknown;
  token?: string | null;
  retries?: number;
};

export async function apiRequest<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, retries = 2 } = opts;
  const token = opts.token !== undefined ? opts.token : await getStoredToken();

  const execute = async (tkn: string | null, attempt: number): Promise<T> => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (tkn) headers['Authorization'] = `Bearer ${tkn}`;

    const res = await fetch(`${BASE}${path}`, {
      method,
      headers,
      body: body != null ? JSON.stringify(body) : undefined,
    });

    if (res.status === 401 && attempt === 0) {
      const newToken = await refreshAccessToken();
      if (newToken) return execute(newToken, 1);
      throw new ApiError(401, null);
    }

    if (!res.ok) {
      if (method === 'GET' && res.status >= 500 && attempt < retries) {
        await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
        return execute(tkn, attempt + 1);
      }
      let errBody: unknown;
      try { errBody = await res.json(); } catch { errBody = null; }
      throw new ApiError(res.status, errBody);
    }

    if (res.status === 204) return undefined as T;
    return res.json() as Promise<T>;
  };

  return execute(token, 0);
}

export const api = {
  get: <T>(path: string, token?: string | null) =>
    apiRequest<T>(path, { method: 'GET', token }),
  post: <T>(path: string, body?: unknown, token?: string | null) =>
    apiRequest<T>(path, { method: 'POST', body, token }),
  put: <T>(path: string, body?: unknown, token?: string | null) =>
    apiRequest<T>(path, { method: 'PUT', body, token }),
  patch: <T>(path: string, body?: unknown, token?: string | null) =>
    apiRequest<T>(path, { method: 'PATCH', body, token }),
  delete: <T>(path: string, token?: string | null) =>
    apiRequest<T>(path, { method: 'DELETE', token }),
};
```

---

## 4. Auth Store (Zustand)

Create `src/store/auth.ts`. Uses `react-native-keychain` for secure token storage.

```typescript
import { create } from 'zustand';
import * as Keychain from 'react-native-keychain';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AuthUser, AuthPayload } from '@/types';

type AuthStore = {
  user: AuthUser | null;
  token: string | null;
  isReady: boolean;
  login: (payload: AuthPayload) => Promise<void>;
  logout: () => Promise<void>;
  hydrate: () => Promise<void>;
};

export const useAuthStore = create<AuthStore>((set) => ({
  user: null,
  token: null,
  isReady: false,

  hydrate: async () => {
    try {
      const tokenCreds = await Keychain.getGenericPassword({ service: 'pahadi_token' });
      const token = tokenCreds ? tokenCreds.password : null;

      const userStr = await AsyncStorage.getItem('pahadi_user');
      const user: AuthUser | null = userStr ? JSON.parse(userStr) : null;
      // Normalize legacy RIDER role
      if (user && (user.role as string) === 'RIDER') user.role = 'PASSENGER';

      set({ token, user, isReady: true });
    } catch {
      set({ isReady: true });
    }
  },

  login: async (payload) => {
    const user = { ...payload.user };
    if ((user.role as string) === 'RIDER') user.role = 'PASSENGER';

    await Keychain.setGenericPassword('pahadi', payload.token, { service: 'pahadi_token' });
    if (payload.refreshToken) {
      await Keychain.setGenericPassword('pahadi', payload.refreshToken, {
        service: 'pahadi_refresh_token',
      });
    }
    await AsyncStorage.setItem('pahadi_user', JSON.stringify(user));
    set({ token: payload.token, user });
  },

  logout: async () => {
    await Keychain.resetGenericPassword({ service: 'pahadi_token' });
    await Keychain.resetGenericPassword({ service: 'pahadi_refresh_token' });
    await AsyncStorage.removeItem('pahadi_user');
    set({ token: null, user: null });
  },
}));
```

Call `useAuthStore.getState().hydrate()` in `App.tsx` before rendering any screen, inside a `useEffect` on mount.

---

## 5. Navigation Structure

```
RootNavigator
├─ (isReady === false) → SplashScreen
├─ (user === null) → AuthStack
│   ├─ PhoneScreen
│   ├─ OtpScreen
│   ├─ NameScreen          (conditional)
│   └─ ConsentsScreen
├─ (user.role === 'PASSENGER') → PassengerTabs
│   ├─ HomeStack
│   │   ├─ HomeScreen
│   │   ├─ TripListScreen
│   │   ├─ BookingFormScreen
│   │   ├─ PaymentScreen
│   │   ├─ TicketScreen
│   │   └─ TrackingScreen
│   ├─ BookingsStack
│   │   ├─ BookingsListScreen
│   │   └─ RequestsNewScreen
│   └─ ProfileStack
│       └─ ProfileScreen
└─ (user.role === 'DRIVER') → DriverTabs
    ├─ DriverHomeStack
    │   ├─ DriverHomeScreen
    │   ├─ DriverOnboardingScreen  (multi-step, replaces tabs when KYC incomplete)
    │   └─ DriverTripsScreen
    ├─ DriverOfferingsStack        (placeholder)
    ├─ FleetStack
    │   ├─ OrgListScreen
    │   ├─ OrgDetailScreen
    │   └─ OrgInviteScreen
    ├─ BookingsStack
    └─ ProfileStack
        └─ DriverProfileScreen
```

**Guard rule:** On every `DRIVER` tab screen, check `user.role === 'DRIVER'` — if not, navigate to `PassengerTabs`. On every `PASSENGER` tab screen, check `user.role === 'PASSENGER'` — if not, navigate to `DriverTabs`. Do not rely on tab structure alone.

**Onboarding gate:** When a DRIVER user arrives on `DriverHomeScreen`, fetch `GET /driver/onboarding/me`. If `nextStep !== 'ACTIVE'`, call `navigation.replace('DriverOnboarding')` (outside the tabs).

---

## 6. Onboarding (Auth) Flow

### Step 1 — Start session

```
POST /onboarding/session
Body: {
  deviceFingerprint: string,  // from AsyncStorage 'pahadi_device_fingerprint'
  role: 'PASSENGER' | 'DRIVER',
  appVersion: string,         // from react-native-device-info: DeviceInfo.getVersion()
  locale: string,             // e.g. 'en-IN'
  timezone: string            // e.g. 'Asia/Kolkata'
}
Response: {
  sessionId: string,
  onboardingToken: string
}
```

Store `sessionId` and `onboardingToken` in-memory (Zustand onboarding slice — not persisted).

### Step 2 — Request OTP

```
POST /onboarding/profile
Headers: Authorization: Bearer {onboardingToken}
Body: { phone: '91XXXXXXXXXX', locale: 'en-IN', timezone: 'Asia/Kolkata' }
Response: { requiresOtp: true, devOtpCode?: string }
```

In `__DEV__` mode, show `devOtpCode` in a debug `Text` component below the OTP input.

### Step 3 — Verify OTP

```
POST /onboarding/profile
Headers: Authorization: Bearer {onboardingToken}
Body: { otp: '123456' }
Response:
  { requiresName: true }           — navigate to NameScreen
  | { token, refreshToken?, user } — login complete
```

**Lockout logic:** Track attempt count in local state. After 3 failures, disable input for 60 seconds. Show a live countdown. Resume after 60s.

**Resend logic:** After OTP is sent, disable the resend button for 60 seconds with countdown.

### Step 4 — Submit name (if `requiresName: true`)

```
POST /onboarding/profile
Headers: Authorization: Bearer {onboardingToken}
Body: { name: 'Shubham Joshi' }
Response: { token, refreshToken?, user }
```

### Step 5 — Consents

Show T&C + Privacy Policy. Both must be explicitly accepted. On completion, call `useAuthStore.getState().login(payload)`.

### Device fingerprint generation

```typescript
// src/lib/fingerprint.ts
import 'react-native-get-random-values';  // must be first import
import { v4 as uuidv4 } from 'uuid';
import AsyncStorage from '@react-native-async-storage/async-storage';

export async function getOrCreateDeviceFingerprint(): Promise<string> {
  const existing = await AsyncStorage.getItem('pahadi_device_fingerprint');
  if (existing) return existing;
  const id = `rn-${uuidv4()}`;
  await AsyncStorage.setItem('pahadi_device_fingerprint', id);
  return id;
}
```

> `react-native-get-random-values` must be imported before `uuid`. Add it as the very first line of `index.js` (the app entry point) to guarantee it runs before anything else.

```javascript
// index.js
import 'react-native-get-random-values';
import { AppRegistry } from 'react-native';
import App from './src/App';
// ...
```

---

## 7. Home Screen — Passenger

### Data

```
GET /routes
Response: RouteOption[]
Cache: 1 hour (React Query staleTime: 3_600_000 or SWR dedupingInterval: 3_600_000)
Auth: none
```

### UI Requirements

- Two dropdowns: **From** and **To**, populated from routes list
- Date picker: default today, allow up to 31 days forward — use `@react-native-community/datetimepicker`
- **Popular routes** section: subset of routes list
- **Recent booking banner**: last item from `upcomingBookings` if present
- On "Search" tap: `navigation.navigate('TripList', { routeId, date })`

---

## 8. Trip List Screen

### Data

```
GET /trips/available?routeId={id}&date={YYYY-MM-DD}
Response: Trip[]
Auth: none
```

### UI Requirements

- Filter pills: ALL / FRONT / BACK
- Sort: by `departureAt` (default) or `frontFarePaise`
- Each `TripCard` shows: departure time, driver name, vehicle, seats left, fare, rating
- Tap trip → `BottomSheet` (`TripDetailSheet`) with full trip info
- "Book Front" / "Book Back" in sheet → `navigation.navigate('BookingForm', { tripId, seatType, trip })`
- If `frontSeatsLeft === 0`, disable "Book Front" with label "Full"

### Fare display rule

Divide paise by 100. `frontFarePaise: 35000` → `₹350`. Always show `₹` prefix.

---

## 9. Booking Form Screen

### Params received

`{ tripId: string, seatType: 'FRONT' | 'BACK', trip: Trip }`

### Persistence

Debounce 500ms on every field change. Save to `AsyncStorage` key `pahadi_booking_form_{tripId}`. Restore on screen mount.

### Form fields

| Field | Validation | Notes |
|---|---|---|
| `passengerName` | required, min 2 chars | Pre-fill from `user.name` |
| `phone` | 10 digits, strip non-numeric | Pre-fill from `user.phone` |
| `emergencyContact` | optional, 10 digits | |
| `gstin` | optional | For invoice |
| `luggageSize` | SMALL / LARGE / OVERSIZED | Default: SMALL |
| `paymentMethod` | CASH / UPI | |
| `extraPassengers` | array, each: name + phone + seatType | |

### Fare calculation (must match backend)

```typescript
function calculateTotal(trip: Trip, form: BookingFormData): number {
  const baseFare = form.seatType === 'FRONT' ? trip.frontFarePaise : trip.backFarePaise;
  const extraFare = form.extraPassengers.reduce((sum, ep) => {
    return sum + (ep.seatType === 'FRONT' ? trip.frontFarePaise : trip.backFarePaise);
  }, 0);
  return baseFare + extraFare + LUGGAGE_PAISE[form.luggageSize];
}
```

### Submit

```
POST /bookings/{tripId}/confirm
Headers: Authorization: Bearer {token}
Body: {
  passengerName: string,
  phone: string,
  emergencyContact?: string,
  gstin?: string,
  seatType: 'FRONT' | 'BACK',
  luggageSize: 'SMALL' | 'LARGE' | 'OVERSIZED',
  paymentMethod: 'CASH' | 'UPI',
  extraPassengers: ExtraPassenger[]
}
Response: {
  bookingId: string,
  code: string,
  orderId?: string,    // present only if paymentMethod === 'UPI'
  amount?: number,     // paise
  ...Booking
}
```

- CASH → `navigation.replace('Ticket', { bookingId })`
- UPI → `navigation.navigate('Payment', { bookingId, orderId, amount })`

After successful booking, delete `AsyncStorage` key `pahadi_booking_form_{tripId}`.

---

## 10. Payment Screen (Razorpay)

```typescript
import RazorpayCheckout from 'react-native-razorpay';
import Config from 'react-native-config';

async function openRazorpay(params: {
  orderId: string;
  amount: number;
  bookingId: string;
  passengerName: string;
  phone: string;
}) {
  const options = {
    description: 'Seat Booking - Pahadi Rides',
    currency: 'INR',
    key: Config.RAZORPAY_KEY_ID,
    amount: String(params.amount),   // react-native-razorpay expects string
    order_id: params.orderId,
    name: 'Pahadi Rides',
    prefill: {
      contact: params.phone,
      name: params.passengerName,
    },
    theme: { color: '#0D9488' },
  };

  // RazorpayCheckout.open returns a Promise
  const data = await RazorpayCheckout.open(options);
  // data: { razorpay_payment_id, razorpay_order_id, razorpay_signature }

  const token = await getStoredToken();
  await api.post(
    `/bookings/${params.bookingId}/verify-payment`,
    {
      orderId: data.razorpay_order_id,
      paymentId: data.razorpay_payment_id,
      signature: data.razorpay_signature,
    },
    token,
  );
}
```

On success → `navigation.replace('Ticket', { bookingId })`.

On failure (`RazorpayCheckout.open` throws with `{ code, description }`) → show error toast, stay on screen with retry button.

> `react-native-razorpay` requires adding the Razorpay Android/iOS SDK natively. Follow the package README for iOS Podfile additions and Android Gradle changes.

---

## 11. Ticket Screen

### Data

```
GET /bookings/{bookingId}
Response: Booking
Auth: none
```

### UI Requirements

- Large booking code text (for driver to visually verify)
- QR code from `booking.code` using `react-native-qrcode-svg`
- Show: route, departure time, passenger name, seat type, fare, payment status, driver + vehicle
- **Share ticket**: `Share.share({ message: bookingCode })` from `react-native`
- **Cancel**: `POST /bookings/{bookingId}/cancel` (JWT required) → refetch booking
- **Track driver**: `navigation.navigate('Tracking', { bookingId })`

---

## 12. Tracking Screen

### Data — polling

```
GET /telemetry/location?bookingId={id}
Response: { lat: number, lng: number, updatedAt: string }
Auth: none
Poll: every 15 seconds
```

```typescript
import MapView, { Marker } from 'react-native-maps';

useEffect(() => {
  const poll = async () => {
    try {
      const loc = await api.get<DriverLocation>(`/telemetry/location?bookingId=${bookingId}`);
      setDriverLocation(loc);
    } catch { /* silent — driver may not have shared location yet */ }
  };

  poll(); // immediate first call
  const interval = setInterval(poll, 15_000);
  return () => clearInterval(interval);
}, [bookingId]);
```

Show driver marker on map. If `driverLocation` is null, show "Waiting for driver location…" banner over the map.

---

## 13. My Bookings Screen

### Data

```
GET /passenger/bookings       — PASSENGER role
GET /driver/bookings          — DRIVER role
Response: { upcomingBookings: Booking[], pastBookings: Booking[] }
Auth: JWT
```

Also fetch (PASSENGER only):

```
GET /requests?status=REQUESTED   — pending custom requests
GET /requests?status=ACCEPTED    — accepted custom requests
```

### Tabs

- **Upcoming**: `upcomingBookings` sorted by `departureAt` ascending + pending/accepted requests
- **Past**: `pastBookings` + completed requests

### Driver-specific action

```
POST /driver/bookings/{id}/collect-cash
Auth: JWT (DRIVER)
Body: {}
```

Show "Collect Cash" button on bookings where `paymentMethod === 'CASH'` and `paymentStatus === 'PENDING'`.

---

## 14. Custom Ride Requests

### Create request

```
POST /requests
Auth: JWT (PASSENGER)
Body: {
  type: 'SEAT' | 'FULL_VEHICLE' | 'PARCEL',
  routeId?: string,
  from: string,
  to: string,
  pickupLocation?: string,
  dropoffLocation?: string,
  requestedFor: string,     // ISO 8601
  seats?: number,           // FULL_VEHICLE only, range 1–8
  budgetPaise?: number,     // FULL_VEHICLE only
  note?: string             // PARCEL: required
}
```

### Geo search (pickup/dropoff autocomplete)

```
GET /geo/search?q={query}&routeId={id}
Response: GeoPlace[]
Auth: none
```

Debounce TextInput 300ms before calling. Render results in a `FlatList` below the input.

### Driver view

```
GET /driver/requests?status=ACCEPTED
Auth: JWT (DRIVER)
Response: TransportRequest[]
```

Driver completes:

```
POST /requests/{id}/complete
Auth: JWT (DRIVER)
Body: {}
```

---

## 15. Profile Screen

### Passenger

```
GET /me/feature-flags
Auth: JWT
Response: FeatureFlags

GET /wallet/me/balance
Auth: JWT
Response: { balance: number }   // paise → display as ₹{balance / 100}
```

### Driver

```
GET /drivers/me
Auth: JWT (DRIVER)
Response: { id, name, phone, isOnline, documents: DriverDocument[], ... }

GET /drivers/me/vehicles
Auth: JWT (DRIVER)
Response: Vehicle[]
```

---

## 16. Driver Dashboard

### Data on load (parallel fetches)

```
GET /driver/trips?scope=today          → metrics + trips list
GET /driver/earnings                   → { todayPaise, weekPaise, monthPaise }
GET /driver/compliance                 → compliance status
GET /drivers/me/operating-contexts    → OperatingContext[]
GET /driver/onboarding/me             → { nextStep, missingRequiredFields, missingRequiredDocuments }
Auth: JWT (DRIVER)
```

### Onboarding gate

```typescript
const { nextStep } = await api.get<{ nextStep: string }>('/driver/onboarding/me', token);
if (nextStep !== 'ACTIVE') {
  navigation.replace('DriverOnboarding');
}
```

### Online/offline toggle

```
POST /drivers/me/go-online
POST /drivers/me/go-offline
Auth: JWT (DRIVER)
Body: {}
```

If the selected `OperatingContext` has `canOperate === false`, disable the toggle and show all `blockedReasons` as a list.

### Operating context picker

```
GET /drivers/me/operating-contexts
Auth: JWT (DRIVER)
Response: OperatingContext[]
```

Driver picks which context to operate under. Persist selection in `AsyncStorage` key `pahadi_selected_context`.

---

## 17. Driver Onboarding (KYC Multi-Step)

### Step 1 — Profile form

```
POST /driver/onboarding/profile
Auth: JWT (DRIVER)
Body: {
  fullName: string,
  dob: string,                 // YYYY-MM-DD
  gender: 'MALE' | 'FEMALE' | 'OTHER',
  email?: string,
  phone: string,
  currentAddress: {
    line1: string, line2?: string,
    city: string, state: string, pincode: string
  },
  permanentAddress: {
    line1: string, line2?: string,
    city: string, state: string, pincode: string
  },
  emergencyContactName: string,
  emergencyContactPhone: string,
  bloodGroup?: string,
  language: string,
  profilePhotoUrl?: string
}
```

Age validation: parse `dob`, compute years since today. Reject with inline error if < 18.

### Step 2 — Document upload

The full upload sequence for each document:

**2a. Get signed upload URL**

```
GET /driver/documents/{type}/upload-slot
Auth: JWT (DRIVER)
Response: { uploadUrl: string, fileUrl: string, fileUuid: string }
```

**2b. Pick and compress image**

```typescript
import { launchImageLibrary } from 'react-native-image-picker';
import ImageResizer from 'react-native-image-resizer';

const result = await launchImageLibrary({ mediaType: 'photo', quality: 1 });
const asset = result.assets?.[0];
if (!asset?.uri) return;

const compressed = await ImageResizer.createResizedImage(
  asset.uri,
  1920,         // maxWidth
  1920,         // maxHeight
  'JPEG',       // format
  70,           // quality 0-100
  0,            // rotation
);
// Use compressed.uri and 'image/jpeg' as MIME type
```

**2c. PUT file to S3 signed URL**

```typescript
import RNBlobUtil from 'react-native-blob-util';

await RNBlobUtil.fetch(
  'PUT',
  uploadUrl,
  { 'Content-Type': 'image/jpeg' },
  RNBlobUtil.wrap(compressed.uri.replace('file://', '')),
);
```

**2d. Register document with backend**

```
POST /driver/documents/{type}
Auth: JWT (DRIVER)
Body: {
  fileUuid: string,
  side: 'FRONT' | 'BACK',
  documentNumber?: string,
  expiresAt?: string,        // ISO 8601, required for DRIVING_LICENSE
}
```

**Document requirements:**

| Document | Sides | Expiry | Doc Number | Required |
|---|---|---|---|---|
| DRIVING_LICENSE | front + back | yes | yes | **yes** |
| AADHAAR | front + back | no | yes | no |
| PAN_CARD | front only | no | yes | no |

**File constraints:** JPG, PNG, WebP, PDF — max 8 MB. Always compress images before upload.

### Step 3 — Review

Show all entered data. Allow back-navigation to edit step 1 or 2.

### Step 4 — Submit

```
POST /driver/onboarding/submit
Auth: JWT (DRIVER)
Body: {}
Response: {
  nextStep: 'ACTIVE' | 'WAIT_FOR_VERIFICATION' | 'SUSPENDED',
  message?: string
}
```

| `nextStep` | UI Action |
|---|---|
| `ACTIVE` | "You're verified!" → `navigation.replace('DriverHome')` |
| `WAIT_FOR_VERIFICATION` | "Documents under review. We'll notify you in 24–48h." |
| `SUSPENDED` | "Account suspended. Contact support." |

---

## 18. Organizations (Fleet) Screens

### Org list

```
GET /organizations/me
Auth: JWT (DRIVER)
Response: {
  memberships: Array<{
    organization: Organization,
    status: string,
    joinedAt: string
  }>
}
```

### Deep link — Org invite

**Native configuration (React Native CLI — not Expo):**

**iOS** — add to `ios/{AppName}/Info.plist`:

```xml
<key>CFBundleURLTypes</key>
<array>
  <dict>
    <key>CFBundleURLSchemes</key>
    <array>
      <string>pahadi</string>
    </array>
  </dict>
</array>
```

For Universal Links, add `apple-app-site-association` to your web server and configure `Associated Domains` entitlement in Xcode (`applinks:app.pahadi.com`).

**Android** — add to `android/app/src/main/AndroidManifest.xml` inside `<activity>`:

```xml
<!-- Custom scheme -->
<intent-filter>
  <action android:name="android.intent.action.VIEW" />
  <category android:name="android.intent.category.DEFAULT" />
  <category android:name="android.intent.category.BROWSABLE" />
  <data android:scheme="pahadi" android:host="organization-invite" />
</intent-filter>

<!-- App Links (HTTPS) -->
<intent-filter android:autoVerify="true">
  <action android:name="android.intent.action.VIEW" />
  <category android:name="android.intent.category.DEFAULT" />
  <category android:name="android.intent.category.BROWSABLE" />
  <data android:scheme="https" android:host="app.pahadi.com"
        android:pathPrefix="/organization-invite" />
</intent-filter>
```

**Handling in React Navigation:**

```typescript
import { Linking } from 'react-native';

const linking = {
  prefixes: ['pahadi://', 'https://app.pahadi.com'],
  config: {
    screens: {
      OrgInvite: 'organization-invite/:token',
    },
  },
};

// In NavigationContainer:
<NavigationContainer linking={linking}>
```

On cold start, `Linking.getInitialURL()` returns the URL. Handle auth state before navigating:

```typescript
// In OrgInviteScreen
const { token } = route.params;
const { user } = useAuthStore();

// If not logged in, save token and redirect to auth
if (!user) {
  saveIntendedRoute({ screen: 'OrgInvite', params: { token } });
  navigation.replace('AuthStack');
  return;
}
```

**API calls:**

```
GET /organizations/invitations/{token}/details
Auth: none
Response: { organization: Organization, invitedRole: string, ... }
```

```
POST /organizations/invitations/{token}/accept
Auth: JWT (DRIVER)
Body: {}
Response: { message: 'ok' }
```

On success: toast "You've joined {orgName}" + `navigation.navigate('OrgList')`.

---

## 19. Language (i18n)

Create `src/lib/i18n.ts`:

```typescript
export const translations = {
  en: {
    home_search_button: 'Search Trips',
    home_from: 'From',
    home_to: 'To',
    booking_confirm: 'Confirm Booking',
    otp_title: 'Enter OTP',
    otp_resend: 'Resend OTP',
    // ... port all keys from moveos-pwa/lib/i18n.ts
  },
  hi: {
    home_search_button: 'यात्राएं खोजें',
    home_from: 'कहाँ से',
    home_to: 'कहाँ तक',
    booking_confirm: 'बुकिंग कन्फर्म करें',
    otp_title: 'OTP दर्ज करें',
    otp_resend: 'OTP दोबारा भेजें',
    // ...
  },
} as const;

export type TxKey = keyof typeof translations.en;
```

```typescript
// Usage via hook
const { lang } = useLanguage();
const tx = (key: TxKey) =>
  (translations[lang][key] as string) ?? translations.en[key];
```

Language is stored in `AsyncStorage` key `pahadi_lang` and read on app start by `LanguageProvider`.

---

## 20. Offline Handling

```typescript
import NetInfo from '@react-native-community/netinfo';

// LanguageProvider or a dedicated NetworkProvider in App.tsx root
useEffect(() => {
  const unsub = NetInfo.addEventListener(state => {
    setIsOnline(state.isConnected ?? true);
  });
  return unsub;
}, []);
```

When offline:
- Render a sticky `View` banner at top: "No internet connection"
- Disable all form submit `TouchableOpacity` / `Pressable` elements
- Show stale cached data where available
- Fail API calls immediately with a "Check your connection" toast (do not queue)

---

## 21. Feature Flags

```
GET /me/feature-flags
Auth: JWT
```

Fetch once on login. Cache result in Zustand store with a `flagsFetchedAt` timestamp. Re-fetch if `Date.now() - flagsFetchedAt > 5 * 60 * 1000`.

```typescript
// Actions driven by flags:
// enableLocationNudge: true  → show location permission prompt on HomeScreen
// enableWalletPrompt: true   → show wallet recharge banner on BookingsListScreen
```

---

## 22. Error Handling Patterns

```typescript
import { ApiError } from '@/lib/api';
import Toast from 'react-native-toast-message';

try {
  const data = await api.get('/some/endpoint', token);
  // handle success
} catch (err) {
  if (err instanceof ApiError) {
    if (err.status === 401) {
      await useAuthStore.getState().logout();
      navigation.replace('AuthStack');
    } else if (err.status === 404) {
      Toast.show({ type: 'error', text1: 'Not found' });
    } else if (err.status >= 500) {
      Toast.show({ type: 'error', text1: 'Server error. Please try again.' });
    } else {
      const msg = (err.body as any)?.message ?? 'Something went wrong';
      Toast.show({ type: 'error', text1: msg });
    }
  } else {
    Toast.show({ type: 'error', text1: 'Network error. Check your connection.' });
  }
}
```

---

## 23. Screen-by-Screen Checklist

### Auth
- [ ] SplashScreen (AsyncStorage `pahadi_splash_seen`)
- [ ] PhoneScreen (10-digit normalize, role selector)
- [ ] OtpScreen (60s timer, 3-attempt lockout, devOtpCode banner in `__DEV__`)
- [ ] NameScreen
- [ ] ConsentsScreen

### Passenger
- [ ] HomeScreen (route select, date picker, search)
- [ ] TripListScreen (filter pills, sort, TripCard)
- [ ] TripDetailSheet (bottom sheet)
- [ ] BookingFormScreen (all fields, fare calc, AsyncStorage persistence)
- [ ] PaymentScreen (react-native-razorpay)
- [ ] TicketScreen (QR code, share, cancel, track)
- [ ] BookingsListScreen (Upcoming/Past tabs)
- [ ] RequestsNewScreen (SEAT/FULL_VEHICLE/PARCEL + geo autocomplete)
- [ ] TrackingScreen (react-native-maps + 15s polling)
- [ ] ProfileScreen (wallet balance, language toggle, logout)

### Driver
- [ ] DriverHomeScreen (metrics, online toggle, onboarding gate)
- [ ] DriverOnboardingScreen (4-step: profile → docs → review → submit)
- [ ] DriverTripsScreen
- [ ] DriverBookingsScreen (collect cash)
- [ ] DriverRequestsScreen (complete action)
- [ ] DriverProfileScreen (KYC doc status, vehicles)
- [ ] OrgListScreen
- [ ] OrgDetailScreen (membership status, blocked reasons)
- [ ] OrgInviteScreen (deep link cold-start + accept flow)

### Cross-cutting
- [ ] Offline banner (`@react-native-community/netinfo`)
- [ ] Language toggle (en/hi, AsyncStorage persistence)
- [ ] Toast notifications (`react-native-toast-message`)
- [ ] ApiError handling with 401 auto-logout
- [ ] Auth token refresh (silent, transparent to user)
- [ ] Role-based navigation guards
- [ ] Deep link handling (custom scheme + App Links/Universal Links)
- [ ] Feature flags context (5-minute cache)
- [ ] `react-native-get-random-values` imported first in `index.js`

---

## 24. Testing Scenarios

### Auth
1. New PASSENGER — full onboarding from fresh install on real device
2. New DRIVER — full onboarding + KYC gate redirect to DriverOnboardingScreen
3. Existing user — cold start restores session from Keychain (token not visible in AsyncStorage)
4. Token expired — refresh happens silently, user never sees disruption
5. Both tokens expired — logout + redirect to onboarding
6. Wrong OTP 3 times — 60s lockout triggers, countdown visible
7. DRIVER logs in — lands on DriverHomeScreen (not PassengerTabs)

### Booking
8. Search trips by route + date — list loads, filter pills work
9. Book FRONT seat with CASH — navigates to TicketScreen directly (no Razorpay)
10. Book BACK seat with UPI — Razorpay sheet opens, success → TicketScreen
11. User dismisses Razorpay — stays on PaymentScreen, retry button visible
12. Cancel booking — ticket status updates, booking moves to Past tab

### Driver
13. DRIVER goes online — toggle state persists across app restart
14. DRIVER has expired insurance — blocked reason listed, toggle disabled
15. Collect cash on booking — booking shows PAID status after action

### Organizations
16. Open invite link while unauthenticated — org details show, "Sign in" prompt visible
17. Open invite link as authenticated DRIVER — Accept works, org appears in list
18. Open invite link as authenticated PASSENGER — org details show, Accept button hidden

### Edge cases
19. No trips for route+date — empty state renders (not crash, not spinner loop)
20. Device goes offline mid-session — banner appears, form submits fail gracefully
21. Language toggled to Hindi — all strings on current screen update instantly
22. `react-native-get-random-values` missing from `index.js` — fingerprint generation fails visibly (test this in dev)
