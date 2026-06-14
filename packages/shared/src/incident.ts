/**
 * Incident DTOs (PLAN §4.3 / P3.6). Incidents are opened/resolved automatically by the engine; this
 * contract covers the human workflow on top — comments, acknowledge, manual resolve, and publishing
 * a curated subset to the public status page. The public projection never exposes the raw cause.
 */
import { z } from 'zod';
import { INCIDENT_SEVERITY } from './constants';
import type { IncidentSeverity, IncidentStatus } from './constants';

export const postIncidentCommentSchema = z.object({
  message: z.string().min(1).max(2000),
});
export type PostIncidentCommentInput = z.infer<typeof postIncidentCommentSchema>;

export const updateIncidentSchema = z.object({
  severity: z.enum(INCIDENT_SEVERITY).optional(),
  isPublished: z.boolean().optional(),
});
export type UpdateIncidentInput = z.infer<typeof updateIncidentSchema>;

/** One entry in an incident's internal timeline (admin view). */
export interface IncidentUpdateView {
  id: string;
  kind: string;
  message: string | null;
  status: string | null;
  createdAt: string;
}

/** Full incident as the dashboard sees it. */
export interface IncidentView {
  id: string;
  monitorId: string;
  monitorName: string;
  status: IncidentStatus;
  severity: IncidentSeverity;
  title: string;
  cause: string | null;
  isPublished: boolean;
  startedAt: string;
  acknowledgedAt: string | null;
  resolvedAt: string | null;
  updates: IncidentUpdateView[];
}

/** A published incident as shown on a public status page — curated, never leaks the raw cause. */
export interface PublicIncident {
  title: string;
  severity: IncidentSeverity;
  status: IncidentStatus;
  startedAt: string;
  resolvedAt: string | null;
  updates: Array<{ message: string; createdAt: string }>;
}
