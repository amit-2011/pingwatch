'use client';

import { useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import Link from 'next/link';
import { type MonitorView, apiFetch } from '@/lib/api';
import { StatusBadge } from '@/components/status-badge';
import { Button, Card } from '@/components/ui';

function uptimeLabel(value: number | null): string {
  return value === null ? '—' : `${value.toFixed(value >= 99.95 ? 2 : 1)}%`;
}

function MonitorRow({ monitor }: { monitor: MonitorView }) {
  return (
    <Link href={`/monitors/${monitor.id}`}>
      <Card className="flex items-center justify-between px-5 py-4 transition-colors hover:border-slate-300 dark:hover:border-slate-700">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <StatusBadge status={monitor.status} />
            <span className="truncate font-medium">{monitor.name}</span>
          </div>
          <div className="mt-1 truncate text-sm text-slate-500">{monitor.config.url ?? monitor.type}</div>
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
  const { data, isLoading } = useQuery({
    queryKey: ['monitors'],
    queryFn: () => apiFetch<MonitorView[]>('/monitors'),
    refetchInterval: 5_000,
  });

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

      {isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <Card key={i} className="h-[72px] animate-pulse" />
          ))}
        </div>
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
      ) : (
        <div className="space-y-2">
          {data.map((monitor) => (
            <MonitorRow key={monitor.id} monitor={monitor} />
          ))}
        </div>
      )}
    </div>
  );
}
