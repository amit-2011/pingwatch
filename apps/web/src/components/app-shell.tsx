'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Activity, Bell, Globe, LogOut, Settings, Siren, Users } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { type Org, apiFetch, getCurrentOrg, setCurrentOrg } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { cn } from '@/lib/utils';

const NAV = [
  { href: '/monitors', label: 'Monitors', icon: Activity },
  { href: '/incidents', label: 'Incidents', icon: Siren },
  { href: '/channels', label: 'Notifications', icon: Bell },
  { href: '/status-pages', label: 'Status pages', icon: Globe },
  { href: '/members', label: 'Members', icon: Users },
  { href: '/settings', label: 'Settings', icon: Settings },
];

function OrgSwitcher() {
  const qc = useQueryClient();
  const { data: orgs } = useQuery({ queryKey: ['orgs'], queryFn: () => apiFetch<Org[]>('/orgs') });
  if (!orgs || orgs.length === 0) return null;

  const current = getCurrentOrg() ?? orgs.find((o) => o.current)?.id ?? orgs[0]?.id ?? '';

  if (orgs.length === 1) {
    return <div className="truncate px-2 text-sm font-medium">{orgs[0]?.name}</div>;
  }
  return (
    <select
      aria-label="Switch organization"
      value={current}
      onChange={(e) => {
        setCurrentOrg(e.target.value);
        void qc.invalidateQueries();
      }}
      className="h-9 w-full rounded-md border border-slate-300 bg-white px-2 text-sm dark:border-slate-700 dark:bg-slate-900"
    >
      {orgs.map((o) => (
        <option key={o.id} value={o.id}>
          {o.name}
        </option>
      ))}
    </select>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { user, logout } = useAuth();

  return (
    <div className="flex min-h-screen bg-slate-50 dark:bg-slate-950">
      <aside className="flex w-60 flex-col border-r border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="flex h-16 items-center gap-2 border-b border-slate-200 px-5 dark:border-slate-800">
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
          <span className="text-lg font-bold">PingWatch</span>
        </div>
        <div className="border-b border-slate-200 p-3 dark:border-slate-800">
          <OrgSwitcher />
        </div>
        <nav className="flex-1 space-y-1 p-3">
          {NAV.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                pathname.startsWith(href)
                  ? 'bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-slate-50'
                  : 'text-slate-600 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-800/50',
              )}
            >
              <Icon className="h-4 w-4" aria-hidden />
              {label}
            </Link>
          ))}
        </nav>
        <div className="border-t border-slate-200 p-3 dark:border-slate-800">
          <div className="truncate px-3 py-1 text-xs text-slate-500">{user?.email}</div>
          <button
            onClick={() => void logout()}
            className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-800/50"
          >
            <LogOut className="h-4 w-4" aria-hidden />
            Sign out
          </button>
        </div>
      </aside>
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}
