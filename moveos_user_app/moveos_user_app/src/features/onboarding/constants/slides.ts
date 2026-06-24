export type OnboardingSlide = {
  key: string;
  title: string;
  highlight: string;
  description: string;
  imageUri: string;
  accentColor: string;
  statusLabel?: string;
  statusValue?: string;
  stepLabel?: string;
};

export const onboardingSlides: OnboardingSlide[] = [
  {
    key: 'book',
    title: 'Book Rides',
    highlight: 'Instantly',
    description:
      'Reliable rides from your doorstep with routes tuned for your daily commute.',
    imageUri:
      'https://images.unsplash.com/photo-1502877828070-33e29aa3d7c0?auto=format&fit=crop&w=1200&q=80',
    accentColor: '#0F52BA',
    statusLabel: 'Current Status',
    statusValue: 'Fastest Route Available',
    stepLabel: 'STEP 1 OF 3',
  },
  {
    key: 'track',
    title: 'Track Driver',
    highlight: 'Live',
    description:
      'See your driver move in real-time with precise ETAs and route clarity.',
    imageUri:
      'https://images.unsplash.com/photo-1489515217757-5fd1be406fef?auto=format&fit=crop&w=1200&q=80',
    accentColor: '#0E8C5F',
    statusLabel: 'Live ETA',
    statusValue: '2 min away',
    stepLabel: 'STEP 2 OF 3',
  },
  {
    key: 'safe',
    title: 'Safe & Verified',
    highlight: 'Drivers',
    description:
      'Professionally verified partners for secure, comfortable trips every time.',
    imageUri:
      'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=1200&q=80',
    accentColor: '#0B7047',
    statusLabel: 'Verified',
    statusValue: 'Moveos Partner',
    stepLabel: 'STEP 3 OF 3',
  },
];
