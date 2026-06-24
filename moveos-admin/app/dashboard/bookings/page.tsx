'use client';

import { useState } from 'react';
import { CalendarDays } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import {
  ScheduledTripsView,
  SuperAdminRidesView,
  OrgAdminRidesView,
  TransportRequestsView,
  LIFECYCLE_TABS,
  type Lifecycle,
} from '../rides/_views';

type TopTab = 'schedule' | 'bookings' | 'transport';

const TOP_TABS: [TopTab, string][] = [
  ['schedule', 'Scheduled trips'],
  ['bookings', 'Bookings'],
  ['transport', 'Transport requests'],
];

function LifecycleSubTabs({ value, onChange }: { value: Lifecycle; onChange: (v: Lifecycle) => void }) {
  return (
    <div className="bg-slate-50 px-5 pt-3">
      <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5">
        {LIFECYCLE_TABS.map(([key, label]) => (
          <button key={key} type="button" onClick={() => onChange(key)}
            className={['rounded-md px-3.5 py-1.5 text-sm font-medium transition-colors', value === key ? 'bg-blue-600 text-white' : 'text-slate-500 hover:text-slate-800'].join(' ')}>
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function BookingsSchedulesPage() {
  const { user } = useAuth();
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';
  const [tab, setTab] = useState<TopTab>('schedule');
  const [scheduleLife, setScheduleLife] = useState<Lifecycle>('upcoming');
  const [bookingLife, setBookingLife] = useState<Lifecycle>('upcoming');

  const canView = user?.role === 'SUPER_ADMIN' || user?.role === 'ORG_ADMIN';
  if (!canView) {
    return <div className="flex items-center justify-center min-h-[50vh] text-slate-400"><p>This section is not available for your role.</p></div>;
  }

  return (
    <div className="min-h-full bg-slate-50">
      <div className="border-b border-slate-200 bg-white px-5 pt-4">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-5 w-5 text-blue-600" />
          <div>
            <h1 className="text-xl font-bold text-slate-900">Bookings &amp; Schedules</h1>
            <p className="text-sm text-slate-500">Manage scheduled trips, seat bookings and transport requests.</p>
          </div>
        </div>
        <nav className="mt-3 flex gap-1">
          {TOP_TABS.map(([key, label]) => (
            <button key={key} type="button" onClick={() => setTab(key)}
              className={['px-4 py-2.5 text-sm font-medium border-b-2 transition-colors', tab === key ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-800'].join(' ')}>
              {label}
            </button>
          ))}
        </nav>
      </div>

      {tab === 'schedule' && (
        <>
          <LifecycleSubTabs value={scheduleLife} onChange={setScheduleLife} />
          <ScheduledTripsView lifecycle={scheduleLife} embedded allowSchedule />
        </>
      )}

      {tab === 'bookings' && (
        <>
          <LifecycleSubTabs value={bookingLife} onChange={setBookingLife} />
          {isSuperAdmin
            ? <SuperAdminRidesView lifecycle={bookingLife} embedded />
            : <OrgAdminRidesView lifecycle={bookingLife} embedded />}
        </>
      )}

      {tab === 'transport' && <TransportRequestsView />}
    </div>
  );
}
