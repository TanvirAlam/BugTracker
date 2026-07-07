import type { ProjectId } from '../projects';
import { PROJECTS } from '../projects';

export type BugStatus = 'Open' | 'In Progress' | 'Closed';
export type Severity = 'High' | 'Medium' | 'Low';

export type IssueRow = {
  number: number;
  title: string;
  state: string;
  labels: string[];
  url: string;
  updatedAt: string;
  assignee: string | null;
  pr: number | null;
  prUrl?: string;
  prDraft?: boolean;
  hasOpenPr?: boolean;
  milestone?: { title: string; url?: string } | null;
};

// A single entry in an issue's activity history (the original report, a
// comment, or a state/label event) used to power the expandable row view.
export type TimelineItem = {
  id: string | number;
  kind: string; // GitHub event name, e.g. 'commented' | 'labeled' | 'closed'
  actor: string | null;
  createdAt: string;
  body?: string;
  label?: string;
  from?: string;
  to?: string;
  assignee?: string;
  source?: { number: number; url: string; isPr: boolean } | null;
};

export type IssueDetail = {
  number: number;
  body: string;
  author: string | null;
  createdAt: string;
  timeline: TimelineItem[];
};

export const STATUS_TABS: BugStatus[] = ['Open', 'In Progress', 'Closed'];

// Per-project tester passwords (client-side gate, consistent with the simple
// login this app already uses).
export const PROJECT_PASSWORDS: Record<ProjectId, string> = {
  foodime: 'XIIA.foodime.2026$',
  soundmade: 'XIIA.soundmade.2026$',
  wewaive: 'XIIA.wewaive.2026$',
  kiibee: 'XIIA.kiibee.2026$',
};
export const AUTH_STORAGE_KEY = 'bugtracker.tester.project';
export const TESTER_NAME_KEY = 'bugtracker.tester.name';

export function isProjectId(value: string | null): value is ProjectId {
  return value != null && Object.prototype.hasOwnProperty.call(PROJECTS, value);
}
