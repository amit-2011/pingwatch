'use client';

import { useQuery } from '@tanstack/react-query';
import { ChevronRight, Plus, Search } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { type MonitorView, apiFetch, monitorTarget } from '@/lib/api';
import { Sparkline } from '@/components/sparkline';
import { MonitorDetail } from '@/components/monitor-detail';
import { Button, Card, Input } from '@/components/ui';
import { intervalLabel, uptimeLabel } from '@/lib/format';
import { statusMeta } from '@/lib/status';
import { cn } from '@/lib/utils';

// Issues first (down → pending → others) so problems surface at the top.
const SORT_WEIGHT: Record<string, number> = { down: 0, pending: 1, maintenance: 2, up: 3, paused: 4 };

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'down', label: 'Down' },
  { key: 'up', label: 'Up' },
  { key: 'paused', label: 'Paused' },
] as const;

function MonitorRow({
  monitor,
  selected,
  onSelect,
}: {
  monitor: MonitorView;
  selected: boolean;
  onSelect: () => void;
}) {
  const meta = statusMeta(monitor.status);
  return (
    <button
      onClick={onSelect}
      className={cn(
        'w-full border-l-2 px-4 py-3 text-left transition-colors',
        selected
          ? 'border-l-slate-900 bg-slate-50 dark:border-l-slate-100 dark:bg-slate-800/60'
          : 'border-l-transparent hover:bg-slate-50 dark:hover:bg-slate-800/40',
      )}
    >
      <div className="flex items-center gap-2">
        <span className={cn('h-2 w-2 shrink-0 rounded-full', meta.solid)} />
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{monitor.name}</span>
        <span className="shrink-0 text-xs font-medium tabular-nums text-slate-500">{uptimeLabel(monitor.uptime24h)}</span>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <Sparkline beats={monitor.recentBeats} slots={28} className="flex-1" />
      </div>
      <div className="mt-1.5 flex items-center justify-between text-[11px] text-slate-400">
        <span className="truncate">{monitorTarget(monitor)}</span>
        <span className="shrink-0">{intervalLabel(monitor.intervalSeconds)}</span>
      </div>
    </button>
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
  const [selected, setSelected] = useState<string | null>(null);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data ?? [])
      .filter((m) => (filter === 'all' ? true : m.status === filter))
      .filter((m) => q === '' || m.name.toLowerCase().includes(q) || monitorTarget(m).toLowerCase().includes(q))
      .sort((a, b) => (SORT_WEIGHT[a.status] ?? 9) - (SORT_WEIGHT[b.status] ?? 9));
  }, [data, search, filter]);

  // Keep a valid selection: default to the first visible monitor, and recover if the selected one drops out.
  useEffect(() => {
    if (visible.length === 0) {
      setSelected(null);
    } else if (!selected || !visible.some((m) => m.id === selected)) {
      setSelected(visible[0]!.id);
    }
  }, [visible, selected]);

  const counts = useMemo(() => {
    const list = data ?? [];
    return {
      total: list.length,
      up: list.filter((m) => m.status === 'up').length,
      down: list.filter((m) => m.status === 'down' || m.status === 'pending').length,
    };
  }, [data]);

  if (isLoading) {
    return (
      <div className="p-6 lg:p-8">
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <Card key={i} className="h-[84px] animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (isError) {
    return <div className="p-8 text-red-600">Failed to load monitors. Retrying…</div>;
  }

  if (!data || data.length === 0) {
    return (
      <div className="p-6 lg:p-8">
        <Card className="flex flex-col items-center justify-center gap-3 py-16 text-center">
          <div className="text-lg font-medium">No monitors yet</div>
          <p className="max-w-xs text-sm text-slate-500">
            Add your first monitor to start tracking uptime and get alerted when something breaks.
          </p>
          <Link href="/monitors/new">
            <Button>
              <Plus className="h-4 w-4" aria-hidden />
              Add monitor
            </Button>
          </Link>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-screen flex-col lg:flex-row">
      {/* Master list */}
      <aside className="flex w-full shrink-0 flex-col border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 lg:w-[380px] lg:border-b-0 lg:border-r">
        <div className="space-y-3 border-b border-slate-100 p-4 dark:border-slate-800">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-lg font-bold">Monitors</h1>
              <p className="text-xs text-slate-500">
                {counts.total} total · {counts.up} up · {counts.down} down
              </p>
            </div>
            <Link href="/monitors/new">
              <Button size="sm">
                <Plus className="h-4 w-4" aria-hidden />
                Add
              </Button>
            </Link>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search monitors…"
              className="h-9 pl-9"
              aria-label="Search monitors"
            />
          </div>
          <div className="flex gap-1">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={cn(
                  'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
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
        <div className="flex-1 divide-y divide-slate-100 overflow-y-auto dark:divide-slate-800 lg:max-h-[calc(100vh-9.5rem)]">
          {visible.length === 0 ? (
            <p className="py-12 text-center text-sm text-slate-500">No monitors match your filter.</p>
          ) : (
            visible.map((m) => (
              <MonitorRow key={m.id} monitor={m} selected={selected === m.id} onSelect={() => setSelected(m.id)} />
            ))
          )}
        </div>
      </aside>

      {/* Detail pane */}
      <section className="min-w-0 flex-1 overflow-y-auto bg-slate-50 p-6 dark:bg-slate-950 lg:p-8">
        {selected ? (
          <MonitorDetail id={selected} onDeleted={() => setSelected(null)} />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-slate-400">
            <div className="flex items-center gap-2">
              <ChevronRight className="h-4 w-4" aria-hidden />
              Select a monitor to see details
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
