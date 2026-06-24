'use client';

import type { Lang } from '../lib/i18n';
import { copy, formatCurrency } from '../lib/utils';

export function FareSummary({
  lang,
  seatLabel,
  baseFarePaise,
  extraLines = [],
  luggageLabel,
  luggageSurchargePaise,
}: {
  lang: Lang;
  seatLabel: string;
  baseFarePaise: number;
  extraLines?: Array<{ label: string; amountPaise: number }>;
  luggageLabel: string;
  luggageSurchargePaise: number;
}) {
  const total = baseFarePaise + extraLines.reduce((s, l) => s + l.amountPaise, 0) + luggageSurchargePaise;

  return (
    <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-card">
      <h2 className="font-display text-heading text-[var(--text-primary)]">{copy(lang, 'Fare summary', 'किराया सारांश')}</h2>
      <div className="mt-4 space-y-3 text-body">
        <div className="flex justify-between gap-4">
          <span className="text-[var(--text-secondary)]">{seatLabel}</span>
          <span className="font-medium text-[var(--text-primary)]">{formatCurrency(baseFarePaise)}</span>
        </div>
        {extraLines.map((line, i) => (
          <div key={i} className="flex justify-between gap-4">
            <span className="text-[var(--text-secondary)]">{line.label}</span>
            <span className="font-medium text-[var(--text-primary)]">{formatCurrency(line.amountPaise)}</span>
          </div>
        ))}
        <div className="flex justify-between gap-4">
          <span className="text-[var(--text-secondary)]">{luggageLabel}</span>
          <span className="font-medium text-[var(--text-primary)]">{luggageSurchargePaise > 0 ? formatCurrency(luggageSurchargePaise) : copy(lang, 'Free', 'मुफ़्त')}</span>
        </div>
        <div className="h-px bg-[var(--border)]" />
        <div className="flex justify-between gap-4 font-display text-heading">
          <span>{copy(lang, 'Total', 'कुल')}</span>
          <span>{formatCurrency(total)}</span>
        </div>
      </div>
      <p className="mt-4 text-small text-[var(--text-secondary)]">{copy(lang, 'Cancellation: Free before 12 hrs', 'रद्दीकरण: 12 घंटे पहले मुफ़्त')}</p>
    </section>
  );
}
