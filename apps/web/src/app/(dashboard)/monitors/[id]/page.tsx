'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Pause, Pencil, Play, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ApiError, type Heartbeat, type MonitorView, apiFetch, monitorTarget } from '@/lib/api';
import { HeartbeatBar } from '@/components/heartbeat-bar';
import { StatusBadge } from '@/components/status-badge';
import { Button, Card } from '@/components/ui';
import { cn } from '@/lib/utils';

function uptimeLabel(v: number | null): string {
  return v === null ? '—' : `${v.toFixed(2)}%`;
}

export default function MonitorDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const [actionError, setActionError] = useState<string | null>(null);
  const [range, setRange] = useState(60);
  const onActionError = (e: unknown) =>
    setActionError(e instanceof ApiError ? e.message : 'Action failed');

  const { data: monitor, isError } = useQuery({
    queryKey: ['monitor', id],
    queryFn: () => apiFetch<MonitorView>(`/monitors/${id}`),
    refetchInterval: 5_000,
  });
  const { data: beats } = useQuery({
    queryKey: ['heartbeats', id, range],
    queryFn: () => apiFetch<Heartbeat[]>(`/monitors/${id}/heartbeats?limit=${range}`),
    refetchInterval: 5_000,
  });

  const toggle = useMutation({
    mutationFn: () => apiFetch(`/monitors/${id}/${monitor?.isActive ? 'pause' : 'resume'}`, { method: 'POST' }),
    onSuccess: () => {
      setActionError(null);
      void qc.invalidateQueries({ queryKey: ['monitor', id] });
    },
    onError: onActionError,
  });
  const remove = useMutation({
    mutationFn: () => apiFetch(`/monitors/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['monitors'] });
      router.push('/monitors');
    },
    onError: onActionError,
  });

  if (isError) return <div className="p-8 text-red-600">Monitor not found.</div>;
  if (!monitor) return <div className="p-8 text-slate-500">Loading…</div>;

  const chartData = (beats ?? [])
    .filter((b) => b.responseTime !== null)
    .reverse()
    .map((b, i) => ({ i, ms: b.responseTime }));

  return (
    <div className="mx-auto max-w-4xl p-8">
      <Link href="/monitors" className="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
        <ArrowLeft className="h-4 w-4" />
        Monitors
      </Link>

      <div className="mb-6 flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <StatusBadge status={monitor.status} />
            <h1 className="text-2xl font-bold">{monitor.name}</h1>
          </div>
          <div className="mt-1 text-sm text-slate-500">
            <span className="uppercase">{monitor.type}</span> · {monitorTarget(monitor)}
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => toggle.mutate()}>
            {monitor.isActive ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            {monitor.isActive ? 'Pause' : 'Resume'}
          </Button>
          <Link href={`/monitors/${id}/edit`}>
            <Button variant="outline" size="sm">
              <Pencil className="h-4 w-4" />
              Edit
            </Button>
          </Link>
          <Button
            variant="danger"
            size="sm"
            aria-label="Delete monitor"
            onClick={() => {
              if (window.confirm('Delete this monitor?')) remove.mutate();
            }}
          >
            <Trash2 className="h-4 w-4" aria-hidden />
          </Button>
        </div>
      </div>

      {actionError && <p className="mb-4 text-sm text-red-600">{actionError}</p>}

      <div className="mb-6 grid grid-cols-3 gap-4">
        {([['24h', monitor.uptime24h], ['7 days', monitor.uptime7d], ['30 days', monitor.uptime30d]] as const).map(
          ([label, value]) => (
            <Card key={label} className="p-5">
              <div className="text-sm text-slate-500">{label} uptime</div>
              <div className="mt-1 text-2xl font-bold tabular-nums">{uptimeLabel(value)}</div>
            </Card>
          ),
        )}
      </div>

      <Card className="mb-6 p-5">
        <div className="mb-3 text-sm font-medium">Recent checks</div>
        <HeartbeatBar beats={beats ?? []} />
      </Card>

      <Card className="p-5">
        <div className="mb-3 flex items-center justify-between">
          <div className="text-sm font-medium">Response time (ms)</div>
          <div className="flex gap-1">
            {[60, 200].map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={cn(
                  'rounded px-2 py-1 text-xs font-medium',
                  range === r
                    ? 'bg-slate-200 text-slate-900 dark:bg-slate-700 dark:text-slate-50'
                    : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800',
                )}
              >
                Last {r}
              </button>
            ))}
          </div>
        </div>
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="rt" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10b981" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="i" hide />
              <YAxis width={44} tick={{ fontSize: 11 }} unit=" ms" />
              <Tooltip
                contentStyle={{ fontSize: 12, borderRadius: 8 }}
                formatter={(value) => [`${String(value)} ms`, 'Response']}
                labelFormatter={() => ''}
              />
              <Area type="monotone" dataKey="ms" stroke="#10b981" strokeWidth={2} fill="url(#rt)" isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Card>
    </div>
  );
}
