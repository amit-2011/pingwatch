'use client';

import { useQuery } from '@tanstack/react-query';
import { Activity, AlertTriangle, CheckCircle2, PauseCircle, Plus, Siren } from 'lucide-react';
import Link from 'next/link';
import { useMemo } from 'react';
import { type IncidentView, type MonitorView, apiFetch, monitorTarget } from '@/lib/api';
import { Sparkline } from '@/components/sparkline';
import { StatusPill } from '@/components/status-badge';
import { Button, Card } from '@/components/ui';
import { relativeTime, uptimeLabel } from '@/lib/format';
import { statusMeta } from '@/lib/status';
import { cn } from '@/lib/utils';

function StatCard({
  label,
  value,
  icon: Icon,
  tone,
  href,
}: {
  label: string;
  value: string | number;
  icon: typeof Activity;
  tone: string;
  href?: string;
}) {
  const inner = (
    <Card className="flex items-center gap-4 p-5 transition-colors hover:border-slate-300 dark:hover:border-slate-700">
      <span className={cn('flex h-11 w-11 items-center justify-center rounded-lg', tone)}>
        <Icon className="h-5 w-5" aria-hidden />
      </span>
      <div>
        <div className="text-2xl font-bold tabular-nums leading-none">{value}</div>
        <div className="mt-1 text-sm text-slate-500">{label}</div>
      </div>
    </Card>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}

export default function OverviewPage() {
  const { data: monitors, isLoading } = useQuery({
    queryKey: ['monitors'],
    queryFn: () => apiFetch<MonitorView[]>('/monitors'),
    refetchInterval: 5_000,
  });
  const { data: incidents } = useQuery({
    queryKey: ['incidents'],
    queryFn: () => apiFetch<IncidentView[]>('/incidents'),
    refetchInterval: 10_000,
  });

  const stats = useMemo(() => {
    const list = monitors ?? [];
    const by = (s: string) => list.filter((m) => m.status === s).length;
    const tracked = list.filter((m) => m.uptime24h !== null);
    const overall =
      tracked.length === 0 ? null : tracked.reduce((sum, m) => sum + (m.uptime24h ?? 0), 0) / tracked.length;
    return {
      total: list.length,
      up: by('up'),
      down: by('down') + by('pending'),
      paused: by('paused') + by('maintenance'),
      overall,
    };
  }, [monitors]);

  const activeIncidents = (incidents ?? []).filter((i) => i.status !== 'resolved');
  const attention = (monitors ?? [])
    .filter((m) => m.status === 'down' || m.status === 'pending')
    .sort((a) => (a.status === 'down' ? -1 : 1));

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6 lg:p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Overview</h1>
          <p className="text-sm text-slate-500">Health of everything you watch, at a glance.</p>
        </div>
        <Link href="/monitors/new">
          <Button>
            <Plus className="h-4 w-4" aria-hidden />
            Add monitor
          </Button>
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Operational"
          value={isLoading ? '—' : stats.up}
          icon={CheckCircle2}
          tone="bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400"
          href="/monitors"
        />
        <StatCard
          label="Down / pending"
          value={isLoading ? '—' : stats.down}
          icon={AlertTriangle}
          tone="bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400"
          href="/monitors"
        />
        <StatCard
          label="Paused / maintenance"
          value={isLoading ? '—' : stats.paused}
          icon={PauseCircle}
          tone="bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
          href="/monitors"
        />
        <StatCard
          label="Avg 24h uptime"
          value={uptimeLabel(stats.overall)}
          icon={Activity}
          tone="bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Needs attention */}
        <Card className="lg:col-span-2">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-800">
            <h2 className="font-semibold">Needs attention</h2>
            <Link href="/monitors" className="text-sm text-slate-500 hover:text-slate-900 dark:hover:text-slate-200">
              All monitors →
            </Link>
          </div>
          {attention.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12 text-center">
              <CheckCircle2 className="h-8 w-8 text-emerald-500" aria-hidden />
              <p className="text-sm text-slate-500">Everything is operational.</p>
            </div>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {attention.map((m) => (
                <li key={m.id}>
                  <Link
                    href={`/monitors/${m.id}`}
                    className="flex items-center justify-between gap-4 px-5 py-3 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={cn('h-2 w-2 shrink-0 rounded-full', statusMeta(m.status).solid)} />
                        <span className="truncate font-medium">{m.name}</span>
                      </div>
                      <div className="mt-0.5 truncate text-xs text-slate-500">{monitorTarget(m)}</div>
                    </div>
                    <Sparkline beats={m.recentBeats} slots={24} className="hidden sm:flex" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Active incidents */}
        <Card>
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-800">
            <h2 className="font-semibold">Active incidents</h2>
            <Siren className="h-4 w-4 text-slate-400" aria-hidden />
          </div>
          {activeIncidents.length === 0 ? (
            <p className="px-5 py-12 text-center text-sm text-slate-500">No open incidents.</p>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {activeIncidents.slice(0, 6).map((inc) => (
                <li key={inc.id}>
                  <Link
                    href="/incidents"
                    className="block px-5 py-3 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium">{inc.monitorName}</span>
                      <StatusPill status={inc.status === 'acknowledged' ? 'pending' : 'down'} />
                    </div>
                    <div className="mt-0.5 text-xs text-slate-500">{relativeTime(inc.startedAt)}</div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
