'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Send } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { ApiError, type ChannelView, apiFetch } from '@/lib/api';
import { Button, Card, Input, Label } from '@/components/ui';

const TYPE_OPTIONS = [
  { value: 'telegram', label: 'Telegram' },
  { value: 'slack', label: 'Slack' },
  { value: 'email', label: 'Email (SMTP)' },
] as const;

const SELECT_CLASS =
  'h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-slate-400 dark:border-slate-700 dark:bg-slate-900';

export default function ChannelsPage() {
  const qc = useQueryClient();
  const { data: channels } = useQuery({ queryKey: ['channels'], queryFn: () => apiFetch<ChannelView[]>('/channels') });

  const [showForm, setShowForm] = useState(false);
  const [type, setType] = useState<'telegram' | 'slack' | 'email'>('telegram');
  const [name, setName] = useState('');
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, string>>({});

  const set = (k: string, v: string) => setFields((p) => ({ ...p, [k]: v }));

  function buildConfig(): Record<string, unknown> {
    switch (type) {
      case 'slack':
        return { webhookUrl: fields.webhookUrl ?? '' };
      case 'email':
        return {
          host: fields.host ?? '',
          port: Number(fields.port ?? '587'),
          secure: fields.secure === 'true',
          ...(fields.username ? { username: fields.username } : {}),
          ...(fields.password ? { password: fields.password } : {}),
          from: fields.from ?? '',
          to: fields.to ?? '',
        };
      default:
        return { botToken: fields.botToken ?? '', chatId: fields.chatId ?? '' };
    }
  }

  const create = useMutation({
    mutationFn: () =>
      apiFetch('/channels', { method: 'POST', body: JSON.stringify({ name, type, config: buildConfig(), isActive: true }) }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['channels'] });
      setShowForm(false);
      setName('');
      setFields({});
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Failed to save'),
  });

  const test = useMutation({
    mutationFn: (id: string) => apiFetch<{ ok: boolean; message?: string }>(`/channels/${id}/test`, { method: 'POST' }),
    onSuccess: (r, id) => setResults((p) => ({ ...p, [id]: r.ok ? 'Sent ✓' : `Failed: ${r.message ?? 'error'}` })),
    onError: (e, id) => setResults((p) => ({ ...p, [id]: e instanceof ApiError ? `Failed: ${e.message}` : 'Failed' })),
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
          <h1 className="text-2xl font-bold">Notifications</h1>
          <p className="text-sm text-slate-500">Where PingWatch sends alerts.</p>
        </div>
        <Button onClick={() => setShowForm((s) => !s)}>
          <Plus className="h-4 w-4" />
          Add channel
        </Button>
      </div>

      {showForm && (
        <Card className="mb-6 p-6">
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="ctype">Type</Label>
                <select id="ctype" value={type} onChange={(e) => setType(e.target.value as typeof type)} className={SELECT_CLASS}>
                  {TYPE_OPTIONS.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cname">Name</Label>
                <Input id="cname" value={name} onChange={(e) => setName(e.target.value)} placeholder="Team alerts" required />
              </div>
            </div>

            {type === 'telegram' && (
              <>
                <Field label="Bot token" value={fields.botToken ?? ''} onChange={(v) => set('botToken', v)} placeholder="123456:ABC-DEF…" />
                <Field label="Chat ID" value={fields.chatId ?? ''} onChange={(v) => set('chatId', v)} placeholder="-1001234567890" />
              </>
            )}
            {type === 'slack' && (
              <Field label="Incoming webhook URL" value={fields.webhookUrl ?? ''} onChange={(v) => set('webhookUrl', v)} placeholder="https://hooks.slack.com/services/…" />
            )}
            {type === 'email' && (
              <>
                <div className="grid grid-cols-3 gap-4">
                  <div className="col-span-2">
                    <Field label="SMTP host" value={fields.host ?? ''} onChange={(v) => set('host', v)} placeholder="smtp.example.com" />
                  </div>
                  <Field label="Port" value={fields.port ?? '587'} onChange={(v) => set('port', v)} placeholder="587" type="number" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Username (optional)" value={fields.username ?? ''} onChange={(v) => set('username', v)} placeholder="user@example.com" />
                  <Field label="Password (optional)" value={fields.password ?? ''} onChange={(v) => set('password', v)} placeholder="••••••••" type="password" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="From" value={fields.from ?? ''} onChange={(v) => set('from', v)} placeholder="alerts@example.com" type="email" />
                  <Field label="To" value={fields.to ?? ''} onChange={(v) => set('to', v)} placeholder="oncall@example.com" type="email" />
                </div>
              </>
            )}

            {error && <p className="text-sm text-red-600">{error}</p>}
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? 'Saving…' : 'Save channel'}
            </Button>
          </form>
        </Card>
      )}

      <div className="space-y-2">
        {channels && channels.length > 0 ? (
          channels.map((c) => (
            <Card key={c.id} className="flex items-center justify-between p-5">
              <div>
                <div className="font-medium">{c.name}</div>
                <div className="text-sm capitalize text-slate-500">
                  {c.type}
                  {c.lastError ? ` · last error: ${c.lastError}` : ''}
                </div>
              </div>
              <div className="flex items-center gap-3">
                {results[c.id] && <span className="text-sm text-slate-500">{results[c.id]}</span>}
                <Button variant="outline" size="sm" onClick={() => test.mutate(c.id)} disabled={test.isPending}>
                  <Send className="h-4 w-4" />
                  Test
                </Button>
              </div>
            </Card>
          ))
        ) : (
          <Card className="py-12 text-center text-slate-500">No notification channels yet.</Card>
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </div>
  );
}
