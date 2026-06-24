'use client';

export function SkeletonCard() {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-card" aria-hidden="true">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-3">
          <div className="pahadi-shimmer h-6 w-24 rounded-full" />
          <div className="pahadi-shimmer h-4 w-36 rounded-full" />
        </div>
        <div className="space-y-3">
          <div className="pahadi-shimmer h-5 w-28 rounded-full" />
          <div className="pahadi-shimmer h-4 w-24 rounded-full" />
        </div>
      </div>
      <div className="my-5 h-px bg-[var(--border)]" />
      <div className="space-y-3">
        <div className="flex justify-between gap-4">
          <div className="pahadi-shimmer h-4 w-32 rounded-full" />
          <div className="pahadi-shimmer h-4 w-20 rounded-full" />
        </div>
        <div className="flex justify-between gap-4">
          <div className="pahadi-shimmer h-4 w-28 rounded-full" />
          <div className="pahadi-shimmer h-4 w-24 rounded-full" />
        </div>
      </div>
      <div className="mt-5 flex justify-end">
        <div className="pahadi-shimmer h-[44px] w-36 rounded-xl" />
      </div>
    </div>
  );
}
