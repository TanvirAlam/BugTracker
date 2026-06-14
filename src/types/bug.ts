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
};

export const STATUS_TABS: BugStatus[] = ['Open', 'In Progress', 'Closed'];

export const TESTER_PASSWORD = 'XIIA.Tester.2026$';
export const AUTH_STORAGE_KEY = 'bugtracker.tester.project';
export const TESTER_NAME_KEY = 'bugtracker.tester.name';

export function isProjectId(value: string | null): value is ProjectId {
  return value != null && Object.prototype.hasOwnProperty.call(PROJECTS, value);
}
