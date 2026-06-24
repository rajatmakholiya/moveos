'use client';

import { useState } from 'react';
import { Route as RouteIcon } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import { ScheduledTripsView, LIFECYCLE_TABS, type Lifecycle } from './_views';

// Rides — the journeys themselves, grouped by lifecycle (Upcoming / Ongoing / Past).
export default function RidesPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<Lifecycle>('upcoming');

  const canView = user?.role === 'SUPER_ADMIN' || user?.role === 'ORG_ADMIN';
  if (!canView) {
    return <div className="flex items-center justify-center min-h-[50vh] text-slate-400"><p>Rides data is not available for your role.</p></div>;
  }

  return (
    <div className="min-h-full bg-slate-50">
      <div className="border-b border-slate-200 bg-white px-4 pt-4 sm:px-5">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
            <RouteIcon className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-950">Rides</h1>
            <p className="mt-0.5 text-sm text-slate-500">All journeys by stage: upcoming, ongoing and past.</p>
          </div>
        </div>
        <nav className="mt-4 flex gap-1 overflow-x-auto">
          {LIFECYCLE_TABS.map(([key, label]) => (
            <button key={key} type="button" onClick={() => setTab(key)}
              className={[
                'relative min-w-24 px-4 py-2.5 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2',
                tab === key
                  ? 'text-blue-700 after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:rounded-full after:bg-blue-600'
                  : 'text-slate-500 hover:text-slate-900',
              ].join(' ')}>
              {label}
            </button>
          ))}
        </nav>
      </div>
      {/* Same trips dataset, filtered to the active lifecycle. allowSchedule off — scheduling lives on Bookings & Schedules. */}
      <ScheduledTripsView lifecycle={tab} embedded allowSchedule={false} />
    </div>
  );
}
