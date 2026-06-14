'use client';

import { useMutation } from '@tanstack/react-query';
import { useTheme } from 'next-themes';
import { type FormEvent, useState } from 'react';
import { ApiError, apiFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Button, Card, Input, Label } from '@/components/ui';

function ChangePassword() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const mutation = useMutation({
    mutationFn: () =>
      apiFetch('/auth/change-password', { method: 'POST', body: JSON.stringify({ currentPassword: current, newPassword: next }) }),
    onSuccess: () => {
      setMsg({ ok: true, text: 'Password changed.' });
      setCurrent('');
      setNext('');
    },
    onError: (e) => setMsg({ ok: false, text: e instanceof ApiError ? e.message : 'Failed to change password' }),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setMsg(null);
    mutation.mutate();
  }

  return (
    <Card className="space-y-3 p-6">
      <h3 className="font-medium">Change password</h3>
      <form onSubmit={onSubmit} className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="cur">Current password</Label>
          <Input id="cur" type="password" value={current} onChange={(e) => setCurrent(e.target.value)} required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="new">New password</Label>
          <Input id="new" type="password" value={next} onChange={(e) => setNext(e.target.value)} minLength={8} required />
        </div>
        {msg && <p className={msg.ok ? 'text-sm text-emerald-600' : 'text-sm text-red-600'}>{msg.text}</p>}
        <Button type="submit" size="sm" disabled={mutation.isPending}>
          {mutation.isPending ? 'Saving…' : 'Update password'}
        </Button>
      </form>
    </Card>
  );
}

export default function SettingsPage() {
  const { theme, setTheme } = useTheme();
  const { user, logout } = useAuth();

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-8">
      <h1 className="text-2xl font-bold">Settings</h1>

      <Card className="space-y-3 p-6">
        <h3 className="font-medium">Account</h3>
        <div className="text-sm text-slate-500">
          Signed in as <span className="text-slate-700 dark:text-slate-300">{user?.email}</span> ({user?.role})
        </div>
        <Button variant="outline" size="sm" onClick={() => void logout()}>
          Sign out
        </Button>
      </Card>

      <ChangePassword />

      <Card className="space-y-3 p-6">
        <h3 className="font-medium">Appearance</h3>
        <div className="flex gap-2">
          {(['light', 'dark'] as const).map((t) => (
            <Button key={t} variant={theme === t ? 'default' : 'outline'} size="sm" className="capitalize" onClick={() => setTheme(t)}>
              {t}
            </Button>
          ))}
        </div>
      </Card>

      <Card className="p-6">
        <h3 className="mb-1 font-medium">About</h3>
        <p className="text-sm text-slate-500">
          PingWatch — self-hosted uptime &amp; system monitoring. Retention: raw heartbeats 7 days, hourly rollups 90 days.
        </p>
      </Card>
    </div>
  );
}
