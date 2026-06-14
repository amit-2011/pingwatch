'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DNS_RECORD_TYPES, HTTP_METHODS } from '@pingwatch/shared';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import { ApiError, type ChannelView, type MonitorView, type Project, apiFetch } from '@/lib/api';
import { Button, Card, Input, Label } from '@/components/ui';

const TYPE_OPTIONS = [
  { value: 'http', label: 'HTTP(S)' },
  { value: 'tcp', label: 'TCP Port' },
  { value: 'ping', label: 'Ping (ICMP)' },
  { value: 'dns', label: 'DNS' },
  { value: 'ssl', label: 'SSL Certificate' },
] as const;

const SELECT_CLASS =
  'h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-slate-400 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900';

function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}
function num(v: unknown, fallback: number): number {
  return typeof v === 'number' ? v : fallback;
}

export function MonitorForm({ monitor }: { monitor?: MonitorView }) {
  const router = useRouter();
  const qc = useQueryClient();
  const { data: projects } = useQuery({ queryKey: ['projects'], queryFn: () => apiFetch<Project[]>('/projects') });
  const { data: channels } = useQuery({ queryKey: ['channels'], queryFn: () => apiFetch<ChannelView[]>('/channels') });
  const cfg = (monitor?.config ?? {}) as Record<string, unknown>;

  const isEdit = monitor !== undefined;
  const [type, setType] = useState(monitor?.type ?? 'http');
  const [name, setName] = useState(monitor?.name ?? '');

  // type-specific fields (shared across types where they overlap)
  const [url, setUrl] = useState(str(cfg.url));
  const [method, setMethod] = useState(str(cfg.method, 'GET'));
  const [keyword, setKeyword] = useState(str(cfg.keyword));
  const [host, setHost] = useState(str(cfg.host) || str(cfg.hostname));
  const [port, setPort] = useState(num(cfg.port, monitor?.type === 'ssl' ? 443 : 80));
  const [recordType, setRecordType] = useState(str(cfg.recordType, 'A'));
  const [expectedValue, setExpectedValue] = useState(str(cfg.expectedValue));
  const [warnDays, setWarnDays] = useState(num(cfg.warnDays, 14));

  const [intervalSeconds, setIntervalSeconds] = useState(monitor?.intervalSeconds ?? 60);
  const [retries, setRetries] = useState(monitor?.retries ?? 3);
  const [timeoutMs, setTimeoutMs] = useState(monitor?.timeoutMs ?? 30_000);
  const [notifyChannelIds, setNotifyChannelIds] = useState<string[]>(monitor?.notifyChannelIds ?? []);
  const [resendEveryMin, setResendEveryMin] = useState(monitor?.resendEveryMin != null ? String(monitor.resendEveryMin) : '');
  const [error, setError] = useState<string | null>(null);

  function buildConfig(): Record<string, unknown> {
    switch (type) {
      case 'tcp':
        return { host, port };
      case 'ping':
        return { host };
      case 'dns':
        return { hostname: host, recordType, ...(expectedValue.trim() ? { expectedValue: expectedValue.trim() } : {}) };
      case 'ssl':
        return { host, port, warnDays };
      default:
        return { url, method, ...(keyword.trim() ? { keyword: keyword.trim() } : {}) };
    }
  }

  const mutation = useMutation({
    mutationFn: async (): Promise<MonitorView> => {
      const config = buildConfig();
      const notify = { notifyChannelIds, resendEveryMin: resendEveryMin ? Number(resendEveryMin) : null };
      if (monitor) {
        return apiFetch<MonitorView>(`/monitors/${monitor.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ name, intervalSeconds, retries, timeoutMs, config, ...notify }),
        });
      }
      return apiFetch<MonitorView>('/monitors', {
        method: 'POST',
        body: JSON.stringify({
          type,
          name,
          projectId: projects?.[0]?.id,
          intervalSeconds,
          retries,
          retryIntervalSeconds: 30,
          timeoutMs,
          isActive: true,
          config,
          ...notify,
        }),
      });
    },
    onSuccess: (m) => {
      void qc.invalidateQueries({ queryKey: ['monitors'] });
      router.push(`/monitors/${m.id}`);
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Failed to save monitor'),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    mutation.mutate();
  }

  const hostLabel = type === 'dns' ? 'Hostname' : 'Host';

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <Card className="space-y-5 p-6">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="type">Type</Label>
            <select id="type" value={type} disabled={isEdit} onChange={(e) => setType(e.target.value as typeof type)} className={SELECT_CLASS}>
              {TYPE_OPTIONS.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
            {isEdit && <p className="text-xs text-slate-400">Type can&apos;t be changed after creation.</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="name">Name</Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="My service" required />
          </div>
        </div>

        {type === 'http' && (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="url">URL</Label>
              <Input id="url" type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com/health" required />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="method">Method</Label>
                <select id="method" value={method} onChange={(e) => setMethod(e.target.value)} className={SELECT_CLASS}>
                  {HTTP_METHODS.map((m) => (
                    <option key={m}>{m}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="keyword">Keyword (optional)</Label>
                <Input id="keyword" value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="must contain…" />
              </div>
            </div>
          </>
        )}

        {(type === 'tcp' || type === 'ping' || type === 'dns' || type === 'ssl') && (
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="host">{hostLabel}</Label>
              <Input id="host" value={host} onChange={(e) => setHost(e.target.value)} placeholder="example.com" required />
            </div>
            {(type === 'tcp' || type === 'ssl') && (
              <div className="space-y-1.5">
                <Label htmlFor="port">Port</Label>
                <Input id="port" type="number" min={1} max={65535} value={port} onChange={(e) => setPort(Number(e.target.value))} />
              </div>
            )}
            {type === 'dns' && (
              <div className="space-y-1.5">
                <Label htmlFor="recordType">Record type</Label>
                <select id="recordType" value={recordType} onChange={(e) => setRecordType(e.target.value)} className={SELECT_CLASS}>
                  {DNS_RECORD_TYPES.map((r) => (
                    <option key={r}>{r}</option>
                  ))}
                </select>
              </div>
            )}
            {type === 'ssl' && (
              <div className="space-y-1.5">
                <Label htmlFor="warnDays">Warn before expiry (days)</Label>
                <Input id="warnDays" type="number" min={1} max={365} value={warnDays} onChange={(e) => setWarnDays(Number(e.target.value))} />
              </div>
            )}
            {type === 'dns' && (
              <div className="col-span-2 space-y-1.5">
                <Label htmlFor="expected">Expected value (optional)</Label>
                <Input id="expected" value={expectedValue} onChange={(e) => setExpectedValue(e.target.value)} placeholder="1.2.3.4" />
              </div>
            )}
          </div>
        )}
      </Card>

      <Card className="space-y-4 p-6">
        <h3 className="font-medium">Checks &amp; anti-flap</h3>
        <div className="grid grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="interval">Interval (s)</Label>
            <Input id="interval" type="number" min={20} value={intervalSeconds} onChange={(e) => setIntervalSeconds(Number(e.target.value))} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="retries">Retries</Label>
            <Input id="retries" type="number" min={0} max={10} value={retries} onChange={(e) => setRetries(Number(e.target.value))} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="timeout">Timeout (ms)</Label>
            <Input id="timeout" type="number" min={1000} value={timeoutMs} onChange={(e) => setTimeoutMs(Number(e.target.value))} />
          </div>
        </div>
        <p className="text-xs text-slate-400">
          A single failure never alerts — the monitor is marked down only after {retries + 1} consecutive failures.
        </p>
      </Card>

      <Card className="space-y-3 p-6">
        <h3 className="font-medium">Notifications</h3>
        {channels && channels.length > 0 ? (
          <>
            <div className="space-y-2">
              {channels.map((c) => (
                <label key={c.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={notifyChannelIds.includes(c.id)}
                    onChange={(e) =>
                      setNotifyChannelIds((p) => (e.target.checked ? [...p, c.id] : p.filter((x) => x !== c.id)))
                    }
                  />
                  {c.name} <span className="capitalize text-slate-400">({c.type})</span>
                </label>
              ))}
            </div>
            <div className="space-y-1.5 pt-2">
              <Label htmlFor="resend">Re-notify every (minutes, optional)</Label>
              <Input id="resend" type="number" min={1} value={resendEveryMin} onChange={(e) => setResendEveryMin(e.target.value)} placeholder="e.g. 30" className="max-w-xs" />
            </div>
          </>
        ) : (
          <p className="text-sm text-slate-500">
            No channels yet —{' '}
            <a href="/channels" className="underline">
              add one
            </a>{' '}
            to get alerted.
          </p>
        )}
      </Card>

      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-3">
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? 'Saving…' : monitor ? 'Save changes' : 'Create monitor'}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
