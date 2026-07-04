'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  Bell,
  Database,
  FileCode,
  Globe,
  KeyRound,
  LayoutDashboard,
  ListOrdered,
  LogOut,
  Moon,
  Settings,
  Siren,
  Sun,
  Users,
  Wrench,
} from 'lucide-react';
import { useTheme } from 'next-themes';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { type ReactNode, useEffect, useState } from 'react';
import { Logo } from '@/components/logo';
import { type Org, apiFetch, getCurrentOrg, setCurrentOrg } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { cn } from '@/lib/utils';

const NAV = [
  { href: '/overview', label: 'Overview', icon: LayoutDashboard },
  { href: '/monitors', label: 'Monitors', icon: Activity },
  { href: '/incidents', label: 'Incidents', icon: Siren },
  { href: '/escalation', label: 'Escalation', icon: ListOrdered },
  { href: '/maintenance', label: 'Maintenance', icon: Wrench },
  { href: '/channels', label: 'Notifications', icon: Bell },
  { href: '/status-pages', label: 'Status pages', icon: Globe },
  { href: '/export', label: 'Data export', icon: Database },
  { href: '/members', label: 'Members', icon: Users },
  { href: '/tokens', label: 'API tokens', icon: KeyRound },
  { href: '/config', label: 'Config (YAML)', icon: FileCode },
  { href: '/settings', label: 'Settings', icon: Settings },
];

function OrgSwitcher() {
  const qc = useQueryClient();
  const { data: orgs } = useQuery({ queryKey: ['orgs'], queryFn: () => apiFetch<Org[]>('/orgs') });
  if (!orgs || orgs.length === 0) return null;

  const current = getCurrentOrg() ?? orgs.find((o) => o.current)?.id ?? orgs[0]?.id ?? '';

  if (orgs.length === 1) {
    return <div className="truncate px-2 text-sm font-medium text-slate-200">{orgs[0]?.name}</div>;
  }
  return (
    <select
      aria-label="Switch organization"
      value={current}
      onChange={(e) => {
        setCurrentOrg(e.target.value);
        void qc.invalidateQueries();
      }}
      className="h-9 w-full rounded-lg border border-white/10 bg-white/5 px-2 text-sm text-slate-100 outline-none focus-visible:border-signal focus-visible:ring-2 focus-visible:ring-signal/40 [&>option]:text-slate-900"
    >
      {orgs.map((o) => (
        <option key={o.id} value={o.id}>
          {o.name}
        </option>
      ))}
    </select>
  );
}

/** Sun/moon toggle for the dark-first monitoring dashboard. Renders neutral until mounted to avoid hydration mismatch. */
function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const isDark = resolvedTheme === 'dark';
  return (
    <button
      type="button"
      aria-label="Toggle theme"
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-white/10 hover:text-white"
    >
      {mounted && isDark ? <Sun className="h-4 w-4" aria-hidden /> : <Moon className="h-4 w-4" aria-hidden />}
    </button>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { user, logout } = useAuth();

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-slate-950">
      {/* Dark slate sidebar — dark in both themes (design system: the sidebar is always the dark rail).
          Pinned to the viewport height so the footer (sign out) stays visible; only the nav scrolls. */}
      <aside className="flex h-screen w-54.5 shrink-0 flex-col bg-slate-900 text-slate-300 dark:bg-[#070d18]">
        <div className="flex h-16 items-center px-5">
          <Logo size={24} light />
        </div>
        <div className="px-3 pb-3">
          <OrgSwitcher />
        </div>
        <nav className="sidebar-scroll min-h-0 flex-1 space-y-0.5 overflow-y-auto px-3 py-2">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  'relative flex items-center gap-3 rounded-lg px-3 py-2 text-[13.5px] font-medium transition-colors',
                  active
                    ? 'bg-signal/15 text-white before:absolute before:left-0 before:top-1.5 before:bottom-1.5 before:w-0.75 before:rounded-r before:bg-brand-300'
                    : 'text-slate-300 hover:bg-white/5 hover:text-white',
                )}
              >
                <Icon
                  className={cn('h-4 w-4 shrink-0', active ? 'text-brand-300' : 'opacity-85')}
                  aria-hidden
                />
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-white/10 p-3">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0 truncate px-1 text-xs text-slate-400">{user?.email}</div>
            <ThemeToggle />
          </div>
          <button
            onClick={() => void logout()}
            className="mt-1 flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-300 transition-colors hover:bg-white/5 hover:text-white"
          >
            <LogOut className="h-4 w-4" aria-hidden />
            Sign out
          </button>
        </div>
      </aside>
      <main className="min-h-0 min-w-0 flex-1 overflow-auto">{children}</main>
    </div>
  );
}
