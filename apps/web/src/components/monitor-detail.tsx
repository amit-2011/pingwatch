'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Clock, Pause, Pencil, Play, RefreshCw, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import {
  ApiError,
  type Heartbeat,
  type HistoryPoint,
  type MetricSample,
  type MonitorHistoryRange,
  type MonitorView,
  apiFetch,
  monitorTarget,
} from '@/lib/api';
import { HeartbeatBar } from '@/components/heartbeat-bar';
import { RANGE_OPTIONS, RangeDropdown } from '@/components/range-dropdown';
import { ResponseChart } from '@/components/response-chart';
import { StatusPill } from '@/components/status-badge';
import { Button, Card } from '@/components/ui';
import { intervalLabel, relativeTime, responseLabel, uptimeLabel } from '@/lib/format';

/**
 * Full monitor detail (header actions, uptime, heartbeats, response/metrics chart).
 * Shared by the standalone /monitors/[id] page and the Monitors split view.
 */
export function MonitorDetail({ id, onDeleted }: { id: string; onDeleted?: () => void }) {
  const qc = useQueryClient();
  const [actionError, setActionError] = useState<string | null>(null);
  const [rangeId, setRangeId] = useState<MonitorHistoryRange>('recent');
  const [agentToken, setAgentToken] = useState<string | null>(null);
  const onActionError = (e: unknown) => setActionError(e instanceof ApiError ? e.message : 'Action failed');

  const { data: monitor, isError } = useQuery({
    queryKey: ['monitor', id],
    queryFn: () => apiFetch<MonitorView>(`/monitors/${id}`),
    refetchInterval: 5_000,
  });
  const isSystem = monitor?.type === 'system';
  // Recent-checks strip: a small fixed window of raw beats, independent of the chart range.
  const { data: beats } = useQuery({
    queryKey: ['heartbeats', id, 60],
    queryFn: () => apiFetch<Heartbeat[]>(`/monitors/${id}/heartbeats?limit=60`),
    refetchInterval: 5_000,
  });
  // Response-time chart: normalized history (raw beats short-range, rollups long-range).
  const { data: history } = useQuery({
    queryKey: ['history', id, rangeId],
    queryFn: () => apiFetch<HistoryPoint[]>(`/monitors/${id}/history?range=${rangeId}`),
    refetchInterval: 5_000,
    enabled: !isSystem,
  });
  const { data: metrics } = useQuery({
    queryKey: ['metrics', id, 200],
    queryFn: () => apiFetch<MetricSample[]>(`/monitors/${id}/metrics?limit=200`),
    refetchInterval: 5_000,
    enabled: isSystem,
  });

  const toggle = useMutation({
    mutationFn: () => apiFetch(`/monitors/${id}/${monitor?.isActive ? 'pause' : 'resume'}`, { method: 'POST' }),
    onSuccess: () => {
      setActionError(null);
      void qc.invalidateQueries({ queryKey: ['monitor', id] });
      void qc.invalidateQueries({ queryKey: ['monitors'] });
    },
    onError: onActionError,
  });
  const remove = useMutation({
    mutationFn: () => apiFetch(`/monitors/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['monitors'] });
      onDeleted?.();
    },
    onError: onActionError,
  });
  const genToken = useMutation({
    mutationFn: () => apiFetch<{ token: string }>(`/agent/token/${id}`, { method: 'POST' }),
    onSuccess: (r) => setAgentToken(r.token),
    onError: onActionError,
  });

  if (isError) return <div className="p-8 text-red-600">Monitor not found.</div>;
  if (!monitor) return <div className="p-8 text-slate-500">Loading…</div>;

  const metricsData = [...(metrics ?? [])].reverse().map((m, i) => ({ i, cpu: m.cpuPct, mem: m.memPct, disk: m.diskPct }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <StatusPill status={monitor.status} />
            <h1 className="truncate text-xl font-bold lg:text-2xl">{monitor.name}</h1>
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-500">
            <span className="font-medium uppercase">{monitor.type}</span>
            <span className="truncate">{monitorTarget(monitor)}</span>
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" aria-hidden />
              {intervalLabel(monitor.intervalSeconds)}
            </span>
            {monitor.lastResponseTime !== null && <span>{responseLabel(monitor.lastResponseTime)}</span>}
            <span>checked {relativeTime(monitor.lastCheckedAt)}</span>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => toggle.mutate()}>
            {monitor.isActive ? <Pause className="h-4 w-4" aria-hidden /> : <Play className="h-4 w-4" aria-hidden />}
            {monitor.isActive ? 'Pause' : 'Resume'}
          </Button>
          <Link href={`/monitors/${id}/edit`}>
            <Button variant="outline" size="sm">
              <Pencil className="h-4 w-4" aria-hidden />
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

      {actionError && <p className="text-sm text-red-600">{actionError}</p>}

      {isSystem && (monitor.config as { source?: string }).source === 'agent' && (
        <Card className="p-5">
          <div className="mb-2 text-sm font-medium">Remote agent</div>
          {agentToken ? (
            <div className="space-y-2">
              <p className="text-xs text-slate-500">Run this on the remote host (token shown once):</p>
              <pre className="overflow-x-auto rounded bg-slate-100 p-3 text-xs dark:bg-slate-800">
                pingwatch agent --server {typeof window !== 'undefined' ? window.location.origin : ''} --token{' '}
                {agentToken}
              </pre>
            </div>
          ) : (
            <Button size="sm" variant="outline" onClick={() => genToken.mutate()} disabled={genToken.isPending}>
              <RefreshCw className="h-4 w-4" aria-hidden />
              Generate agent token
            </Button>
          )}
        </Card>
      )}

      <div className="grid grid-cols-3 gap-4">
        {([['24h', monitor.uptime24h], ['7 days', monitor.uptime7d], ['30 days', monitor.uptime30d]] as const).map(
          ([label, value]) => (
            <Card key={label} className="p-4 lg:p-5">
              <div className="text-xs text-slate-500 lg:text-sm">{label} uptime</div>
              <div className="mt-1 text-xl font-bold tabular-nums lg:text-2xl">{uptimeLabel(value)}</div>
            </Card>
          ),
        )}
      </div>

      <Card className="p-5">
        <div className="mb-3 text-sm font-medium">Recent checks</div>
        <HeartbeatBar beats={beats ?? []} />
      </Card>

      <Card className="p-5">
        <div className="mb-3 flex items-center justify-between">
          <div className="text-sm font-medium">{isSystem ? 'System metrics (%)' : 'Response time (ms)'}</div>
          {!isSystem && <RangeDropdown options={RANGE_OPTIONS} value={rangeId} onChange={setRangeId} />}
        </div>
        <div className="h-60 [&_.recharts-surface]:outline-none [&_.recharts-wrapper]:outline-none [&_svg]:outline-none">
          {isSystem ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={metricsData}>
                <XAxis dataKey="i" hide />
                <YAxis width={36} tick={{ fontSize: 11 }} domain={[0, 100]} unit="%" />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} labelFormatter={() => ''} />
                <Legend />
                <Line type="monotone" dataKey="cpu" name="CPU" stroke="#5cdd8b" dot={false} strokeWidth={2} isAnimationActive={false} />
                <Line type="monotone" dataKey="mem" name="Memory" stroke="#3b82f6" dot={false} strokeWidth={2} isAnimationActive={false} />
                <Line type="monotone" dataKey="disk" name="Disk" stroke="#f59e0b" dot={false} strokeWidth={2} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <ResponseChart points={history ?? []} showMinMax={rangeId !== 'recent'} />
          )}
        </div>
      </Card>
    </div>
  );
}
