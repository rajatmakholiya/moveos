# Pahadi Rides — Complete PWA Frontend Specification
## Codex Autonomous Build Prompt

---

## PRIME DIRECTIVE

Build the complete production PWA for **Pahadi Rides** — an intercity hill-taxi
booking platform serving Pithoragarh, Uttarakhand. This is a single comprehensive
specification. Read it entirely before writing a single line of code. Every section
is load-bearing.

**Stack:** Next.js 14 (App Router), TypeScript, Tailwind CSS, no external UI
component library. All state via React hooks + Context. Data fetching via native
fetch with SWR for client-side cache. Animations via Framer Motion.

**API base:** `process.env.NEXT_PUBLIC_API_URL` (e.g. `http://localhost:3000`)

**Two languages:** English (default) and Hindi. Every user-facing string must exist
in both. Use a flat translation object — no i18n library.

---

## PART 1 — DESIGN SYSTEM

### 1.1 Colour palette (CSS variables in globals.css)

```css
:root {
  --teal-900: #04342C;
  --teal-800: #085041;
  --teal-700: #0F6E56;   /* primary brand */
  --teal-600: #1D9E75;
  --teal-400: #5DCAA5;
  --teal-100: #9FE1CB;
  --teal-50:  #E1F5EE;

  --stone-900: #1C1917;
  --stone-800: #292524;
  --stone-700: #44403C;
  --stone-500: #78716C;
  --stone-300: #D6D3D1;
  --stone-100: #F5F5F4;
  --stone-50:  #FAFAF9;

  --amber-700: #B45309;
  --amber-400: #FBBF24;
  --amber-50:  #FFFBEB;

  --red-600:   #DC2626;
  --red-50:    #FEF2F2;

  --white: #FFFFFF;

  --surface:        var(--white);
  --surface-raised: var(--stone-50);
  --surface-inset:  var(--stone-100);
  --border:         var(--stone-300);
  --border-strong:  var(--stone-500);
  --text-primary:   var(--stone-900);
  --text-secondary: var(--stone-500);
  --text-hint:      var(--stone-300);
  --brand:          var(--teal-700);
  --brand-light:    var(--teal-50);
  --brand-dark:     var(--teal-900);
}
```

### 1.2 Typography

Use Google Fonts:
- Display/headings: **Sora** (weights 600, 700)
- Body: **DM Sans** (weights 400, 500)
- Monospace (booking IDs, codes): **JetBrains Mono**

```css
/* In layout.tsx <head> */
<link href="https://fonts.googleapis.com/css2?family=Sora:wght@600;700&family=DM+Sans:wght@400;500&family=JetBrains+Mono:wght@400&display=swap" rel="stylesheet" />
```

Type scale (Tailwind config extension):
```js
fontSize: {
  'display': ['2rem', { lineHeight: '1.15', fontWeight: '700', letterSpacing: '-0.02em' }],
  'title':   ['1.375rem', { lineHeight: '1.25', fontWeight: '600' }],
  'heading': ['1.125rem', { lineHeight: '1.3', fontWeight: '600' }],
  'body':    ['0.9375rem', { lineHeight: '1.6' }],
  'small':   ['0.8125rem', { lineHeight: '1.5' }],
  'micro':   ['0.6875rem', { lineHeight: '1.4', letterSpacing: '0.04em' }],
}
```

### 1.3 Spacing and shape

- Border radius: `rounded-2xl` (16px) for cards, `rounded-xl` (12px) for inputs/buttons, `rounded-full` for pills/tags
- Card shadow: `shadow-[0_2px_12px_rgba(0,0,0,0.07)]`
- Button height: 52px (touch-friendly)
- Input height: 52px
- Bottom safe area: always `pb-[env(safe-area-inset-bottom)]`
- Max content width: 480px centered — mobile-first, narrow desktop view

### 1.4 Motion constants (Framer Motion)

```ts
export const SPRING = { type: 'spring', stiffness: 400, damping: 35 };
export const EASE_OUT = { duration: 0.2, ease: [0.0, 0.0, 0.2, 1] };
export const PAGE_ENTER = { initial: { opacity: 0, y: 16 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.25, ease: [0.0, 0.0, 0.2, 1] } };
export const STAGGER_CONTAINER = { animate: { transition: { staggerChildren: 0.06 } } };
export const STAGGER_ITEM = { initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 } };
```

### 1.5 Shared components to build in `components/ui/`

Build these reusable primitives first. Everything else composes from them.

**Button** (`Button.tsx`)
Props: `variant: 'primary' | 'secondary' | 'ghost' | 'danger'`, `size: 'sm' | 'md' | 'lg'`, `loading: boolean`, `fullWidth: boolean`, `icon?: ReactNode`
- primary: `bg-[var(--brand)] text-white` with teal ripple on press
- secondary: `bg-[var(--brand-light)] text-[var(--brand)]`
- ghost: `bg-transparent border border-[var(--border)] text-[var(--text-primary)]`
- danger: `bg-[var(--red-50)] text-[var(--red-600)] border border-red-200`
- Loading state: replace children with a 20px spinner (CSS animation, no library)
- All buttons: `min-h-[52px]`, `rounded-xl`, `font-medium`, `transition-all`, `active:scale-[0.97]`

**Input** (`Input.tsx`)
Props: `label`, `error`, `hint`, `prefix?: ReactNode`, `suffix?: ReactNode`
- Height 52px, `rounded-xl`, border `var(--border)`, focus `var(--brand)` ring
- Floating label animation (label moves up when focused or has value)
- Error state: red border + red hint text below
- Hindi placeholder support via `placeholder` prop

**BottomSheet** (`BottomSheet.tsx`)
- Drag-to-dismiss with Framer Motion `drag="y"` constraint
- Backdrop blur behind sheet
- Handle bar at top
- `useEffect` locks body scroll when open

**Pill** (`Pill.tsx`)
Props: `color: 'teal' | 'amber' | 'red' | 'stone'`, `label`
- Small rounded-full badges for status, seat type, etc.

**SkeletonCard** (`SkeletonCard.tsx`)
- Animated shimmer skeleton matching TripCard dimensions
- CSS `@keyframes shimmer` with gradient sweep

**Toast** (via Context `ToastContext.tsx`)
- `useToast()` hook: `{ success, error, info }(message)`
- Toasts stack at top, auto-dismiss after 3s, slide-in from top

**LanguageToggle** (`LanguageToggle.tsx`)
- Floating pill: `EN | हिं` — taps toggle `useLanguage()` context

---

## PART 2 — GLOBAL SETUP

### 2.1 Translations (`lib/i18n.ts`)

```ts
export type Lang = 'en' | 'hi';

export const t: Record<string, Record<Lang, string>> = {
  // App
  appName:             { en: 'Pahadi Rides', hi: 'पहाड़ी राइड्स' },
  tagline:             { en: 'Hill taxis, booked simply', hi: 'पहाड़ी टैक्सी, आसान बुकिंग' },

  // Splash
  splashLoading:       { en: 'Loading...', hi: 'लोड हो रहा है...' },

  // Install prompt
  installTitle:        { en: 'Add to Home Screen', hi: 'होम स्क्रीन पर जोड़ें' },
  installDesc:         { en: 'Install Pahadi Rides for faster booking — works offline too.', hi: 'तेज़ बुकिंग के लिए इंस्टॉल करें — ऑफलाइन भी काम करता है।' },
  installBtn:          { en: 'Install App', hi: 'ऐप इंस्टॉल करें' },
  installDismiss:      { en: 'Not now', hi: 'अभी नहीं' },

  // Auth
  authTitle:           { en: 'Enter your mobile number', hi: 'मोबाइल नंबर दर्ज करें' },
  authSubtitle:        { en: "We'll send a 6-digit OTP", hi: 'हम एक OTP भेजेंगे' },
  authPhone:           { en: 'Mobile number', hi: 'मोबाइल नंबर' },
  authSendOtp:         { en: 'Send OTP', hi: 'OTP भेजें' },
  authOtpTitle:        { en: 'Enter OTP', hi: 'OTP दर्ज करें' },
  authOtpSent:         { en: 'OTP sent to', hi: 'OTP भेजा गया' },
  authVerify:          { en: 'Verify & Continue', hi: 'वेरीफाई करें' },
  authResend:          { en: 'Resend OTP', hi: 'OTP दोबारा भेजें' },
  authResendIn:        { en: 'Resend in', hi: 'दोबारा भेजें' },
  authName:            { en: 'Your name', hi: 'आपका नाम' },
  authNameHint:        { en: 'As it will appear on your ticket', hi: 'जैसा टिकट पर दिखेगा' },

  // Home
  homeSearchTitle:     { en: 'Where are you going?', hi: 'कहाँ जाना है?' },
  homeToday:           { en: 'Today', hi: 'आज' },
  homeTomorrow:        { en: 'Tomorrow', hi: 'कल' },
  homeSearchBtn:       { en: 'Search seats', hi: 'सीट खोजें' },
  homePopularRoutes:   { en: 'Popular routes', hi: 'लोकप्रिय मार्ग' },
  homeFrom:            { en: 'From', hi: 'से' },
  homeTo:              { en: 'To', hi: 'तक' },
  homeDate:            { en: 'Travel date', hi: 'यात्रा की तारीख' },

  // Trips
  tripsAvailable:      { en: 'available trips', hi: 'उपलब्ध यात्राएं' },
  tripsNoResults:      { en: 'No trips found for this date', hi: 'इस तारीख के लिए कोई यात्रा नहीं मिली' },
  tripsNoResultsHint:  { en: 'Try another date or route', hi: 'कोई और तारीख या मार्ग आज़माएं' },
  tripsDeparture:      { en: 'Departure', hi: 'प्रस्थान' },
  tripsSeatsLeft:      { en: 'seats left', hi: 'सीटें बची हैं' },
  tripsFront:          { en: 'Front seat', hi: 'आगे की सीट' },
  tripsBack:           { en: 'Back seat', hi: 'पीछे की सीट' },
  tripsFullVehicle:    { en: 'Full vehicle', hi: 'पूरी गाड़ी' },
  tripsBookFront:      { en: 'Book front seat', hi: 'आगे की सीट बुक करें' },
  tripsBookBack:       { en: 'Book back seat', hi: 'पीछे की सीट बुक करें' },
  tripsSoldOut:        { en: 'Sold out', hi: 'बिक गई' },
  tripsDriverRating:   { en: 'trips completed', hi: 'यात्राएं पूर्ण' },

  // Booking
  bookTitle:           { en: 'Confirm your seat', hi: 'अपनी सीट कन्फर्म करें' },
  bookPassengerName:   { en: 'Passenger name', hi: 'यात्री का नाम' },
  bookPhone:           { en: 'Contact number', hi: 'संपर्क नंबर' },
  bookEmergency:       { en: 'Emergency contact (optional)', hi: 'आपातकालीन संपर्क (वैकल्पिक)' },
  bookLuggage:         { en: 'Luggage size', hi: 'सामान का आकार' },
  bookLuggageSmall:    { en: 'Small bag', hi: 'छोटा बैग' },
  bookLuggageLarge:    { en: 'Large bag / trolley', hi: 'बड़ा बैग / ट्रॉली' },
  bookLuggageOversized:{ en: 'Oversized / multiple bags', hi: 'बड़ा / कई बैग' },
  bookLuggageFree:     { en: 'Free', hi: 'मुफ़्त' },
  bookPayment:         { en: 'Payment method', hi: 'भुगतान का तरीका' },
  bookPayUpi:          { en: 'Pay now via UPI', hi: 'UPI से अभी भुगतान करें' },
  bookPayCash:         { en: 'Pay cash at departure', hi: 'प्रस्थान पर नकद भुगतान' },
  bookFareSummary:     { en: 'Fare summary', hi: 'किराया सारांश' },
  bookBaseFare:        { en: 'Base fare', hi: 'आधार किराया' },
  bookLuggageSurcharge:{ en: 'Luggage surcharge', hi: 'सामान का अतिरिक्त शुल्क' },
  bookTotal:           { en: 'Total', hi: 'कुल' },
  bookConfirm:         { en: 'Confirm booking', hi: 'बुकिंग कन्फर्म करें' },
  bookGstin:           { en: 'GSTIN (for invoice)', hi: 'GSTIN (इनवॉइस के लिए)' },

  // Confirmation
  confirmTitle:        { en: 'Booking confirmed!', hi: 'बुकिंग कन्फर्म हो गई!' },
  confirmTicket:       { en: 'Your ticket', hi: 'आपका टिकट' },
  confirmShare:        { en: 'Share ticket', hi: 'टिकट शेयर करें' },
  confirmDownload:     { en: 'Download invoice', hi: 'इनवॉइस डाउनलोड करें' },
  confirmTrack:        { en: 'Track live location', hi: 'लाइव लोकेशन देखें' },
  confirmAddCal:       { en: 'Add to calendar', hi: 'कैलेंडर में जोड़ें' },
  confirmCancelBook:   { en: 'Cancel booking', hi: 'बुकिंग रद्द करें' },

  // My bookings
  myBookings:          { en: 'My bookings', hi: 'मेरी बुकिंग' },
  myBookingsEmpty:     { en: 'No bookings yet', hi: 'अभी तक कोई बुकिंग नहीं' },
  myBookingsEmptyHint: { en: 'Your trip history will appear here', hi: 'आपकी यात्रा इतिहास यहाँ दिखेगा' },

  // Driver post trip
  driverPost:          { en: 'Post a trip', hi: 'यात्रा पोस्ट करें' },
  driverRoute:         { en: 'Select route', hi: 'मार्ग चुनें' },
  driverDeparture:     { en: 'Departure date & time', hi: 'प्रस्थान तारीख और समय' },
  driverFrontSeats:    { en: 'Front seats', hi: 'आगे की सीटें' },
  driverBackSeats:     { en: 'Back seats', hi: 'पीछे की सीटें' },
  driverPoint:         { en: 'Pickup point', hi: 'पिकअप स्थान' },
  driverLuggage:       { en: 'Luggage policy', hi: 'सामान नीति' },
  driverNotes:         { en: 'Notes for passengers (optional)', hi: 'यात्रियों के लिए नोट्स (वैकल्पिक)' },
  driverPostBtn:       { en: 'Post trip', hi: 'यात्रा पोस्ट करें' },
  driverManifest:      { en: 'Departure manifest', hi: 'प्रस्थान सूची' },
  driverGoOnline:      { en: 'Go online', hi: 'ऑनलाइन जाएं' },
  driverGoOffline:     { en: 'Go offline', hi: 'ऑफलाइन जाएं' },

  // Location
  locationSharing:     { en: 'Sharing live location', hi: 'लाइव लोकेशन शेयर हो रही है' },
  locationShare:       { en: 'Share live location', hi: 'लाइव लोकेशन शेयर करें' },
  locationStop:        { en: 'Stop sharing', hi: 'शेयरिंग बंद करें' },
  locationCopied:      { en: 'Link copied!', hi: 'लिंक कॉपी हो गया!' },

  // Status
  statusConfirmed:     { en: 'Confirmed', hi: 'कन्फर्म' },
  statusPending:       { en: 'Pending payment', hi: 'भुगतान बाकी' },
  statusCancelled:     { en: 'Cancelled', hi: 'रद्द' },
  statusCompleted:     { en: 'Completed', hi: 'पूर्ण' },
  statusOpen:          { en: 'Open', hi: 'खुला' },
  statusDeparted:      { en: 'Departed', hi: 'रवाना' },

  // Errors
  errRequired:         { en: 'This field is required', hi: 'यह फ़ील्ड आवश्यक है' },
  errPhone:            { en: 'Enter a valid 10-digit mobile number', hi: 'वैध 10 अंकों का नंबर दर्ज करें' },
  errOtpInvalid:       { en: 'Incorrect OTP. Try again.', hi: 'OTP गलत है। फिर कोशिश करें।' },
  errOtpExpired:       { en: 'OTP expired. Request a new one.', hi: 'OTP समाप्त हो गया। नया मंगाएं।' },
  errNetwork:          { en: 'No internet connection', hi: 'इंटरनेट कनेक्शन नहीं है' },
  errGeneric:          { en: 'Something went wrong. Please try again.', hi: 'कुछ गड़बड़ हुई। फिर कोशिश करें।' },
  errSeatTaken:        { en: 'This seat was just booked. Please choose another.', hi: 'यह सीट अभी बुक हो गई। कृपया दूसरी चुनें।' },
  errTripCancelled:    { en: 'This trip has been cancelled by the driver.', hi: 'ड्राइवर ने यह यात्रा रद्द कर दी।' },
};

export function tx(key: keyof typeof t, lang: Lang): string {
  return t[key]?.[lang] ?? t[key]?.['en'] ?? key;
}
```

### 2.2 Language context (`lib/LanguageContext.tsx`)

```tsx
'use client';
import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import type { Lang } from './i18n';

const LanguageContext = createContext<{
  lang: Lang;
  toggleLang: () => void;
}>({ lang: 'en', toggleLang: () => {} });

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>('en');

  useEffect(() => {
    const saved = localStorage.getItem('pahadi_lang') as Lang | null;
    if (saved) setLang(saved);
  }, []);

  const toggleLang = () => {
    setLang(prev => {
      const next = prev === 'en' ? 'hi' : 'en';
      localStorage.setItem('pahadi_lang', next);
      return next;
    });
  };

  return (
    <LanguageContext.Provider value={{ lang, toggleLang }}>
      {children}
    </LanguageContext.Provider>
  );
}

export const useLanguage = () => useContext(LanguageContext);
```

### 2.3 Auth context (`lib/AuthContext.tsx`)

```tsx
'use client';
// Store: { token, role ('PASSENGER'|'DRIVER'|'AGENT'), userId, passengerId?, driverId? }
// Persists to localStorage key 'pahadi_auth'
// Exposes: user, token, login(tokenPayload), logout()
// On mount: validate token expiry (decode JWT exp field)
// If token expired: clear localStorage, set user=null silently
```

Full implementation required. JWT decode without library: `JSON.parse(atob(token.split('.')[1]))`.

### 2.4 API client (`lib/api.ts`)

```ts
// Base fetcher that:
// 1. Prepends NEXT_PUBLIC_API_URL
// 2. Attaches Authorization: Bearer {token} from AuthContext if present
// 3. On 401: calls logout() from AuthContext
// 4. On network failure: throws { code: 'NETWORK_ERROR' }
// 5. On non-ok response: throws { code, message } from response JSON
// 6. Retry once on 5xx after 1s delay

export const api = {
  get:    <T>(path: string, token?: string) => Promise<T>,
  post:   <T>(path: string, body: unknown, token?: string) => Promise<T>,
  patch:  <T>(path: string, body: unknown, token?: string) => Promise<T>,
  delete: <T>(path: string, token?: string) => Promise<T>,
};
```

### 2.5 PWA manifest (`public/manifest.json`)

```json
{
  "name": "Pahadi Rides",
  "short_name": "Pahadi Rides",
  "description": "Book hill taxi seats — Pithoragarh to Dehradun, Delhi, Haldwani",
  "start_url": "/",
  "display": "standalone",
  "orientation": "portrait",
  "theme_color": "#0F6E56",
  "background_color": "#FAFAF9",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any maskable" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any maskable" }
  ],
  "categories": ["travel", "navigation"],
  "lang": "en-IN",
  "dir": "ltr",
  "prefer_related_applications": false
}
```

### 2.6 next.config.js (PWA + service worker)

```js
const withPWA = require('next-pwa')({
  dest: 'public',
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === 'development',
  runtimeCaching: [
    {
      urlPattern: /^https:\/\/fonts\.googleapis\.com/,
      handler: 'CacheFirst',
      options: { cacheName: 'google-fonts', expiration: { maxEntries: 4, maxAgeSeconds: 365 * 24 * 60 * 60 } }
    },
    {
      urlPattern: /\/api\/routes$/,
      handler: 'StaleWhileRevalidate',
      options: { cacheName: 'routes-cache', expiration: { maxEntries: 1, maxAgeSeconds: 60 * 60 } }
    },
    {
      urlPattern: /\/api\/trips\/available/,
      handler: 'NetworkFirst',
      options: { cacheName: 'trips-cache', networkTimeoutSeconds: 5,
        expiration: { maxEntries: 20, maxAgeSeconds: 4 * 60 * 60 } }
    },
  ],
});
module.exports = withPWA({ reactStrictMode: true });
```

### 2.7 Root layout (`app/layout.tsx`)

```tsx
// Wraps everything in:
// <LanguageProvider>
//   <AuthProvider>
//     <ToastProvider>
//       <InstallPromptProvider>
//         {children}
//         <Toast />
//       </InstallPromptProvider>
//     </ToastProvider>
//   </AuthProvider>
// </LanguageProvider>
//
// metadata: title 'Pahadi Rides', description, themeColor '#0F6E56'
// viewport: width=device-width, initial-scale=1, viewport-fit=cover
// apple-touch-icon, apple-mobile-web-app-capable, apple-mobile-web-app-status-bar-style
```

---

## PART 3 — SPLASH SCREEN

**File:** `components/SplashScreen.tsx`

This component mounts over everything on first load and dismisses after assets are ready.

Behaviour:
- Mount on top of page content with `position: fixed, inset: 0, z-index: 9999`
- Background: `var(--brand)` (teal)
- Centre: SVG mountain silhouette (simple two-peak outline, hand-crafted SVG path, white fill, 80px tall) above app name in Sora 700, white, 28px
- Tagline below in DM Sans 400, `var(--teal-100)`, 15px — in current language
- Bottom: subtle loading bar (`width: 0% → 100%`, CSS animation over 1.8s, `var(--teal-400)` colour)
- Dismissal: after 2s OR when `document.readyState === 'complete'` (whichever is later), animate out with `opacity: 0, scale: 1.04` over 300ms, then unmount
- On subsequent visits (after first install): reduce to 800ms max

**Integration in `app/page.tsx`:**
```tsx
const [showSplash, setShowSplash] = useState(true);
// Render <SplashScreen onDone={() => setShowSplash(false)} /> conditionally
```

The mountain SVG path (approximate, refine for clean silhouette):
```svg
<path d="M20 80 L80 20 L120 50 L160 10 L200 80 Z" fill="white" opacity="0.95"/>
```
Make it feel natural, not clipart. Two peaks, slight asymmetry. Add a tiny moon or star above for character.

---

## PART 4 — INSTALL PROMPT

**File:** `lib/InstallPromptContext.tsx` + `components/InstallBanner.tsx`

The PWA install prompt is the most important conversion surface. Handle it carefully.

### Context

```tsx
// Listen for 'beforeinstallprompt' event
// Store the event in state (deferredPrompt)
// Expose: { canInstall, triggerInstall, dismissInstall }
// dismissInstall: set localStorage 'pahadi_install_dismissed' = timestamp
// Don't show banner if dismissed in last 7 days
// Don't show if already installed (check display-mode: standalone)
```

### InstallBanner component

Show as a **bottom sheet** that slides up from below on first visit (delay 4s after splash dismisses, so it doesn't overwhelm).

Layout:
```
┌─────────────────────────────────────┐
│  🏔️  Add Pahadi Rides to your       │
│      home screen                     │
│  Works offline · Instant booking    │
│                                     │
│  [Install App]        [Not now]     │
└─────────────────────────────────────┘
```

- Mountain emoji replaced with the actual SVG icon at 32px
- `[Install App]` → primary button → calls `triggerInstall()` → shows native browser prompt
- After `triggerInstall()`: listen for `appinstalled` event → show success toast "Pahadi Rides installed!"
- `[Not now]` → ghost button → calls `dismissInstall()`
- iOS Safari doesn't fire `beforeinstallprompt`. Detect iOS (`/iPad|iPhone|iPod/.test(navigator.userAgent)`) and show a custom bottom sheet: "Tap the Share button, then 'Add to Home Screen'" with an annotated screenshot-style diagram

### iOS install guide sheet

Show only on iOS Safari when not already standalone:
```
┌─────────────────────────────────────┐
│  Install Pahadi Rides               │
│                                     │
│  1. Tap the Share icon [↑] below    │
│  2. Scroll down and tap             │
│     "Add to Home Screen"            │
│  3. Tap "Add" to confirm            │
│                                     │
│  [Got it]                           │
└─────────────────────────────────────┘
```

---

## PART 5 — NAVIGATION

**File:** `components/BottomNav.tsx`

Fixed bottom navigation. Shows only when user is on main app pages (not onboarding, not booking flow).

Tabs:
- **Home** (search): `ti-home` icon — route `/`
- **My Trips**: `ti-ticket` icon — route `/bookings`
- **Driver** (if role=DRIVER): `ti-steering-wheel` — route `/driver`
- **Profile**: `ti-user` icon — route `/profile`

Active tab: teal icon + teal label, thin teal underline dot. Inactive: stone-400.
Height: 64px + `env(safe-area-inset-bottom)`.
Animate tab change with Framer Motion `layoutId="tab-indicator"` underline.

---

## PART 6 — ONBOARDING FLOW

All onboarding screens: `app/onboarding/` directory.

### 6.1 Welcome screen (`app/onboarding/page.tsx`)

**Only shown to logged-out users on first visit.**

Full-screen layout:
- Top 55%: illustrated hero — stylised mountain road with a Bolero silhouette (SVG, not photo). Teal sky, white peaks, amber headlights. This is the brand moment — make it beautiful.
- Bottom 45%: white card sliding up from bottom
  - "Pahadi Rides" in Sora 700, 28px, teal
  - Tagline in current language
  - Three feature pills in a row: `🏔️ Hill routes` · `📍 Live tracking` · `✅ Instant booking`
  - Primary button: "Get started" → `/onboarding/phone`
  - Ghost button below: "I'm a driver" → `/onboarding/phone?role=DRIVER`

### 6.2 Phone entry screen (`app/onboarding/phone/page.tsx`)

Query param: `role?: 'DRIVER' | 'PASSENGER'` (default PASSENGER)

Layout:
- Back arrow top left
- Title: `tx('authTitle', lang)` — 22px Sora 600
- Subtitle: `tx('authSubtitle', lang)` — stone-500
- Country code pill `+91` (non-editable, teal background) + phone input side by side
- Phone input: numeric keyboard (`inputMode="numeric"`), max 10 digits, auto-format as user types
- "Send OTP" button (disabled until 10 digits)
- On submit: `POST /api/onboarding/session` then `POST /api/onboarding/profile`

**Edge cases:**
- Invalid number (not 10 digits): inline error below input, button stays disabled
- Rate limit (429 from API): "You've requested too many OTPs. Try again in X minutes." — parse `retryAfter` from response
- Network error: retry button with offline indicator at top of screen
- Pre-existing account: continue seamlessly (OTP flow is same)

### 6.3 OTP verification screen (`app/onboarding/otp/page.tsx`)

- Shows masked phone number: "+91 XXXXX X{last 5 digits}"
- 6 individual digit input boxes (each 48px × 56px, auto-advance on input, auto-backspace to prev on delete)
- Auto-submit when all 6 digits entered
- Countdown timer: "Resend OTP in 0:47" counting down from 60s, then shows "Resend OTP" link
- Haptic feedback on success/error (if `navigator.vibrate` available)

**Edge cases:**
- Wrong OTP: shake animation on input boxes (`@keyframes shake`), error message, inputs cleared, focus back to first box
- Expired OTP: "OTP expired" message with "Request new OTP" button (goes back to phone screen pre-filled)
- 3 failed attempts: lock screen for 10 minutes with countdown, explain reason
- Paste support: if clipboard contains 6 digits, auto-fill all boxes
- SMS auto-read: include `autocomplete="one-time-code"` on inputs

### 6.4 Name screen (`app/onboarding/name/page.tsx`)

Only shown if user has no name set yet (new user).

- Single text input: passenger name
- Hint: `tx('authNameHint', lang)`
- "Continue" → `POST /api/onboarding/complete`
- On success: save token + user to AuthContext, navigate to `/`

For DRIVER role: after name, show consents screen before complete.

### 6.5 Consents screen (DRIVER only) (`app/onboarding/consents/page.tsx`)

- Three toggle rows:
  1. Location permission — required, cannot proceed without
  2. Notifications — recommended (explain why)
  3. Marketing — optional
- Each row: icon + title + subtitle + toggle switch
- "Continue" disabled until location is toggled on
- Location toggle: triggers `navigator.permissions.query({ name: 'geolocation' })` — if denied, show modal explaining how to enable in browser settings

---

## PART 7 — HOME / SEARCH

**File:** `app/page.tsx`

Protected by: no auth required to view. Auth required to book.

### 7.1 Layout

```
┌─────────────────────────────────────┐
│  🏔 Pahadi Rides        [EN|हिं]   │  ← top bar (teal bg)
│  Where are you going?              │
│  ─────────────────────────────────  │
│  [FROM: Pithoragarh ▼]             │
│  [TO: Dehradun ▼     ]             │
│  [DATE: Today, 12 May ▼]           │
│  [🔍 Search seats          ]       │
│  ─────────────────────────────────  │
│  Popular routes                    │
│  [→ Dehradun] [→ Delhi] [→ Haldi]  │
│  ─────────────────────────────────  │
│  Recent booking (if logged in)     │
│  ─────────────────────────────────  │
│       BottomNav                    │
└─────────────────────────────────────┘
```

### 7.2 Route selectors

On tap, open `BottomSheet` with route list (fetched from `GET /api/routes`).
Routes displayed as: `Pithoragarh → Dehradun  (8 hrs · ~260 km)`.
Tapping a route closes the sheet and populates From/To.
From field is always "Pithoragarh" (single origin MVP). To is the destination.

Cache routes in SWR with 1hr revalidation.

**Edge case:** No routes loaded (network error): show "Unable to load routes" with retry button. Allow manual entry as fallback.

### 7.3 Date selector

Open `BottomSheet` with a minimal calendar:
- Month/year header with prev/next arrows
- 7-day column grid (Mon–Sun)
- Disable past dates (grey, not tappable)
- Highlight today with teal circle
- Selected date: filled teal circle, white text
- Quick pills above calendar: "Today" | "Tomorrow" | "This weekend"
- Max future date: 30 days from today

### 7.4 Popular route pills

Horizontally scrollable row of pills: tap any to pre-fill destination and navigate to trips.

### 7.5 Recent booking card

If logged in and has bookings: show last upcoming booking as a card with:
- Route, date, departure time
- Status pill (Confirmed / Pending)
- "View ticket" button → `/bookings/{id}`

---

## PART 8 — TRIP LISTING

**File:** `app/trips/page.tsx`

Query params: `routeId`, `date`, `seatType?`

### 8.1 Header

```
← Back    Pithoragarh → Dehradun    [EN|हिं]
          Mon, 12 May · 3 trips
```

Filter bar below header (sticky):
- Seat type filter: `All | Front | Back`
- Sort: `Earliest | Cheapest` (tap cycles)

### 8.2 Trip card

```
┌─────────────────────────────────────┐
│  08:30 AM          Ramesh Kumar    │
│  Pithoragarh→Ddn   ★ 4.8 · 124 trips│
│                    Mahindra Bolero  │
│  ──────────────────────────────────│
│  Front: ₹2,500  ·  1 seat left     │
│  Back:  ₹2,000  ·  3 seats left    │
│                   [Book seat →]    │
└─────────────────────────────────────┘
```

- Card tap → expand to show driver notes + departure point map pin
- `Book seat →` → open seat selection bottom sheet
- `0 seats left` for a type: show struck-through price + "Sold out" pill

**Edge cases:**
- Trip status=DEPARTED: show "Trip departed" banner, card greyed out, no book button
- Trip status=CANCELLED: show "Cancelled by driver" pill, card dimmed
- < 2 seats left: amber pill "Only X left" with pulse animation
- All seats sold: card stays visible but "Fully booked" state

### 8.3 Seat selection bottom sheet

Opens from "Book seat →":
```
┌─────────────────────────────────────┐
│  ▬  Select your seat               │
│                                     │
│  ○ Front seat                       │
│    ₹2,500  ·  1 available          │
│                                     │
│  ● Back seat                        │
│    ₹2,000  ·  3 available          │
│                                     │
│  Luggage: Driver allows 1 bag free  │
│                                     │
│  [Continue →]                       │
└─────────────────────────────────────┘
```

Disabled option if 0 seats. "Continue →" → `/trips/{tripId}/book?seatType=BACK`.

### 8.4 Empty and loading states

Loading: 3 skeleton cards with shimmer.
Empty: illustration (simple SVG of empty road, mountains) + message + "Search another date" button.
Network error: "No connection" banner with retry.

---

## PART 9 — BOOKING FORM

**File:** `app/trips/[tripId]/book/page.tsx`

Query param: `seatType=FRONT|BACK`

### 9.1 Trip summary bar (sticky top)

```
Pithoragarh → Dehradun  |  08:30 AM  |  Back seat  |  ₹2,000
```

Teal background, white text, cannot scroll away.

### 9.2 Form sections

**Section 1: Passenger details**
- Name (pre-filled if logged in) — required
- Phone (pre-filled if logged in) — required, editable
- Emergency contact — optional, labelled clearly
- GSTIN — optional, collapsed behind "Add GSTIN for invoice" tap

**Section 2: Luggage**
Three radio cards with icons:
```
[👜] Small bag         ₹0 extra
[🧳] Large bag/trolley  ₹50 extra
[📦] Oversized/multiple ₹150 extra
```
Selected state: teal border, teal checkmark top-right of card.
Fare summary updates live as luggage changes.

**Section 3: Payment method**
Two option cards:
```
[📲] Pay now via UPI     Secure · Instant confirmation
[💵] Pay cash at pickup  Bring exact change
```
If UPI selected: show Razorpay logo + "You'll be redirected to complete payment"
If Cash selected: amber info banner "Driver expects cash at departure. Seat is held for 30 mins."

**Section 4: Fare summary card**
```
┌─────────────────────────────────────┐
│  Fare summary                       │
│  Back seat                 ₹2,000  │
│  Large bag surcharge         ₹50   │
│  ─────────────────────────────────  │
│  Total                     ₹2,050  │
│                                     │
│  Cancellation: Free before 12 hrs  │
└─────────────────────────────────────┘
```

### 9.3 Submit button

"Confirm booking" — sticky bottom, above safe area.
Disabled if required fields empty or form has validation errors.

### 9.4 Validation (all inline, no alert dialogs)

- Name: required, min 2 chars, max 60 chars, no numbers
- Phone: exactly 10 digits after stripping spaces/dashes
- Emergency contact: if entered, validate same as phone
- GSTIN: if entered, validate 15-char format `[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}`

### 9.5 Submission flow

1. Client-side validation pass
2. If not logged in → show auth bottom sheet (phone → OTP → continue to booking)
3. `POST /api/bookings`
4. Loading state on button
5. **Success + UPI:** Razorpay checkout opens (use Razorpay JS SDK in a `<Script>` tag). On payment success → navigate to `/bookings/{id}/confirm`
6. **Success + Cash:** navigate directly to `/bookings/{id}/confirm`
7. **409 seat taken:** toast "Seat just booked — please select another" → navigate back to seat selection
8. **Network error during submit:** toast with retry. Do NOT double-submit — disable button during in-flight request.
9. **Trip cancelled mid-booking (API returns 410):** full-screen error: "This trip was cancelled" with "Find another trip" button

---

## PART 10 — BOOKING CONFIRMATION

**File:** `app/bookings/[bookingId]/confirm/page.tsx`

### 10.1 Success animation

On first load: green checkmark with a circular reveal animation (SVG stroke-dashoffset animation, 600ms). Plays once.

### 10.2 Digital ticket

```
┌─────────────────────────────────────┐  ← teal header
│  ✓  Booking confirmed!             │
│     PR-2026-000042                  │
├─────────────────────────────────────┤  ← white body
│  Pithoragarh → Dehradun            │
│  Mon, 12 May 2026 · 08:30 AM       │
│                                     │
│  Back seat                 ₹2,050  │
│  Ramesh Kumar · Bolero UP08AZ1234  │
│                                     │
│  Pickup: Bus stand, Pithoragarh    │
│                                     │
│  CONFIRMED  ·  Cash at departure   │
├── ── ── ── ── ── ── ── ── ── ── ──┤  ← dashed line (ticket perforation feel)
│  Passenger: Ajay Singh             │
│  Phone: +91 98765 43210            │
└─────────────────────────────────────┘
```

The dashed separator must look like a physical ticket tear line. CSS: `border-top: 2px dashed var(--stone-300)`.

### 10.3 Action buttons

```
[📤 Share ticket]     [📄 Download invoice]
[📍 Track live location]
[📅 Add to calendar]
```

**Share ticket:** `navigator.share({ title: 'Pahadi Rides Ticket', text: '...', url: window.location.href })`. Fallback: copy URL to clipboard.

**Download invoice:** `GET /api/invoices/{bookingId}` → receive PDF blob → trigger download as `ticket-PR-2026-000042.pdf`.

**Track live location:** Opens `/track/{bookingId}` (see Part 12).

**Add to calendar:** Generate `.ics` file client-side:
```
BEGIN:VCALENDAR
BEGIN:VEVENT
DTSTART:{departureAt in YYYYMMDDTHHmmssZ}
SUMMARY:Pahadi Rides — Pithoragarh to Dehradun
DESCRIPTION:Booking PR-2026-000042 · Ramesh Kumar · UP08AZ1234
END:VEVENT
END:VCALENDAR
```
Trigger `.ics` file download.

### 10.4 Cancel booking link

Small text link at bottom: "Cancel this booking". On tap: confirmation bottom sheet:
```
Are you sure you want to cancel?
Your seat will be released.
[Yes, cancel]    [Keep booking]
```
Call `POST /api/bookings/{id}/cancel`. On success: update UI to cancelled state, show refund timeline if UPI payment was made.

---

## PART 11 — MY BOOKINGS

**File:** `app/bookings/page.tsx`

Requires auth. Redirect to `/onboarding` if not logged in.

### 11.1 Tab bar

`Upcoming | Past` — tap to switch, slide indicator.

### 11.2 Booking card (compact)

```
┌─────────────────────────────────────┐
│  Pithoragarh → Dehradun  [Confirmed]│
│  Mon, 12 May · 08:30 AM            │
│  Back seat · ₹2,050 · Ramesh Kumar │
│                    [View ticket →] │
└─────────────────────────────────────┘
```

Status pill colours:
- Confirmed: teal
- Pending payment: amber
- Cancelled: stone (grey)
- Completed: stone with ✓

### 11.3 Empty state

SVG illustration: a mountain road, empty car, "Start your journey" copy + Search button.

### 11.4 Pull to refresh

`onTouchStart/onTouchMove/onTouchEnd` gesture — pull down > 60px triggers reload with spinner. Native feel without any library.

---

## PART 12 — LIVE LOCATION TRACKING

**File:** `app/track/[bookingId]/page.tsx`

This page is shareable (no auth required to view — just bookingId in URL).

### 12.1 Map view

Use **Leaflet.js** (load via CDN `<Script>`). Tile provider: OpenStreetMap (free, no API key).

Map shows:
- Driver's current location: teal pulsing dot with Bolero icon marker
- Pickup point: pin with home icon
- Destination: pin with flag icon
- Route line between driver current → destination (use Ola Maps directions if available, fallback to straight line)

Map auto-centers and zooms to fit all markers.

### 12.2 Info panel (bottom, above map)

```
┌─────────────────────────────────────┐
│  📍 Ramesh Kumar is on the way      │
│     08:30 AM departure              │
│                                     │
│  Sharing live location              │
│  [Copy link]   [Open in Maps]      │
└─────────────────────────────────────┘
```

"Open in Maps": `https://maps.google.com/?q={lat},{lng}` (driver's current location).

### 12.3 Driver-side location sharing

On the driver's confirmation screen, a toggle: "Share live location with passengers".
When toggled ON:
1. Request `navigator.geolocation.watchPosition` permission
2. Every 15 seconds: `POST /api/telemetry/location` with `{ lat, lng }`
3. Persistent notification bar at top: "📍 Sharing live location" in teal, with "Stop" button
4. Background tab: use Page Visibility API — reduce frequency to 60s when tab hidden

**Edge cases:**
- Geolocation denied: explain why it's needed, show browser settings link
- GPS unavailable (mountains, tunnels): show "Location unavailable" on tracking page, last known shown with timestamp "Last seen 3 min ago"
- Driver stops sharing: tracking page shows "Driver stopped sharing location. Contact: [phone]"

### 12.4 Location sharing link generation

Generate a shareable URL: `{APP_URL}/track/{bookingId}?token={shortToken}`
The token is derived from bookingId (no extra auth needed — bookingId is unguessable cuid).

---

## PART 13 — DRIVER DASHBOARD

**File:** `app/driver/page.tsx`

Requires auth with role=DRIVER. Redirect non-drivers to `/`.

### 13.1 Status bar (top, full width)

```
OFFLINE                          [Go Online →]
```
When online:
```
🟢 ONLINE since 08:15 AM         [Go Offline]
```
Call `POST /api/drivers/me/go-online` / `go-offline`.

### 13.2 Today's trips section

List of driver's trips for today:
- Trip card: route, departure time, seats booked vs available, status
- Tap → trip detail / manifest

### 13.3 Post new trip button (floating action button)

FAB bottom-right: `+` icon, teal background.
Tap → `/driver/post-trip`

### 13.4 Earnings snapshot

```
This week: ₹12,400
This month: ₹48,200
```
Tap → `/driver/earnings` (full earnings screen).

---

## PART 14 — DRIVER POST TRIP

**File:** `app/driver/post-trip/page.tsx`

### 14.1 Form

**Route selector:** BottomSheet with route list. Shows route + distance + estimated hours.

**Date and time:**
- Date picker (same calendar as passenger side)
- Time picker: hour (05–22) and minute (00, 15, 30, 45) scrollable drums. No native `<input type="time">` — it looks inconsistent across devices.
- Validation: departure must be at least 2 hours from now

**Seats:**
- Front seats: stepper `0 | 1` (most vehicles have 1 front)
- Back seats: stepper `1 | 2 | 3 | 4`

**Pickup point:**
- Free text input with placeholder "e.g. Bus stand, Pithoragarh"
- Below: map thumbnail (Leaflet, small) showing approximate pickup. Tappable to adjust pin. `navigator.geolocation.getCurrentPosition` to pre-fill.

**Luggage policy:**
- Radio: `Free for passengers` | `Surcharge applies`
- If surcharge: show the platform's fixed surcharge amounts (not driver-configurable)

**Notes for passengers:**
- Textarea, max 200 chars, character counter

### 14.2 Submit

`POST /api/scheduling/trips`. On success: navigate to trip detail page with "Trip posted!" toast.

**Edge cases:**
- Duplicate trip (same route, same date, similar time): API returns 409 → "You already have a trip on this route at this time. View existing trip?" with link
- Invalid departure time (< 2hr): inline error
- No route selected: highlight route field on submit attempt

---

## PART 15 — TRIP MANIFEST (DRIVER)

**File:** `app/driver/trips/[tripId]/manifest/page.tsx`

### 15.1 Header

```
← Back    Departure Manifest
          Pithoragarh → Dehradun · 08:30 AM
```

### 15.2 Passenger list

Each row:
```
┌─────────────────────────────────────┐
│  1  Ajay Singh          Back seat  │
│     +91 98765 43210     ₹2,050     │
│     Small bag           Cash ⏳     │
└─────────────────────────────────────┘
```

Payment status icons: ✅ Paid · ⏳ Cash pending · ❌ Cancelled

### 15.3 Summary row

```
Total passengers: 4  ·  Total to collect: ₹4,100 (cash)
```

### 15.4 Actions

- "Call passenger" → `tel:{phone}` link on each row
- "Print manifest" → `window.print()` with a print-optimised CSS `@media print` that hides nav and shows clean list
- "Cancel trip" → confirmation bottom sheet → `POST /api/scheduling/trips/{id}/cancel`

---

## PART 16 — PROFILE

**File:** `app/profile/page.tsx`

### 16.1 Profile header

Avatar circle with initials (first letter of name, teal bg).
Name, phone number.
Edit button → inline edit mode.

### 16.2 Menu items

```
[🎟️] My bookings
[📄] My invoices
[🔔] Notifications
[🌐] Language: English / हिंदी
[📞] Help & support
[ℹ️] About Pahadi Rides
[🚪] Log out
```

### 16.3 Language switcher

Inline in profile list. Tapping opens a modal:
```
Select language
○ English
● हिंदी
```
Sets `LanguageContext` + persists to localStorage. Page content switches immediately without reload.

### 16.4 Log out

Confirmation bottom sheet: "Are you sure you want to log out?" → clears AuthContext + localStorage → redirects to `/onboarding`.

---

## PART 17 — EDGE CASES AND OFFLINE HANDLING

### 17.1 Network offline banner

Detect via `navigator.onLine` + `window.addEventListener('offline'/'online')`.
When offline: banner at top of every page:
```
No internet connection — some features unavailable
```
Amber background, stone text. Dismissible. Disappears automatically when online.

### 17.2 Service worker offline fallback

`public/offline.html` — a static page shown when navigation fails offline:
- Same branding as app
- Message: "You're offline. Check your connection to continue booking."
- Shows cached routes list if available
- Link to open cached bookings

### 17.3 Optimistic UI

For actions that should feel instant:
- **Go online/offline (driver):** update UI immediately, revert if API fails
- **Language toggle:** instant, no API call
- **Booking cancel:** show cancelled state optimistically, revert on error

### 17.4 Loading states — hierarchy

1. Skeleton screens for page-level data (trip list, booking list)
2. Spinner on buttons for user-initiated actions
3. Progress bar for file downloads (invoice PDF)
4. Inline "refreshing..." text for background revalidation

Never block an entire page with a full-screen spinner — always show skeleton.

### 17.5 Error boundaries

Wrap every page in an ErrorBoundary (`components/ErrorBoundary.tsx`).
Fallback UI:
```
Something went wrong on this page.
[Retry]   [Go home]
```
Log error to `console.error`. (Sentry integration: add `Sentry.captureException(error)` as a stub comment.)

### 17.6 Race conditions

- Booking submit: disable button immediately on click, re-enable only on terminal state (success or error)
- OTP verify: disable inputs during verification
- Seat selection: if between selecting seat and paying someone else books it (409), handle gracefully — never leave user on a dead state

### 17.7 Deep linking

All pages must be directly linkable:
- `/trips?routeId=X&date=2026-05-15` → lands on trip list
- `/bookings/cld123abc/confirm` → lands on confirmation (auth-gated)
- `/track/cld123abc` → lands on live tracking (no auth needed)

On auth-gated pages: save the intended URL in sessionStorage, redirect to onboarding, restore after login.

### 17.8 Form state persistence

For the booking form: persist form state to sessionStorage on every change. If user navigates away and back (e.g., to check their calendar), form is restored. Clear on successful submit.

---

## PART 18 — PERFORMANCE REQUIREMENTS

- **LCP < 2.5s on 3G** (Pithoragarh has 3G connectivity)
- **TTI < 4s on mid-range Android** (Redmi 9, Moto G)
- All images: `next/image` with WebP, appropriate `sizes` prop
- Route data: cache in SWR, serve from service worker on repeat visits
- Fonts: `display=swap` to avoid FOIT
- No layout shift (CLS < 0.1): set explicit height on all images and skeleton cards
- Bundle: no component library import. Tailwind purge enabled. Total JS < 200kb gzipped.
- Leaflet: lazy-load (`dynamic(() => import(...), { ssr: false })`) — don't include in initial bundle

---

## PART 19 — ACCESSIBILITY

- All interactive elements: visible focus ring (`focus-visible:ring-2 focus-visible:ring-[var(--brand)]`)
- All images and icons: `alt` text or `aria-hidden="true"` for decorative
- Color contrast: all text meets WCAG AA (4.5:1 for body, 3:1 for large text)
- Touch targets: minimum 44×44px (buttons and links)
- Bottom sheet: `role="dialog"`, `aria-modal="true"`, focus trap when open, restore focus on close
- OTP inputs: `aria-label="OTP digit 1 of 6"` etc.
- Language toggle: `lang` attribute on `<html>` updates when language changes (`document.documentElement.lang = lang === 'hi' ? 'hi' : 'en'`)

---

## PART 20 — FILE STRUCTURE

```
pahadi-rides-pwa/
├── app/
│   ├── layout.tsx                     ← root layout, providers, fonts, meta
│   ├── page.tsx                       ← home / search
│   ├── onboarding/
│   │   ├── page.tsx                   ← welcome screen
│   │   ├── phone/page.tsx             ← phone entry
│   │   ├── otp/page.tsx               ← OTP verification
│   │   ├── name/page.tsx              ← name entry
│   │   └── consents/page.tsx          ← driver consents
│   ├── trips/
│   │   ├── page.tsx                   ← trip listing
│   │   └── [tripId]/
│   │       └── book/page.tsx          ← booking form
│   ├── bookings/
│   │   ├── page.tsx                   ← my bookings list
│   │   └── [bookingId]/
│   │       └── confirm/page.tsx       ← booking confirmation
│   ├── track/
│   │   └── [bookingId]/page.tsx       ← live location tracking
│   ├── driver/
│   │   ├── page.tsx                   ← driver dashboard
│   │   ├── post-trip/page.tsx         ← post new trip
│   │   ├── earnings/page.tsx          ← earnings
│   │   └── trips/
│   │       └── [tripId]/
│   │           └── manifest/page.tsx  ← departure manifest
│   └── profile/
│       └── page.tsx                   ← user profile
├── components/
│   ├── ui/
│   │   ├── Button.tsx
│   │   ├── Input.tsx
│   │   ├── BottomSheet.tsx
│   │   ├── Pill.tsx
│   │   ├── SkeletonCard.tsx
│   │   └── Toast.tsx
│   ├── SplashScreen.tsx
│   ├── InstallBanner.tsx
│   ├── BottomNav.tsx
│   ├── TripCard.tsx
│   ├── BookingCard.tsx
│   ├── TicketView.tsx
│   ├── FareSummary.tsx
│   ├── LocationMap.tsx                ← Leaflet wrapper (client-only)
│   └── ErrorBoundary.tsx
├── lib/
│   ├── i18n.ts
│   ├── LanguageContext.tsx
│   ├── AuthContext.tsx
│   ├── ToastContext.tsx
│   ├── InstallPromptContext.tsx
│   ├── api.ts
│   └── utils.ts                       ← formatCurrency, formatDate, formatPhone
├── hooks/
│   ├── useGeolocation.ts
│   ├── useNetworkStatus.ts
│   └── useLocalStorage.ts
├── public/
│   ├── manifest.json
│   ├── offline.html
│   └── icons/
│       ├── icon-192.png
│       └── icon-512.png
├── next.config.js                     ← next-pwa config
└── tailwind.config.js                 ← extended tokens
```

---

## PART 21 — IMPLEMENTATION ORDER

Build in this exact order to unblock testing at each step:

1. `tailwind.config.js` + `globals.css` — design tokens
2. `lib/i18n.ts` + `LanguageContext` — all strings ready before any UI
3. `lib/api.ts` — fetcher used by everything
4. `lib/AuthContext.tsx` — auth state
5. `components/ui/*` — primitives (Button, Input, BottomSheet, Pill, Skeleton, Toast)
6. `app/layout.tsx` — root layout, providers, meta
7. `components/SplashScreen.tsx`
8. `lib/InstallPromptContext.tsx` + `InstallBanner.tsx`
9. `app/onboarding/*` — all 4 screens
10. `app/page.tsx` — home search
11. `app/trips/page.tsx` — trip listing
12. `app/trips/[tripId]/book/page.tsx` — booking form
13. `app/bookings/[bookingId]/confirm/page.tsx` — confirmation
14. `app/bookings/page.tsx` — my bookings
15. `app/track/[bookingId]/page.tsx` — live tracking
16. `app/driver/*` — all driver screens
17. `app/profile/page.tsx`
18. Service worker offline page + PWA testing

---

## CODEX EXECUTION NOTES

- Write complete, compilable TypeScript for every file. No `// TODO` stubs.
- Every component: proper TypeScript props interface.
- All API calls: typed response interfaces in `lib/api.ts` or inline.
- Framer Motion: import from `framer-motion`, use `motion.div` etc.
- Leaflet: always wrapped in `dynamic(() => import('../components/LocationMap'), { ssr: false })`.
- `'use client'` directive: on all components with hooks, event handlers, or browser APIs.
- Server components (no directive): layout.tsx, pure data-fetching pages where possible.
- No `any` types. Use `unknown` + type guards where needed.
- Tailwind: no inline `style` except for CSS variables. Use `className` exclusively.
- formatCurrency utility: `(paise: number) => '₹' + (paise / 100).toLocaleString('en-IN')`
- formatDate utility: use `Intl.DateTimeFormat` with `'en-IN'` locale — no date library.