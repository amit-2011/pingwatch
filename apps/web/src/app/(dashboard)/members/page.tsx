'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { ApiError, type Member, apiFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Button, Card, Input, Label } from '@/components/ui';

const ROLES = ['admin', 'member', 'viewer'] as const;
const SELECT_CLASS =
  'h-9 rounded-md border border-slate-300 bg-white px-2 text-sm dark:border-slate-700 dark:bg-slate-900';

export default function MembersPage() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const { data: members } = useQuery({ queryKey: ['members'], queryFn: () => apiFetch<Member[]>('/members') });

  const [showForm, setShowForm] = useState(false);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'admin' | 'member' | 'viewer'>('member');
  const [error, setError] = useState<string | null>(null);

  const add = useMutation({
    mutationFn: () =>
      apiFetch('/members', { method: 'POST', body: JSON.stringify({ email, name: name || undefined, password, role }) }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['members'] });
      setShowForm(false);
      setEmail('');
      setName('');
      setPassword('');
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Failed to add member'),
  });

  const setMemberRole = useMutation({
    mutationFn: ({ userId, role: r }: { userId: string; role: string }) =>
      apiFetch(`/members/${userId}`, { method: 'PATCH', body: JSON.stringify({ role: r }) }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['members'] }),
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Failed to change role'),
  });

  const remove = useMutation({
    mutationFn: (userId: string) => apiFetch(`/members/${userId}`, { method: 'DELETE' }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['members'] }),
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Failed to remove member'),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    add.mutate();
  }

  return (
    <div className="mx-auto max-w-3xl p-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Members</h1>
          <p className="text-sm text-slate-500">People with access to this organization.</p>
        </div>
        {isAdmin && (
          <Button onClick={() => setShowForm((s) => !s)}>
            <Plus className="h-4 w-4" />
            Add member
          </Button>
        )}
      </div>

      {showForm && isAdmin && (
        <Card className="mb-6 p-6">
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="mname">Name (optional)</Label>
                <Input id="mname" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="mpw">Initial password</Label>
                <Input id="mpw" type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="mrole">Role</Label>
                <select id="mrole" value={role} onChange={(e) => setRole(e.target.value as typeof role)} className={`${SELECT_CLASS} h-10 w-full`}>
                  {ROLES.map((r) => (
                    <option key={r} value={r} className="capitalize">
                      {r}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <Button type="submit" disabled={add.isPending}>
              {add.isPending ? 'Adding…' : 'Add member'}
            </Button>
          </form>
        </Card>
      )}

      {error && !showForm && <p className="mb-4 text-sm text-red-600">{error}</p>}

      <div className="space-y-2">
        {members?.map((m) => (
          <Card key={m.userId} className="flex items-center justify-between p-5">
            <div>
              <div className="font-medium">
                {m.name ?? m.email} {m.isSelf && <span className="text-xs text-slate-400">(you)</span>}
              </div>
              <div className="text-sm text-slate-500">{m.email}</div>
            </div>
            <div className="flex items-center gap-3">
              {isAdmin && !m.isSelf ? (
                <>
                  <select
                    aria-label={`Role for ${m.email}`}
                    value={m.role}
                    onChange={(e) => setMemberRole.mutate({ userId: m.userId, role: e.target.value })}
                    className={SELECT_CLASS}
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r} className="capitalize">
                        {r}
                      </option>
                    ))}
                  </select>
                  <Button
                    variant="danger"
                    size="sm"
                    aria-label={`Remove ${m.email}`}
                    onClick={() => {
                      if (window.confirm(`Remove ${m.email}?`)) remove.mutate(m.userId);
                    }}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </Button>
                </>
              ) : (
                <span className="text-sm capitalize text-slate-500">{m.role}</span>
              )}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
