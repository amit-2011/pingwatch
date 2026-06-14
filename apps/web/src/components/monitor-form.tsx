'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import { ApiError, type MonitorView, type Project, apiFetch } from '@/lib/api';
import { Button, Card, Input, Label } from '@/components/ui';

export function MonitorForm({ monitor }: { monitor?: MonitorView }) {
  const router = useRouter();
  const qc = useQueryClient();
  const { data: projects } = useQuery({ queryKey: ['projects'], queryFn: () => apiFetch<Project[]>('/projects') });
  const cfg = (monitor?.config ?? {}) as { url?: string; method?: string; keyword?: string };

  const [name, setName] = useState(monitor?.name ?? '');
  const [url, setUrl] = useState(cfg.url ?? '');
  const [method, setMethod] = useState(cfg.method ?? 'GET');
  const [keyword, setKeyword] = useState(cfg.keyword ?? '');
  const [intervalSeconds, setIntervalSeconds] = useState(monitor?.intervalSeconds ?? 60);
  const [retries, setRetries] = useState(monitor?.retries ?? 3);
  const [timeoutMs, setTimeoutMs] = useState(monitor?.timeoutMs ?? 30_000);
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async (): Promise<MonitorView> => {
      const config: Record<string, unknown> = { url, method };
      if (keyword.trim()) config.keyword = keyword.trim();
      if (monitor) {
        return apiFetch<MonitorView>(`/monitors/${monitor.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ name, intervalSeconds, retries, timeoutMs, config }),
        });
      }
      return apiFetch<MonitorView>('/monitors', {
        method: 'POST',
        body: JSON.stringify({
          type: 'http',
          name,
          projectId: projects?.[0]?.id,
          intervalSeconds,
          retries,
          retryIntervalSeconds: 30,
          timeoutMs,
          isActive: true,
          config,
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

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <Card className="space-y-5 p-6">
        <div className="space-y-1.5">
          <Label htmlFor="name">Name</Label>
          <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="My API" required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="url">URL</Label>
          <Input id="url" type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com/health" required />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="method">Method</Label>
            <select
              id="method"
              value={method}
              onChange={(e) => setMethod(e.target.value)}
              className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900"
            >
              {['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'].map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="keyword">Keyword (optional)</Label>
            <Input id="keyword" value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="must contain…" />
          </div>
        </div>
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
