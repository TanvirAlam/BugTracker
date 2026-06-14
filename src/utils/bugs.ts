import type { IssueRow, BugStatus, Severity } from '../types/bug';

export function deriveStatus(issue: IssueRow): BugStatus {
  if (issue.state === 'closed') return 'Closed';
  const labels = issue.labels.map((l) => l.toLowerCase());
  if (labels.some((l) => l.includes('in progress'))) return 'In Progress';
  return 'Open';
}

export function deriveSeverity(issue: IssueRow): Severity | null {
  const labels = issue.labels.map((l) => l.toLowerCase());
  if (labels.some((l) => l === 'severity:high' || l === 'high')) return 'High';
  if (labels.some((l) => l === 'severity:medium' || l === 'medium')) return 'Medium';
  if (labels.some((l) => l === 'severity:low' || l === 'low')) return 'Low';
  return null;
}

export function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const secs = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}
