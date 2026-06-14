'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import {
  ApiError,
  type MaintenanceWindowView,
  type MonitorView,
  apiFetch,
} from '@/lib/api';
import { Badge, Button, Card, Input, Label } from '@/components/ui';

const SELECT_CLASS =
  'h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-slate-400 dark:border-slate-700 dark:bg-slate-900';

/** Format a Date as the value a <input type="datetime-local"> expects (local time, no zone). */
function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fmt(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

export default function MaintenancePage() {
  const qc = useQueryClient();
  const { data: windows } = useQuery({
    queryKey: ['maintenance'],
    queryFn: () => apiFetch<MaintenanceWindowView[]>('/maintenance'),
  });
  const { data: monitors } = useQuery({
    queryKey: ['monitors'],
    queryFn: () => apiFetch<MonitorView[]>('/monitors'),
  });

  const now = new Date();
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');
  const [monitorId, setMonitorId] = useState<string>('');
  const [startsAt, setStartsAt] = useState(toLocalInput(now));
  const [endsAt, setEndsAt] = useState(toLocalInput(new Date(now.getTime() + 60 * 60 * 1000)));
  const [error, setError] = useState<string | null>(null);

  const invalidate = () => void qc.invalidateQueries({ queryKey: ['maintenance'] });

  const create = useMutation({
    mutationFn: () =>
      apiFetch<MaintenanceWindowView>('/maintenance', {
        method: 'POST',
        body: JSON.stringify({
          title,
          monitorId: monitorId || null,
          startsAt: new Date(startsAt).toISOString(),
          endsAt: new Date(endsAt).toISOString(),
        }),
      }),
    onSuccess: () => {
      invalidate();
      setShowForm(false);
      setTitle('');
      setMonitorId('');
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Failed to save'),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    create.mutate();
  }

  return (
    <div className="mx-auto max-w-3xl p-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Maintenance</h1>
          <p className="text-sm text-slate-500">Schedule planned downtime so it never pages anyone.</p>
        </div>
        <Button onClick={() => setShowForm((s) => !s)}>
          <Plus className="h-4 w-4" />
          Schedule window
        </Button>
      </div>

      {showForm && (
        <Card className="mb-6 p-6">
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="mw-title">Title</Label>
              <Input
                id="mw-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Database upgrade"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mw-monitor">Applies to</Label>
              <select
                id="mw-monitor"
                value={monitorId}
                onChange={(e) => setMonitorId(e.target.value)}
                className={SELECT_CLASS}
              >
                <option value="">All monitors</option>
                {monitors?.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="mw-start">Starts</Label>
                <Input
                  id="mw-start"
                  type="datetime-local"
                  value={startsAt}
                  onChange={(e) => setStartsAt(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="mw-end">Ends</Label>
                <Input
                  id="mw-end"
                  type="datetime-local"
                  value={endsAt}
                  onChange={(e) => setEndsAt(e.target.value)}
                  required
                />
              </div>
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? 'Saving…' : 'Schedule'}
            </Button>
          </form>
        </Card>
      )}

      <div className="space-y-2">
        {windows && windows.length > 0 ? (
          windows.map((w) => <MaintenanceRow key={w.id} window={w} onChange={invalidate} />)
        ) : (
          <Card className="py-12 text-center text-slate-500">No maintenance windows scheduled.</Card>
        )}
      </div>
    </div>
  );
}

function MaintenanceRow({ window: w, onChange }: { window: MaintenanceWindowView; onChange: () => void }) {
  const remove = useMutation({
    mutationFn: () => apiFetch(`/maintenance/${w.id}`, { method: 'DELETE' }),
    onSuccess: onChange,
  });

  return (
    <Card className="flex items-center justify-between p-5">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="truncate font-medium">{w.title}</span>
          {w.isActive && (
            <Badge className="border-amber-300 text-amber-600 dark:border-amber-800 dark:text-amber-400">
              Active now
            </Badge>
          )}
        </div>
        <div className="mt-1 text-sm text-slate-500">
          {w.monitorName ?? 'All monitors'} · {fmt(w.startsAt)} → {fmt(w.endsAt)}
        </div>
      </div>
      <Button variant="ghost" size="sm" onClick={() => remove.mutate()} disabled={remove.isPending}>
        <Trash2 className="h-4 w-4 text-red-600" />
      </Button>
    </Card>
  );
}
