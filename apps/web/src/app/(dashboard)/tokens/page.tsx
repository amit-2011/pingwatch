'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Copy, Plus, RotateCw, Trash2 } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import {
  ApiError,
  type ApiTokenSecretView,
  type ApiTokenView,
  type TokenScope,
  apiFetch,
} from '@/lib/api';
import { Badge, Button, Card, Input, Label } from '@/components/ui';

const SCOPES: TokenScope[] = ['read', 'write', 'admin'];

function fmt(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—';
}

export default function TokensPage() {
  const qc = useQueryClient();
  const { data: tokens } = useQuery({
    queryKey: ['api-tokens'],
    queryFn: () => apiFetch<ApiTokenView[]>('/tokens'),
  });

  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [scopes, setScopes] = useState<TokenScope[]>(['read']);
  const [error, setError] = useState<string | null>(null);
  const [secret, setSecret] = useState<{ token: string; name: string } | null>(null);

  const invalidate = () => void qc.invalidateQueries({ queryKey: ['api-tokens'] });

  const create = useMutation({
    mutationFn: () =>
      apiFetch<ApiTokenSecretView>('/tokens', {
        method: 'POST',
        body: JSON.stringify({ name, scopes }),
      }),
    onSuccess: (t) => {
      invalidate();
      setShowForm(false);
      setName('');
      setScopes(['read']);
      setSecret({ token: t.token, name: t.name });
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Failed to create'),
  });

  function toggleScope(s: TokenScope) {
    setScopes((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (scopes.length === 0) {
      setError('Pick at least one scope');
      return;
    }
    create.mutate();
  }

  return (
    <div className="mx-auto max-w-3xl p-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">API tokens</h1>
          <p className="text-sm text-slate-500">Scoped, rotatable tokens for programmatic access.</p>
        </div>
        <Button onClick={() => setShowForm((s) => !s)}>
          <Plus className="h-4 w-4" />
          New token
        </Button>
      </div>

      {secret && <SecretReveal name={secret.name} token={secret.token} onClose={() => setSecret(null)} />}

      {showForm && (
        <Card className="mb-6 p-6">
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="tok-name">Name</Label>
              <Input id="tok-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="CI deploy bot" required />
            </div>
            <div className="space-y-1.5">
              <Label>Scopes</Label>
              <div className="flex gap-2">
                {SCOPES.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => toggleScope(s)}
                    className={
                      'rounded-full border px-3 py-1 text-sm capitalize ' +
                      (scopes.includes(s)
                        ? 'border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900'
                        : 'border-slate-300 text-slate-600 dark:border-slate-700 dark:text-slate-400')
                    }
                  >
                    {s}
                  </button>
                ))}
              </div>
              <p className="text-xs text-slate-400">admin implies write implies read.</p>
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? 'Creating…' : 'Create token'}
            </Button>
          </form>
        </Card>
      )}

      <div className="space-y-2">
        {tokens && tokens.length > 0 ? (
          tokens.map((t) => <TokenRow key={t.id} token={t} onChange={invalidate} onRotated={setSecret} />)
        ) : (
          <Card className="py-12 text-center text-slate-500">No API tokens yet.</Card>
        )}
      </div>
    </div>
  );
}

function SecretReveal({ name, token, onClose }: { name: string; token: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <Card className="mb-6 border-emerald-300 bg-emerald-50 p-5 dark:border-emerald-800 dark:bg-emerald-950/30">
      <div className="text-sm font-medium text-emerald-800 dark:text-emerald-300">
        Token “{name}” created — copy it now, it won’t be shown again.
      </div>
      <div className="mt-3 flex items-center gap-2">
        <code className="flex-1 truncate rounded bg-white px-3 py-2 font-mono text-sm dark:bg-slate-900">{token}</code>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            void navigator.clipboard.writeText(token).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            });
          }}
        >
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          {copied ? 'Copied' : 'Copy'}
        </Button>
        <Button variant="ghost" size="sm" onClick={onClose}>
          Done
        </Button>
      </div>
    </Card>
  );
}

function TokenRow({
  token,
  onChange,
  onRotated,
}: {
  token: ApiTokenView;
  onChange: () => void;
  onRotated: (s: { token: string; name: string }) => void;
}) {
  const rotate = useMutation({
    mutationFn: () => apiFetch<ApiTokenSecretView>(`/tokens/${token.id}/rotate`, { method: 'POST' }),
    onSuccess: (t) => {
      onChange();
      onRotated({ token: t.token, name: t.name });
    },
  });
  const revoke = useMutation({
    mutationFn: () => apiFetch(`/tokens/${token.id}`, { method: 'DELETE' }),
    onSuccess: onChange,
  });

  const revoked = token.revokedAt !== null;

  return (
    <Card className="flex items-center justify-between p-5">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="truncate font-medium">{token.name}</span>
          {token.scopes.map((s) => (
            <Badge key={s} className="capitalize">
              {s}
            </Badge>
          ))}
          {revoked && (
            <Badge className="border-red-300 text-red-600 dark:border-red-800 dark:text-red-400">Revoked</Badge>
          )}
        </div>
        <div className="mt-1 font-mono text-xs text-slate-500">
          {token.prefix}… · last used {fmt(token.lastUsedAt)}
          {token.expiresAt ? ` · expires ${fmt(token.expiresAt)}` : ''}
        </div>
      </div>
      {!revoked && (
        <div className="flex shrink-0 items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => rotate.mutate()} disabled={rotate.isPending}>
            <RotateCw className="h-4 w-4" />
            Rotate
          </Button>
          <Button variant="ghost" size="sm" onClick={() => revoke.mutate()} disabled={revoke.isPending}>
            <Trash2 className="h-4 w-4 text-red-600" />
          </Button>
        </div>
      )}
    </Card>
  );
}
