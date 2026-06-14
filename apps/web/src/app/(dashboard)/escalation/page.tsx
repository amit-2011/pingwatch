'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, X } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import {
  ApiError,
  type ChannelView,
  type EscalationPolicyView,
  apiFetch,
} from '@/lib/api';
import { Badge, Button, Card, Input, Label } from '@/components/ui';

interface DraftStep {
  delayMinutes: string;
  channelIds: string[];
}

export default function EscalationPage() {
  const qc = useQueryClient();
  const { data: policies } = useQuery({
    queryKey: ['escalation-policies'],
    queryFn: () => apiFetch<EscalationPolicyView[]>('/escalation-policies'),
  });
  const { data: channels } = useQuery({
    queryKey: ['channels'],
    queryFn: () => apiFetch<ChannelView[]>('/channels'),
  });

  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [steps, setSteps] = useState<DraftStep[]>([{ delayMinutes: '5', channelIds: [] }]);
  const [error, setError] = useState<string | null>(null);

  const channelName = (id: string) => channels?.find((c) => c.id === id)?.name ?? id;
  const invalidate = () => void qc.invalidateQueries({ queryKey: ['escalation-policies'] });

  const create = useMutation({
    mutationFn: () =>
      apiFetch<EscalationPolicyView>('/escalation-policies', {
        method: 'POST',
        body: JSON.stringify({
          name,
          steps: steps.map((s, i) => ({
            stepOrder: i + 1,
            delayMinutes: Number(s.delayMinutes),
            channelIds: s.channelIds,
          })),
        }),
      }),
    onSuccess: () => {
      invalidate();
      setShowForm(false);
      setName('');
      setSteps([{ delayMinutes: '5', channelIds: [] }]);
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Failed to save'),
  });

  function setStep(i: number, patch: Partial<DraftStep>) {
    setSteps((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  }
  function toggleChannel(i: number, id: string) {
    setSteps((prev) =>
      prev.map((s, idx) =>
        idx === i
          ? { ...s, channelIds: s.channelIds.includes(id) ? s.channelIds.filter((x) => x !== id) : [...s.channelIds, id] }
          : s,
      ),
    );
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (steps.some((s) => s.channelIds.length === 0)) {
      setError('Every step needs at least one channel');
      return;
    }
    create.mutate();
  }

  return (
    <div className="mx-auto max-w-3xl p-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Escalation</h1>
          <p className="text-sm text-slate-500">
            Page the next responder when an incident stays unacknowledged. One active policy per org.
          </p>
        </div>
        <Button onClick={() => setShowForm((s) => !s)}>
          <Plus className="h-4 w-4" />
          New policy
        </Button>
      </div>

      {showForm && (
        <Card className="mb-6 p-6">
          <form onSubmit={onSubmit} className="space-y-5">
            <div className="space-y-1.5">
              <Label htmlFor="ep-name">Policy name</Label>
              <Input id="ep-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="On-call rotation" required />
            </div>

            <div className="space-y-3">
              <Label>Steps (fire in order, measured from when the incident opened)</Label>
              {steps.map((step, i) => (
                <div key={i} className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-sm font-medium">Step {i + 1}</span>
                    {steps.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setSteps((prev) => prev.filter((_, idx) => idx !== i))}
                        className="text-slate-400 hover:text-red-600"
                        aria-label={`Remove step ${i + 1}`}
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-slate-500">After</span>
                    <Input
                      type="number"
                      min={0}
                      max={1440}
                      value={step.delayMinutes}
                      onChange={(e) => setStep(i, { delayMinutes: e.target.value })}
                      className="h-8 w-20"
                      aria-label={`Step ${i + 1} delay minutes`}
                    />
                    <span className="text-slate-500">min unacknowledged, page:</span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {channels && channels.length > 0 ? (
                      channels.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => toggleChannel(i, c.id)}
                          className={
                            'rounded-full border px-3 py-1 text-xs ' +
                            (step.channelIds.includes(c.id)
                              ? 'border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900'
                              : 'border-slate-300 text-slate-600 dark:border-slate-700 dark:text-slate-400')
                          }
                        >
                          {c.name}
                        </button>
                      ))
                    ) : (
                      <span className="text-xs text-slate-500">No channels — add one under Notifications first.</span>
                    )}
                  </div>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setSteps((prev) => [...prev, { delayMinutes: '15', channelIds: [] }])}
              >
                <Plus className="h-4 w-4" />
                Add step
              </Button>
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? 'Saving…' : 'Create policy'}
            </Button>
          </form>
        </Card>
      )}

      <div className="space-y-2">
        {policies && policies.length > 0 ? (
          policies.map((p) => <PolicyRow key={p.id} policy={p} channelName={channelName} onChange={invalidate} />)
        ) : (
          <Card className="py-12 text-center text-slate-500">No escalation policies yet.</Card>
        )}
      </div>
    </div>
  );
}

function PolicyRow({
  policy,
  channelName,
  onChange,
}: {
  policy: EscalationPolicyView;
  channelName: (id: string) => string;
  onChange: () => void;
}) {
  const remove = useMutation({
    mutationFn: () => apiFetch(`/escalation-policies/${policy.id}`, { method: 'DELETE' }),
    onSuccess: onChange,
  });

  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate font-medium">{policy.name}</span>
            <Badge
              className={
                policy.isActive
                  ? 'border-emerald-300 text-emerald-600 dark:border-emerald-800 dark:text-emerald-400'
                  : ''
              }
            >
              {policy.isActive ? 'Active' : 'Inactive'}
            </Badge>
          </div>
          <ol className="mt-3 space-y-1.5">
            {policy.steps.map((s) => (
              <li key={s.stepOrder} className="text-sm text-slate-600 dark:text-slate-300">
                <span className="font-medium">Step {s.stepOrder}</span> · after {s.delayMinutes} min →{' '}
                {s.channelIds.map(channelName).join(', ')}
              </li>
            ))}
          </ol>
        </div>
        <Button variant="ghost" size="sm" onClick={() => remove.mutate()} disabled={remove.isPending}>
          <Trash2 className="h-4 w-4 text-red-600" />
        </Button>
      </div>
    </Card>
  );
}
