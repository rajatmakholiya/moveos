'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  LayoutDashboard,
  MapPin,
  Users,
  Car,
  Route,
  CalendarDays,
  CalendarClock,
  Receipt,
  Bell,
  Settings,
  ClipboardList,
  FileText,
  Flag,
  Menu,
  X,
  LogOut,
  Shield,
  ShieldCheck,
  Target,
  User,
  Building2,
  Loader2,
} from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import MuiProvider from '@/components/MuiProvider';

const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Live Tracking', href: '/dashboard/tracking', icon: MapPin },
  { name: 'Schedule Tracking', href: '/dashboard/schedule-tracking', icon: CalendarClock },
  { name: 'Clusters', href: '/dashboard/clusters', icon: Target },
  { name: 'Organizations', href: '/dashboard/organizations', icon: Building2 },
  { name: 'Route Management', href: '/dashboard/routes', icon: Route },
  { name: 'Drivers', href: '/dashboard/drivers', icon: Users },
  { name: 'Driver Verifications', href: '/dashboard/drivers/verifications', icon: ShieldCheck },
  { name: 'Vehicles', href: '/dashboard/vehicles', icon: Car },
  { name: 'Assignments', href: '/dashboard/assignments', icon: ClipboardList },
  { name: 'Rides', href: '/dashboard/rides', icon: Route },
  { name: 'Bookings & Schedules', href: '/dashboard/bookings', icon: CalendarDays },
  { name: 'Passengers', href: '/dashboard/passengers', icon: Users },
  { name: 'Challans', href: '/dashboard/challans', icon: Receipt },
  { name: 'Documents', href: '/dashboard/documents', icon: FileText },
  { name: 'Notifications', href: '/dashboard/notifications', icon: Bell },
  { name: 'Feature Flags', href: '/dashboard/feature-flags', icon: Flag },
  { name: 'Profile', href: '/dashboard/profile', icon: User },
  { name: 'Settings', href: '/dashboard/settings', icon: Settings },
];

const organizationNavigation = [
  { name: 'Dashboard', href: '/dashboard/org', icon: LayoutDashboard },
  { name: 'My Organization', href: '/dashboard/profile', icon: Building2 },
  { name: 'Drivers', href: '/dashboard/drivers', icon: Users },
  { name: 'Vehicles', href: '/dashboard/vehicles', icon: Car },
  { name: 'Assignments', href: '/dashboard/assignments', icon: ClipboardList },
  { name: 'Rides', href: '/dashboard/rides', icon: Route },
  { name: 'Bookings & Schedules', href: '/dashboard/bookings', icon: CalendarDays },
  { name: 'Live Tracking', href: '/dashboard/tracking', icon: MapPin },
  { name: 'Schedule Tracking', href: '/dashboard/schedule-tracking', icon: CalendarClock },
  { name: 'Documents / KYC', href: '/dashboard/documents', icon: FileText },
  { name: 'Notifications', href: '/dashboard/notifications', icon: Bell },
  { name: 'Settings', href: '/dashboard/settings', icon: Settings },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, isReady, logout } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    if (isReady && !user) {
      router.replace('/');
    }
  }, [isReady, user, router]);

  if (!isReady) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
      </div>
    );
  }

  if (!user) return null;

  const visibleNavigation = user.role === 'ORG_ADMIN' ? organizationNavigation : navigation;

  const activeRoute = visibleNavigation.find(
    (item) => pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href))
  )?.name ?? 'Dashboard';

  const handleLogout = () => {
    logout();
    router.replace('/');
  };

  const initials = user.name
    ? user.name.split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase()
    : user.role === 'ORG_ADMIN' ? 'OA' : 'SA';

  return (
    <div className="flex h-screen min-h-0 bg-slate-50">
      {/* Sidebar */}
      <div
        className={cn(
          'fixed inset-y-0 left-0 z-50 w-64 bg-slate-900 shadow-2xl transform transition-transform duration-300 ease-in-out lg:translate-x-0 lg:static lg:inset-0 flex flex-col',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        {/* Logo */}
        <div className="flex items-center justify-between h-16 px-4 border-b border-slate-700/60">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center shadow-lg">
              <Shield className="w-4 h-4 text-white" />
            </div>
            <div>
              <span className="text-sm font-bold text-white tracking-tight">MoveOS</span>
              <span className="block text-[10px] text-blue-400 font-medium tracking-widest uppercase">Admin</span>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={() => setSidebarOpen(false)} className="lg:hidden text-slate-400">
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* SUPER_ADMIN badge */}
        <div className="mx-3 mt-3 rounded-lg bg-blue-500/10 border border-blue-500/20 px-3 py-2 flex items-center gap-2">
          <div className="w-7 h-7 rounded-md bg-blue-500 flex items-center justify-center text-xs font-bold text-white flex-shrink-0">
            {initials}
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-white truncate">{user.name ?? (user.role === 'ORG_ADMIN' ? 'Org Admin' : 'Super Admin')}</p>
            <p className="text-[10px] text-blue-400 font-medium">{user.role}</p>
          </div>
        </div>

        {/* Nav */}
        <ScrollArea className="flex-1 py-3">
          <nav className="space-y-0.5 px-2">
            {visibleNavigation.map((item) => {
              const active = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href));
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  onClick={() => setSidebarOpen(false)}
                  className={cn(
                    'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all',
                    active
                      ? 'bg-blue-500 text-white shadow-sm shadow-blue-500/30'
                      : 'text-slate-400 hover:text-white hover:bg-slate-700/60',
                  )}
                >
                  <item.icon className="h-4 w-4 flex-shrink-0" />
                  {item.name}
                </Link>
              );
            })}
          </nav>
        </ScrollArea>

        {/* Logout */}
        <div className="p-3 border-t border-slate-700/60">
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm text-slate-400 hover:text-red-400 hover:bg-red-400/10 transition-all"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </div>
      </div>

      {/* Main */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden min-w-0">
        {/* Header */}
        <header className="h-14 bg-white border-b border-slate-200 flex items-center justify-between px-4 flex-shrink-0">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => setSidebarOpen(true)} className="lg:hidden text-slate-500">
              <Menu className="h-5 w-5" />
            </Button>
            <h1 className="text-base font-semibold text-slate-800">{activeRoute}</h1>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" className="relative text-slate-500">
              <Bell className="h-5 w-5" />
              <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 bg-red-500 rounded-full text-[9px] text-white flex items-center justify-center font-bold">3</span>
            </Button>
            <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center shadow">
              <span className="text-xs font-bold text-white">{initials}</span>
            </div>
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto bg-slate-50">
          <MuiProvider>{children}</MuiProvider>
        </main>
      </div>

      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}
    </div>
  );
}
