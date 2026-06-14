'use client';

import { useTheme } from 'next-themes';
import { useAuth } from '@/lib/auth';
import { Button, Card } from '@/components/ui';

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
