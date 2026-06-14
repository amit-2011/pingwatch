'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Send } from 'lucide-react';
import { useState } from 'react';
import { ApiError, type ChannelView, apiFetch } from '@/lib/api';
import { Button, Card, Input, Label } from '@/components/ui';

export default function ChannelsPage() {
  const qc = useQueryClient();
  const { data: channels } = useQuery({ queryKey: ['channels'], queryFn: () => apiFetch<ChannelView[]>('/channels') });

  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [botToken, setBotToken] = useState('');
  const [chatId, setChatId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, string>>({});

  const create = useMutation({
    mutationFn: () =>
      apiFetch('/channels', {
        method: 'POST',
        body: JSON.stringify({ name, type: 'telegram', config: { botToken, chatId }, isActive: true }),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['channels'] });
      setShowForm(false);
      setName('');
      setBotToken('');
      setChatId('');
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Failed to save'),
  });

  const test = useMutation({
    mutationFn: (id: string) => apiFetch<{ ok: boolean; message?: string }>(`/channels/${id}/test`, { method: 'POST' }),
    onSuccess: (r, id) => setResults((p) => ({ ...p, [id]: r.ok ? 'Sent ✓' : `Failed: ${r.message ?? 'error'}` })),
  });

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
        <Card className="mb-6 space-y-4 p-6">
          <h3 className="font-medium">New Telegram channel</h3>
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Team alerts" />
          </div>
          <div className="space-y-1.5">
            <Label>Bot token</Label>
            <Input value={botToken} onChange={(e) => setBotToken(e.target.value)} placeholder="123456:ABC-DEF…" />
          </div>
          <div className="space-y-1.5">
            <Label>Chat ID</Label>
            <Input value={chatId} onChange={(e) => setChatId(e.target.value)} placeholder="-1001234567890" />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button
            onClick={() => {
              setError(null);
              create.mutate();
            }}
            disabled={create.isPending}
          >
            Save channel
          </Button>
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
