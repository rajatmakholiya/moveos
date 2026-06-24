export type Scheme = {
  id: string;
  title: string;
  description: string;
  incentive: string;
  ctaLabel?: string;
};

export const schemeCatalog: Scheme[] = [
  {
    id: 'daily-commute',
    title: 'Daily Commute Saver',
    description: 'Prepaid rides with priority dispatch during peak hours.',
    incentive: 'Save up to 20% on weekday rides.',
    ctaLabel: 'Use commute saver',
  },
  {
    id: 'airport-pro',
    title: 'Airport Pro',
    description: 'Flat fares with dedicated airport pickup lanes and live support.',
    incentive: 'Flat fare + lounge vouchers on select rides.',
    ctaLabel: 'Book airport ride',
  },
  {
    id: 'night-owl',
    title: 'Night Owl',
    description: 'Late-night routes with vetted drivers and SOS priority.',
    incentive: 'Extra safety checks and surge protection.',
    ctaLabel: 'Schedule night ride',
  },
  {
    id: 'weekend-explorer',
    title: 'Weekend Explorer',
    description: 'Multi-stop plans for errands and outings across the city.',
    incentive: 'Bundle stops and pay less per km.',
    ctaLabel: 'Plan weekend ride',
  },
];
