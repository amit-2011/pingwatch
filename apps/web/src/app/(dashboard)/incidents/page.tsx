'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, ChevronDown, MessageSquare } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { ApiError, type IncidentSeverity, type IncidentView, apiFetch } from '@/lib/api';
import { Badge, Button, Card, Input } from '@/components/ui';
import { cn } from '@/lib/utils';

const SEVERITY_CLASS: Record<IncidentSeverity, string> = {
  minor: 'border-amber-300 text-amber-600 dark:border-amber-800 dark:text-amber-400',
  major: 'border-orange-300 text-orange-600 dark:border-orange-800 dark:text-orange-400',
  critical: 'border-red-300 text-red-600 dark:border-red-800 dark:text-red-400',
};

const KIND_LABEL: Record<string, string> = {
  opened: 'Opened',
  notified: 'Notified',
  acknowledged: 'Acknowledged',
  comment: 'Comment',
  resolved: 'Resolved',
};

function fmt(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

export default function IncidentsPage() {
  const { data: incidents } = useQuery({
    queryKey: ['incidents'],
    queryFn: () => apiFetch<IncidentView[]>('/incidents'),
  });

  const active = incidents?.filter((i) => i.status !== 'resolved') ?? [];
  const resolved = incidents?.filter((i) => i.status === 'resolved') ?? [];

  return (
    <div className="mx-auto max-w-3xl p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Incidents</h1>
        <p className="text-sm text-slate-500">Coordinate the response and keep users informed.</p>
      </div>

      {incidents && incidents.length === 0 && (
        <Card className="py-12 text-center text-slate-500">No incidents — all clear.</Card>
      )}

      {active.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Active</h2>
          <div className="space-y-2">
            {active.map((i) => (
              <IncidentCard key={i.id} incident={i} defaultOpen />
            ))}
          </div>
        </section>
      )}

      {resolved.length > 0 && (
        <section>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Resolved</h2>
          <div className="space-y-2">
            {resolved.map((i) => (
              <IncidentCard key={i.id} incident={i} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function IncidentCard({ incident, defaultOpen = false }: { incident: IncidentView; defaultOpen?: boolean }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(defaultOpen);
  const [comment, setComment] = useState('');
  const [error, setError] = useState<string | null>(null);

  const refresh = () => void qc.invalidateQueries({ queryKey: ['incidents'] });
  const onErr = (e: unknown) => setError(e instanceof ApiError ? e.message : 'Action failed');

  const postComment = useMutation({
    mutationFn: () =>
      apiFetch(`/incidents/${incident.id}/comment`, { method: 'POST', body: JSON.stringify({ message: comment }) }),
    onSuccess: () => {
      setComment('');
      refresh();
    },
    onError: onErr,
  });
  const acknowledge = useMutation({
    mutationFn: () => apiFetch(`/incidents/${incident.id}/acknowledge`, { method: 'POST' }),
    onSuccess: refresh,
    onError: onErr,
  });
  const resolve = useMutation({
    mutationFn: () => apiFetch(`/incidents/${incident.id}/resolve`, { method: 'POST' }),
    onSuccess: refresh,
    onError: onErr,
  });
  const setPublished = useMutation({
    mutationFn: (isPublished: boolean) =>
      apiFetch(`/incidents/${incident.id}`, { method: 'PATCH', body: JSON.stringify({ isPublished }) }),
    onSuccess: refresh,
    onError: onErr,
  });

  function submitComment(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (comment.trim()) postComment.mutate();
  }

  return (
    <Card className="overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-3 p-5 text-left"
      >
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate font-medium">{incident.title}</span>
            <Badge className={SEVERITY_CLASS[incident.severity]}>{incident.severity}</Badge>
            <Badge
              className={
                incident.status === 'resolved'
                  ? 'border-emerald-300 text-emerald-600 dark:border-emerald-800 dark:text-emerald-400'
                  : 'border-red-300 text-red-600 dark:border-red-800 dark:text-red-400'
              }
            >
              {incident.status}
            </Badge>
            {incident.isPublished && (
              <Badge className="border-sky-300 text-sky-600 dark:border-sky-800 dark:text-sky-400">Published</Badge>
            )}
          </div>
          <div className="mt-1 text-sm text-slate-500">
            {incident.monitorName} · started {fmt(incident.startedAt)}
          </div>
        </div>
        <ChevronDown className={cn('h-4 w-4 shrink-0 text-slate-400 transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="border-t border-slate-200 p-5 dark:border-slate-800">
          <ol className="relative space-y-4 border-l border-slate-200 pl-5 dark:border-slate-800">
            {incident.updates.map((u) => (
              <li key={u.id} className="relative">
                <span className="absolute -left-[1.4rem] top-1 h-2.5 w-2.5 rounded-full bg-slate-300 dark:bg-slate-600" />
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-sm font-medium">{KIND_LABEL[u.kind] ?? u.kind}</span>
                  <span className="text-xs text-slate-400">{fmt(u.createdAt)}</span>
                </div>
                {u.message && <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-300">{u.message}</p>}
              </li>
            ))}
          </ol>

          {incident.status !== 'resolved' && (
            <form onSubmit={submitComment} className="mt-5 flex gap-2">
              <Input
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Post an update…"
                aria-label="Incident comment"
              />
              <Button type="submit" disabled={postComment.isPending || !comment.trim()}>
                <MessageSquare className="h-4 w-4" />
                Post
              </Button>
            </form>
          )}

          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

          <div className="mt-4 flex flex-wrap gap-2">
            {incident.status === 'open' && (
              <Button variant="outline" size="sm" onClick={() => acknowledge.mutate()} disabled={acknowledge.isPending}>
                <Check className="h-4 w-4" />
                Acknowledge
              </Button>
            )}
            {incident.status !== 'resolved' && (
              <Button variant="outline" size="sm" onClick={() => resolve.mutate()} disabled={resolve.isPending}>
                Resolve
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPublished.mutate(!incident.isPublished)}
              disabled={setPublished.isPending}
            >
              {incident.isPublished ? 'Unpublish from status page' : 'Publish to status page'}
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
