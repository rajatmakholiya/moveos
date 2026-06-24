'use client';

type PillColor = 'teal' | 'amber' | 'red' | 'stone';

export interface PillProps {
  color?: PillColor;
  label: string;
}

const colorClasses: Record<PillColor, string> = {
  teal: 'bg-[var(--brand-light)] text-[var(--brand)]',
  amber: 'bg-[var(--amber-50)] text-[var(--amber-700)]',
  red: 'bg-[var(--red-50)] text-[var(--red-600)]',
  stone: 'bg-[var(--stone-100)] text-[var(--stone-700)]',
};

export function Pill({ color = 'stone', label }: PillProps) {
  return <span className={['inline-flex items-center rounded-full px-3 py-1 text-small font-medium', colorClasses[color]].join(' ')}>{label}</span>;
}
