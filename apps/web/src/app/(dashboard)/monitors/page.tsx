'use client';

import { useQuery } from '@tanstack/react-query';
import { Plus, Search } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { type MonitorView, apiFetch, monitorTarget } from '@/lib/api';
import { StatusBadge } from '@/components/status-badge';
import { Button, Card, Input } from '@/components/ui';
import { cn } from '@/lib/utils';

function uptimeLabel(value: number | null): string {
  return value === null ? '—' : `${value.toFixed(value >= 99.95 ? 2 : 1)}%`;
}

// Issues first (down → pending → others) so problems surface at the top.
const SORT_WEIGHT: Record<string, number> = { down: 0, pending: 1, maintenance: 2, up: 3, paused: 4 };

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'down', label: 'Down' },
  { key: 'up', label: 'Up' },
  { key: 'paused', label: 'Paused' },
] as const;

function MonitorRow({ monitor }: { monitor: MonitorView }) {
  return (
    <Link href={`/monitors/${monitor.id}`}>
      <Card className="flex items-center justify-between px-5 py-4 transition-colors hover:border-slate-300 dark:hover:border-slate-700">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <StatusBadge status={monitor.status} />
            <span className="truncate font-medium">{monitor.name}</span>
          </div>
          <div className="mt-1 truncate text-sm text-slate-500">
            <span className="uppercase">{monitor.type}</span> · {monitorTarget(monitor)}
          </div>
        </div>
        <div className="flex items-center gap-8 text-right">
          <div>
            <div className="text-xs text-slate-400">24h</div>
            <div className="font-medium tabular-nums">{uptimeLabel(monitor.uptime24h)}</div>
          </div>
          <div className="hidden sm:block">
            <div className="text-xs text-slate-400">Response</div>
            <div className="font-medium tabular-nums">
              {monitor.lastResponseTime !== null ? `${monitor.lastResponseTime} ms` : '—'}
            </div>
          </div>
        </div>
      </Card>
    </Link>
  );
}

export default function MonitorsPage() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['monitors'],
    queryFn: () => apiFetch<MonitorView[]>('/monitors'),
    refetchInterval: 5_000,
  });
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['key']>('all');

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data ?? [])
      .filter((m) => (filter === 'all' ? true : m.status === filter))
      .filter((m) => q === '' || m.name.toLowerCase().includes(q) || monitorTarget(m).toLowerCase().includes(q))
      .sort((a, b) => (SORT_WEIGHT[a.status] ?? 9) - (SORT_WEIGHT[b.status] ?? 9));
  }, [data, search, filter]);

  return (
    <div className="mx-auto max-w-5xl p-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Monitors</h1>
          <p className="text-sm text-slate-500">Live status of everything you watch.</p>
        </div>
        <Link href="/monitors/new">
          <Button>
            <Plus className="h-4 w-4" />
            Add monitor
          </Button>
        </Link>
      </div>

      {data && data.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search monitors…" className="pl-9" aria-label="Search monitors" />
          </div>
          <div className="flex gap-1">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={cn(
                  'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                  filter === f.key
                    ? 'bg-slate-900 text-white dark:bg-slate-50 dark:text-slate-900'
                    : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800',
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <Card key={i} className="h-[72px] animate-pulse" />
          ))}
        </div>
      ) : isError ? (
        <Card className="py-12 text-center text-red-600">Failed to load monitors. Retrying…</Card>
      ) : !data || data.length === 0 ? (
        <Card className="flex flex-col items-center justify-center gap-3 py-16 text-center">
          <div className="text-lg font-medium">No monitors yet</div>
          <p className="max-w-xs text-sm text-slate-500">
            Add your first monitor to start tracking uptime and get alerted when something breaks.
          </p>
          <Link href="/monitors/new">
            <Button>
              <Plus className="h-4 w-4" />
              Add monitor
            </Button>
          </Link>
        </Card>
      ) : visible.length === 0 ? (
        <Card className="py-12 text-center text-slate-500">No monitors match your filter.</Card>
      ) : (
        <div className="space-y-2">
          {visible.map((monitor) => (
            <MonitorRow key={monitor.id} monitor={monitor} />
          ))}
        </div>
      )}
    </div>
  );
}
