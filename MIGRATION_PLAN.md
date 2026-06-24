# MoveOS PWA → React Native Migration Plan

> **Purpose:** Phased roadmap for bringing moveos-pwa feature parity into the existing React Native (Pahadi Rides) app. Every API contract, auth rule, role guard, and integration that exists in the PWA must work identically in the native app.
>
> **Companion document:** `MIGRATION_GUIDE.md` — a developer prompt with all technical specifics (endpoints, types, validation rules, edge cases) needed to implement each phase.

---

## Architecture Delta Summary

| Concern | PWA (Current) | React Native (Target) |
|---|---|---|
| Storage | localStorage / sessionStorage | AsyncStorage + SecureStore |
| Auth token | localStorage `pahadi_auth` | SecureStore (encrypted) |
| Navigation | Next.js App Router | React Navigation (Stack + Tabs) |
| Payments | Razorpay web checkout.js | react-native-razorpay SDK |
| Maps / Tracking | Leaflet.js | react-native-maps |
| File upload | PUT to S3 signed URL via fetch | react-native-fs / FormData upload to signed URL |
| PWA offline | Service Worker | React Native NetInfo + offline queue |
| Push notifications | Web Push (manifest) | Firebase Cloud Messaging (FCM) |
| Real-time | Polling (15s intervals) | Polling first; upgrade to WS later |
| Language toggle | localStorage `pahadi_lang` | AsyncStorage `pahadi_lang` |
| Device fingerprint | `crypto.randomUUID()` | `react-native-get-random-values` + `uuid` |

---

## Phase 0 — Foundation (Week 1)

> Get the skeleton right before any feature work. Everything else stacks on this.

### 0.1 Project bootstrap
- Confirm these packages are installed (all require native linking — run `pod install` after each on iOS):
  - `react-native-keychain` (secure token storage)
  - `@react-native-async-storage/async-storage`
  - `react-native-config` (`.env` → `Config.API_URL`)
  - `react-native-get-random-values` + `uuid` (device fingerprint)
  - `react-native-device-info` (app version, device ID)
  - `react-native-blob-util` (S3 file upload)
  - `react-native-image-resizer` (compress before upload)
- Set up `.env` (no prefix needed): `API_URL=https://api.pahadi.com/api`, `RAZORPAY_KEY_ID=rzp_live_xxx`
- Access env vars as `import Config from 'react-native-config'; Config.API_URL`
- Confirm Metro bundler config supports absolute imports from `@/` via `babel-plugin-module-resolver`

### 0.2 API client layer
- Port `lib/api.ts` from PWA to `src/lib/api.ts`
- Implement: base URL injection, `Authorization: Bearer` header, 401 → refresh → retry, 5xx retry for GET only, request timeout (10s), typed `ApiError`
- Write one integration smoke test (hit `/routes`)

### 0.3 Auth store
- Port `AuthContext.tsx` logic to a Zustand store (`src/store/auth.ts`)
- Storage: token + refreshToken in `SecureStore`, user object in `AsyncStorage`
- Expose: `user`, `token`, `isReady`, `login(payload)`, `logout()`
- JWT decode/expiry check on app foreground (AppState listener)

### 0.4 Navigation skeleton
- Install `@react-navigation/native`, `@react-navigation/bottom-tabs`, `@react-navigation/native-stack`
- Root navigator: `AuthStack` (Onboarding flow) ↔ `AppTabs` (Passenger) ↔ `DriverTabs`
- Role-based navigator switch happens after auth store `isReady === true`

### 0.5 Global providers
- `ToastProvider` → use `react-native-toast-message`
- `LanguageProvider` → AsyncStorage `pahadi_lang`, expose `tx(key)` function with en/hi translations
- `NetworkProvider` → `@react-native-community/netinfo`, show offline banner

---

## Phase 1 — Auth & Onboarding (Week 2)

> Must be identical to PWA flow including lockout logic, devOtpCode display in dev, and device fingerprint.

### Screens
1. **SplashScreen** — First launch only (AsyncStorage `pahadi_splash_seen`)
2. **PhoneScreen** — 10-digit phone entry, normalization
3. **OtpScreen** — 6-digit code, 60s resend timer, 3-attempt lockout
4. **NameScreen** — Only shown if backend indicates `requiresName: true`
5. **ConsentsScreen** — T&C + privacy, must be accepted before login completes

### API endpoints used
- `POST /onboarding/session` — generates sessionId + onboardingToken
- `POST /onboarding/profile` — request OTP (phase 1), verify OTP (phase 2), submit name (phase 3)
- `POST /auth/refresh` — on token expiry

### Device fingerprint
- Generate once using `uuid` v4 (with `react-native-get-random-values` polyfill), store in `AsyncStorage` key `pahadi_device_fingerprint`
- Send with every `/onboarding/session` request as `deviceFingerprint`

---

## Phase 2 — Passenger Core (Weeks 3–4)

> Represents the primary revenue path. This is the MVP unlock.

### Screens
1. **HomeScreen** — Route selector (from/to), date picker, recent booking banner, search button
2. **TripListScreen** — Filter by seat type, sort by price/time, trip cards
3. **TripDetailSheet** — Bottom sheet with full trip info + Book button
4. **BookingFormScreen** — Passenger details, luggage, payment method, extra passengers, fare summary
5. **PaymentScreen** — Razorpay react-native-razorpay SDK flow for UPI
6. **TicketScreen** — Confirmed ticket, QR code, share, cancel
7. **BookingsListScreen** — Upcoming / Past tabs, bookings + requests
8. **TrackingScreen** — react-native-maps with polling driver location every 15s

### State persistence
- Booking form: `AsyncStorage` key `pahadi_booking_form_{tripId}` — restore on back navigation

### Payment integration
- Replace web `checkout.js` with `react-native-razorpay` package
- Same flow: POST confirm → get `orderId` → open Razorpay → POST verify-payment
- Cash path: no SDK call, submit form with `paymentMethod: 'CASH'`

---

## Phase 3 — Passenger Extended (Week 5)

1. **ProfileScreen** — Name, phone, language toggle, logout
2. **RequestsNewScreen** — SEAT / FULL_VEHICLE / PARCEL form with geo search
3. **RequestDetailSheet** — Status, driver info, accepted offer view
4. **WalletScreen** — Balance display (GET `/wallet/me/balance`)

---

## Phase 4 — Driver Dashboard (Weeks 6–7)

> All driver screens are behind `role === 'DRIVER'` guard.

### Screens
1. **DriverHomeScreen** — Metrics (earnings, open seats, bookings), today's trips, online/offline toggle
2. **DriverOnboardingScreen** — Multi-step KYC: profile → documents → review → submitted
3. **DriverTripsScreen** — Post trip, edit/cancel, view manifest
4. **DriverBookingsScreen** — Seat bookings for driver's trips, collect-cash action
5. **DriverRequestsScreen** — FULL_VEHICLE + PARCEL requests (ACCEPTED status)
6. **DriverProfileScreen** — Profile + KYC doc status + vehicles

### Document upload
- GET signed upload URL from backend
- Use `react-native-blob-util` to PUT file bytes directly to S3 signed URL
- Compress images first with `react-native-image-resizer` (70% quality, max 1920px)
- POST file UUID + metadata back to backend

### Online/offline toggle
- `POST /drivers/me/go-online` or `/go-offline`
- Persists across sessions; fetch current status on dashboard load

---

## Phase 5 — Fleet / Organizations (Week 8)

1. **OrgListScreen** — Driver's organizations (GET `/organizations/me`)
2. **OrgDetailScreen** — Org info, membership status, blocked reasons
3. **OrgInviteScreen** — Deep link `/organization-invite/{token}` → show org details → accept
4. **OperatingContextPicker** — Select active context before going online

### Deep link handling
- Configure Universal Links / App Links for `app.pahadi.com/organization-invite/{token}`
- On cold start with invite link: authenticate first, then resume accept flow

---

## Phase 6 — Push Notifications & FCM (Week 9)

> Replaces Web Push. Needs backend FCM token registration endpoint.

- Install `@react-native-firebase/messaging`
- Register device token with backend on login (endpoint TBD with backend team)
- Handle notification tap → navigate to relevant screen (booking, request, invite)
- Request permission on first booking confirmation

---

## Phase 7 — Polish & Production (Week 10)

- E2E tests with Maestro (onboarding → search → book)
- Performance: FlatList virtualization, image caching with `react-native-fast-image`
- Accessibility: `accessibilityLabel`, `accessibilityRole` on all interactive elements
- Crash reporting: Sentry for React Native (`@sentry/react-native`)
- OTA updates: CodePush (`react-native-code-push`) via App Center for hotfixes
- App Store / Play Store submission checklist

---

## Risk Register

| Risk | Impact | Mitigation |
|---|---|---|
| Razorpay RN SDK API differences from web | High | Test in sandbox with UPI test cards early (Phase 2) |
| S3 direct upload CORS on mobile | Medium | Test with actual device early in Phase 4 |
| Deep link handling on Android (cold start race) | Medium | Use Linking.getInitialURL + navigation ready check |
| FCM token registration endpoint not yet in backend | Medium | Coordinate with backend before Phase 6 |
| KYC image sizes (8MB limit) | Low | Compress images before upload with `react-native-image-resizer` |

---

## Definition of Done (per phase)

- All screens in phase render correctly on iOS and Android
- All API calls succeed against staging backend
- Role guards work (passenger cannot see driver screens, vice versa)
- Auth token stored in Keychain (verified with Flipper or Reactotron)
- No crashes on cold start, background, or foreground transitions
- Language toggle works for all strings on affected screens
