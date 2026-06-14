'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Copy, ExternalLink, Plus, Trash2 } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import {
  ApiError,
  type MonitorView,
  type StatusPageAdminView,
  apiFetch,
} from '@/lib/api';
import { Badge, Button, Card, Input, Label } from '@/components/ui';

export default function StatusPagesPage() {
  const qc = useQueryClient();
  const { data: pages } = useQuery({
    queryKey: ['status-pages'],
    queryFn: () => apiFetch<StatusPageAdminView[]>('/status-pages'),
  });
  const { data: monitors } = useQuery({
    queryKey: ['monitors'],
    queryFn: () => apiFetch<MonitorView[]>('/monitors'),
  });

  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const invalidate = () => void qc.invalidateQueries({ queryKey: ['status-pages'] });

  const create = useMutation({
    mutationFn: () =>
      apiFetch<StatusPageAdminView>('/status-pages', {
        method: 'POST',
        body: JSON.stringify({
          title,
          ...(description ? { description } : {}),
          monitorIds: selected,
          isPublished: true,
        }),
      }),
    onSuccess: () => {
      invalidate();
      setShowForm(false);
      setTitle('');
      setDescription('');
      setSelected([]);
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Failed to save'),
  });

  function toggle(id: string) {
    setSelected((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    create.mutate();
  }

  return (
    <div className="mx-auto max-w-3xl p-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Status pages</h1>
          <p className="text-sm text-slate-500">Public, shareable uptime pages for your services.</p>
        </div>
        <Button onClick={() => setShowForm((s) => !s)}>
          <Plus className="h-4 w-4" />
          New page
        </Button>
      </div>

      {showForm && (
        <Card className="mb-6 p-6">
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="sp-title">Title</Label>
              <Input
                id="sp-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Acme Status"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sp-desc">Description (optional)</Label>
              <Input
                id="sp-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Live status of our services"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Monitors on this page</Label>
              <div className="max-h-56 space-y-1 overflow-auto rounded-md border border-slate-200 p-2 dark:border-slate-800">
                {monitors && monitors.length > 0 ? (
                  monitors.map((m) => (
                    <label
                      key={m.id}
                      className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-slate-50 dark:hover:bg-slate-800/50"
                    >
                      <input
                        type="checkbox"
                        checked={selected.includes(m.id)}
                        onChange={() => toggle(m.id)}
                        className="h-4 w-4"
                      />
                      <span className="font-medium">{m.name}</span>
                      <span className="text-xs uppercase text-slate-400">{m.type}</span>
                    </label>
                  ))
                ) : (
                  <p className="px-2 py-1.5 text-sm text-slate-500">No monitors yet.</p>
                )}
              </div>
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? 'Saving…' : 'Create page'}
            </Button>
          </form>
        </Card>
      )}

      <div className="space-y-2">
        {pages && pages.length > 0 ? (
          pages.map((p) => <StatusPageRow key={p.id} page={p} onChange={invalidate} />)
        ) : (
          <Card className="py-12 text-center text-slate-500">No status pages yet.</Card>
        )}
      </div>
    </div>
  );
}

function StatusPageRow({ page, onChange }: { page: StatusPageAdminView; onChange: () => void }) {
  const [copied, setCopied] = useState(false);
  const url = typeof window !== 'undefined' ? `${window.location.origin}${page.publicUrl}` : page.publicUrl;

  const setPublished = useMutation({
    mutationFn: (isPublished: boolean) =>
      apiFetch(`/status-pages/${page.id}`, { method: 'PATCH', body: JSON.stringify({ isPublished }) }),
    onSuccess: onChange,
  });
  const remove = useMutation({
    mutationFn: () => apiFetch(`/status-pages/${page.id}`, { method: 'DELETE' }),
    onSuccess: onChange,
  });

  function copy() {
    void navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate font-medium">{page.title}</span>
            <Badge
              className={
                page.isPublished
                  ? 'border-emerald-300 text-emerald-600 dark:border-emerald-800 dark:text-emerald-400'
                  : ''
              }
            >
              {page.isPublished ? 'Published' : 'Draft'}
            </Badge>
          </div>
          <div className="mt-1 text-sm text-slate-500">
            {page.monitorIds.length} monitor{page.monitorIds.length === 1 ? '' : 's'}
          </div>
          <button
            onClick={copy}
            className="mt-2 inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-900 dark:hover:text-slate-200"
          >
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            <span className="truncate">{url}</span>
          </button>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <a href={page.publicUrl} target="_blank" rel="noreferrer">
            <Button variant="outline" size="sm">
              <ExternalLink className="h-4 w-4" />
              View
            </Button>
          </a>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPublished.mutate(!page.isPublished)}
            disabled={setPublished.isPending}
          >
            {page.isPublished ? 'Unpublish' : 'Publish'}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => remove.mutate()} disabled={remove.isPending}>
            <Trash2 className="h-4 w-4 text-red-600" />
          </Button>
        </div>
      </div>
    </Card>
  );
}
