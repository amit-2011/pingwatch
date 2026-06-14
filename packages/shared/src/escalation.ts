/**
 * Escalation policy DTOs (PLAN §4.3 / P4.3). An org defines ONE active ordered chain; each step
 * fires its channels once `(now - incident.startedAt) >= delayMinutes` while the incident is still
 * open and unacknowledged. Acknowledging (or resolving) the incident halts the chain.
 */
import { z } from 'zod';
import { MAX_ESCALATION_STEPS } from './constants';

export const escalationStepSchema = z.object({
  /** 1-based position in the chain; must be strictly increasing across the steps array. */
  stepOrder: z.number().int().min(1),
  /** Minutes after the incident opened at which this step pages (cumulative from startedAt). */
  delayMinutes: z.number().int().min(0).max(1440),
  /** NotificationChannel ids to page at this step. */
  channelIds: z.array(z.string().min(1)).min(1),
});
export type EscalationStepInput = z.infer<typeof escalationStepSchema>;

export const createEscalationPolicySchema = z
  .object({
    name: z.string().min(1).max(120),
    isActive: z.boolean().default(true),
    steps: z.array(escalationStepSchema).min(1).max(MAX_ESCALATION_STEPS),
  })
  .refine((p) => p.steps.every((s, i) => i === 0 || s.stepOrder > (p.steps[i - 1]?.stepOrder ?? -1)), {
    message: 'steps must have strictly increasing stepOrder',
    path: ['steps'],
  });
export type CreateEscalationPolicyInput = z.infer<typeof createEscalationPolicySchema>;

export const updateEscalationPolicySchema = z
  .object({
    name: z.string().min(1).max(120).optional(),
    isActive: z.boolean().optional(),
    steps: z.array(escalationStepSchema).min(1).max(MAX_ESCALATION_STEPS).optional(),
  })
  .refine(
    (p) => p.steps === undefined || p.steps.every((s, i) => i === 0 || s.stepOrder > (p.steps?.[i - 1]?.stepOrder ?? -1)),
    { message: 'steps must have strictly increasing stepOrder', path: ['steps'] },
  );
export type UpdateEscalationPolicyInput = z.infer<typeof updateEscalationPolicySchema>;

export interface EscalationStepView {
  stepOrder: number;
  delayMinutes: number;
  channelIds: string[];
}

export interface EscalationPolicyView {
  id: string;
  name: string;
  isActive: boolean;
  steps: EscalationStepView[];
}
