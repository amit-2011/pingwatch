'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Send, X } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import type { ChannelType } from '@pingwatch/shared';
import { ApiError, type ChannelView, apiFetch } from '@/lib/api';
import { Button, Card, Input, Label } from '@/components/ui';

const TYPE_OPTIONS: ReadonlyArray<{ value: ChannelType; label: string }> = [
  { value: 'telegram', label: 'Telegram' },
  { value: 'slack', label: 'Slack' },
  { value: 'email', label: 'Email (SMTP)' },
  { value: 'discord', label: 'Discord' },
  { value: 'webhook', label: 'Webhook' },
  { value: 'msteams', label: 'Microsoft Teams' },
  { value: 'pushover', label: 'Pushover' },
  { value: 'gotify', label: 'Gotify' },
  { value: 'twilio', label: 'Twilio SMS' },
  { value: 'whatsapp', label: 'WhatsApp' },
];

const SELECT_CLASS =
  'h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-slate-400 dark:border-slate-700 dark:bg-slate-900';

export default function ChannelsPage() {
  const qc = useQueryClient();
  const { data: channels } = useQuery({ queryKey: ['channels'], queryFn: () => apiFetch<ChannelView[]>('/channels') });

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [type, setType] = useState<ChannelType>('telegram');
  const [name, setName] = useState('');
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, string>>({});

  const set = (k: string, v: string) => setFields((p) => ({ ...p, [k]: v }));

  function resetForm() {
    setEditingId(null);
    setType('telegram');
    setName('');
    setFields({});
    setError(null);
  }

  function closeForm() {
    setShowForm(false);
    resetForm();
  }

  function openCreate() {
    resetForm();
    setShowForm(true);
  }

  function openEdit(channel: ChannelView) {
    setEditingId(channel.id);
    setType(channel.type as ChannelType);
    setName(channel.name);
    setFields({});
    setError(null);
    setShowForm(true);
  }

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
      case 'discord':
        return {
          webhookUrl: fields.webhookUrl ?? '',
          ...(fields.username ? { username: fields.username } : {}),
        };
      case 'webhook':
        return {
          url: fields.url ?? '',
          ...(fields.authHeader ? { headers: { Authorization: fields.authHeader } } : {}),
        };
      case 'msteams':
        return { webhookUrl: fields.webhookUrl ?? '' };
      case 'pushover':
        return { appToken: fields.appToken ?? '', userKey: fields.userKey ?? '' };
      case 'gotify':
        return { serverUrl: fields.serverUrl ?? '', appToken: fields.appToken ?? '' };
      case 'twilio':
        return {
          accountSid: fields.accountSid ?? '',
          authToken: fields.authToken ?? '',
          from: fields.from ?? '',
          to: fields.to ?? '',
        };
      case 'whatsapp':
        return {
          phoneNumberId: fields.phoneNumberId ?? '',
          accessToken: fields.accessToken ?? '',
          to: fields.to ?? '',
        };
      default:
        return { botToken: fields.botToken ?? '', chatId: fields.chatId ?? '' };
    }
  }

  // When editing, the stored config (secrets) is never returned, so the config fields start blank
  // and are only resubmitted if the user actually typed something — otherwise the existing one is kept.
  const hasConfigInput = Object.values(fields).some((v) => v.trim() !== '');

  const save = useMutation({
    mutationFn: () => {
      if (editingId) {
        const body: Record<string, unknown> = { name, type };
        if (hasConfigInput) body.config = buildConfig();
        return apiFetch(`/channels/${editingId}`, { method: 'PATCH', body: JSON.stringify(body) });
      }
      return apiFetch('/channels', {
        method: 'POST',
        body: JSON.stringify({ name, type, config: buildConfig(), isActive: true }),
      });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['channels'] });
      closeForm();
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
    save.mutate();
  }

  return (
    <div className="mx-auto max-w-3xl p-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Notifications</h1>
          <p className="text-sm text-slate-500">Where PingWatch sends alerts.</p>
        </div>
        <Button onClick={() => (showForm && !editingId ? closeForm() : openCreate())}>
          <Plus className="h-4 w-4" />
          Add channel
        </Button>
      </div>

      {showForm && (
        <Card className="mb-6 p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold">{editingId ? 'Edit channel' : 'New channel'}</h2>
            <Button type="button" variant="ghost" size="sm" onClick={closeForm} aria-label="Close">
              <X className="h-4 w-4" />
            </Button>
          </div>
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
            {type === 'discord' && (
              <>
                <Field label="Webhook URL" value={fields.webhookUrl ?? ''} onChange={(v) => set('webhookUrl', v)} placeholder="https://discord.com/api/webhooks/…" />
                <Field label="Bot username (optional)" value={fields.username ?? ''} onChange={(v) => set('username', v)} placeholder="PingWatch" />
              </>
            )}
            {type === 'webhook' && (
              <>
                <Field label="Endpoint URL" value={fields.url ?? ''} onChange={(v) => set('url', v)} placeholder="https://example.com/hooks/pingwatch" />
                <Field label="Authorization header (optional)" value={fields.authHeader ?? ''} onChange={(v) => set('authHeader', v)} placeholder="Bearer …" type="password" />
              </>
            )}
            {type === 'msteams' && (
              <Field label="Webhook URL" value={fields.webhookUrl ?? ''} onChange={(v) => set('webhookUrl', v)} placeholder="https://outlook.office.com/webhook/…" />
            )}
            {type === 'pushover' && (
              <>
                <Field label="Application token" value={fields.appToken ?? ''} onChange={(v) => set('appToken', v)} placeholder="azGD…" type="password" />
                <Field label="User key" value={fields.userKey ?? ''} onChange={(v) => set('userKey', v)} placeholder="uQiR…" type="password" />
              </>
            )}
            {type === 'gotify' && (
              <>
                <Field label="Server URL" value={fields.serverUrl ?? ''} onChange={(v) => set('serverUrl', v)} placeholder="https://gotify.example.com" />
                <Field label="Application token" value={fields.appToken ?? ''} onChange={(v) => set('appToken', v)} placeholder="A…" type="password" />
              </>
            )}
            {type === 'twilio' && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Account SID" value={fields.accountSid ?? ''} onChange={(v) => set('accountSid', v)} placeholder="AC…" />
                  <Field label="Auth token" value={fields.authToken ?? ''} onChange={(v) => set('authToken', v)} placeholder="••••••••" type="password" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="From (E.164)" value={fields.from ?? ''} onChange={(v) => set('from', v)} placeholder="+15555550100" />
                  <Field label="To (E.164)" value={fields.to ?? ''} onChange={(v) => set('to', v)} placeholder="+15555550199" />
                </div>
              </>
            )}
            {type === 'whatsapp' && (
              <>
                <Field label="Phone number ID" value={fields.phoneNumberId ?? ''} onChange={(v) => set('phoneNumberId', v)} placeholder="1029384756…" />
                <Field label="Access token" value={fields.accessToken ?? ''} onChange={(v) => set('accessToken', v)} placeholder="EAAG…" type="password" />
                <Field label="To (E.164)" value={fields.to ?? ''} onChange={(v) => set('to', v)} placeholder="+15555550199" />
              </>
            )}

            {editingId && (
              <p className="text-xs text-slate-500">
                Leave the credential fields blank to keep the saved values. Fill them in only to replace the current config.
              </p>
            )}
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex items-center gap-2">
              <Button type="submit" disabled={save.isPending}>
                {save.isPending ? 'Saving…' : editingId ? 'Save changes' : 'Save channel'}
              </Button>
              <Button type="button" variant="outline" onClick={closeForm}>
                Cancel
              </Button>
            </div>
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
                <Button variant="outline" size="sm" onClick={() => openEdit(c)}>
                  <Pencil className="h-4 w-4" />
                  Edit
                </Button>
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
