import type { IssueRow, BugStatus, Severity } from '../types/bug';

export function deriveStatus(issue: IssueRow): BugStatus {
  if (issue.state === 'closed') return 'Closed';
  // A bug with an open PR is actively being worked on.
  if (issue.hasOpenPr) return 'In Progress';
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

// Milestones are typically named like "Sprint 1: Jun 8 - Jun 21, 2026".
// Show just the leading label (e.g. "Sprint 1") in the table; the full title
// is available via the tooltip / link.
export function sprintLabel(title: string): string {
  const trimmed = title.trim();
  const colon = trimmed.indexOf(':');
  return colon > 0 ? trimmed.slice(0, colon).trim() : trimmed;
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
