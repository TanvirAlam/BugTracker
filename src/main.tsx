import React from 'react';
import { createRoot } from 'react-dom/client';
import {
  Bell,
  Bug,
  CheckCircle2,
  ChevronDown,
  Filter,
  GitPullRequest,
  HelpCircle,
  MoreVertical,
  Search,
  Upload,
  Clock3,
  AlertCircle,
} from 'lucide-react';
import './styles.css';
import { PROJECTS, type ProjectId } from './projects';

type BugStatus = 'Open' | 'In Progress' | 'Review' | 'Closed';
type Severity = 'High' | 'Medium' | 'Low';

// A GitHub issue as returned by GET /api/bugs?project=<id>.
type IssueRow = {
  number: number;
  title: string;
  state: string; // 'open' | 'closed'
  labels: string[];
  url: string;
  updatedAt: string;
};

const STATUS_TABS: BugStatus[] = ['Open', 'In Progress', 'Review', 'Closed'];

function deriveStatus(issue: IssueRow): BugStatus {
  if (issue.state === 'closed') return 'Closed';
  const labels = issue.labels.map((l) => l.toLowerCase());
  if (labels.some((l) => l.includes('in progress'))) return 'In Progress';
  if (labels.some((l) => l.includes('review'))) return 'Review';
  return 'Open';
}

function deriveSeverity(issue: IssueRow): Severity | null {
  const labels = issue.labels.map((l) => l.toLowerCase());
  if (labels.some((l) => l === 'severity:high' || l === 'high')) return 'High';
  if (labels.some((l) => l === 'severity:medium' || l === 'medium')) return 'Medium';
  if (labels.some((l) => l === 'severity:low' || l === 'low')) return 'Low';
  return null;
}

function timeAgo(iso: string): string {
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

type FormResult = { ok: boolean; message: string; url?: string };

function App() {
  const [project, setProject] = React.useState('');
  const [environment, setEnvironment] = React.useState<'Stage' | 'Live'>('Stage');
  const [title, setTitle] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [steps, setSteps] = React.useState('');
  const [severity, setSeverity] = React.useState('');
  const [bugType, setBugType] = React.useState('');
  const [priority, setPriority] = React.useState('Medium');
  const [autoCreate, setAutoCreate] = React.useState(true);
  const [submitting, setSubmitting] = React.useState(false);
  const [result, setResult] = React.useState<FormResult | null>(null);
  const [bugs, setBugs] = React.useState<IssueRow[]>([]);
  const [bugsLoading, setBugsLoading] = React.useState(false);
  const [bugsError, setBugsError] = React.useState<string | null>(null);
  const [activeTab, setActiveTab] = React.useState<'All' | BugStatus>('All');

  const loadBugs = React.useCallback(async (projectId: string) => {
    if (!projectId) {
      setBugs([]);
      setBugsError(null);
      setBugsLoading(false);
      return;
    }
    setBugsLoading(true);
    setBugsError(null);
    try {
      const res = await fetch(`/api/bugs?project=${encodeURIComponent(projectId)}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Failed to load issues (${res.status}).`);
      setBugs(Array.isArray(data.issues) ? data.issues : []);
    } catch (err) {
      setBugs([]);
      setBugsError(err instanceof Error ? err.message : 'Failed to load issues.');
    } finally {
      setBugsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    loadBugs(project);
  }, [project, loadBugs]);

  async function createBug() {
    setResult(null);
    if (!project) {
      setResult({ ok: false, message: 'Please select a project / repository.' });
      return;
    }
    if (!title.trim()) {
      setResult({ ok: false, message: 'Please enter a bug title.' });
      return;
    }
    if (!autoCreate) {
      setResult({
        ok: false,
        message:
          'No database is configured \u2014 enable \u201CAuto-create GitHub issue\u201D to save this bug.',
      });
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/bugs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project, environment, title, description, steps, severity, type: bugType, priority }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setResult({ ok: false, message: data.error || `Request failed (${res.status}).` });
      } else {
        setResult({
          ok: true,
          message: `Bug filed in ${data.repository} as issue #${data.number}.`,
          url: data.url,
        });
        setTitle('');
        setDescription('');
        setSteps('');
        loadBugs(project);
      }
    } catch (err) {
      setResult({
        ok: false,
        message: err instanceof Error ? err.message : 'Network error \u2014 is the server running?',
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <div className="logo">
            <Bug size={23} />
          </div>
          <span>XIIA::BugTracker</span>
        </div>
      </header>

      <main className="container">
        <section className="panel create-panel">
          <h1>Create New Bug</h1>
          <p>Report a bug and auto-create a GitHub issue in the selected repository.</p>

          <div className="grid two">
            <label>
              Project / Repository *
              <select value={project} onChange={(e) => setProject(e.target.value)}>
                <option value="">Select repository</option>
                {Object.entries(PROJECTS).map(([id, p]) => (
                  <option key={id} value={id}>
                    {p.name} — {p.repo}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Environment *
              <div className="segmented">
                <button
                  type="button"
                  className={environment === 'Stage' ? 'active' : ''}
                  onClick={() => setEnvironment('Stage')}
                >
                  Stage
                </button>
                <button
                  type="button"
                  className={environment === 'Live' ? 'active' : ''}
                  onClick={() => setEnvironment('Live')}
                >
                  Live
                </button>
              </div>
            </label>
          </div>

          <label>
            Bug Title *
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Short and descriptive title" />
          </label>
          <label>
            Bug Description *
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe the bug in detail. What happened?"
            />
          </label>
          <label>
            Steps to Reproduce
            <textarea
              value={steps}
              onChange={(e) => setSteps(e.target.value)}
              placeholder={'1. Go to...\n2. Click...\n3. See error...'}
            />
          </label>

          <div className="grid three">
            <label>
              Bug Severity *
              <select value={severity} onChange={(e) => setSeverity(e.target.value)}>
                <option value="">🔴 Select severity</option>
                <option value="High">High</option>
                <option value="Medium">Medium</option>
                <option value="Low">Low</option>
              </select>
            </label>
            <label>
              Bug Type *
              <select value={bugType} onChange={(e) => setBugType(e.target.value)}>
                <option value="">🟢 Select type</option>
                <option value="Technical">Technical</option>
                <option value="UI/UX">UI/UX</option>
                <option value="Data">Data</option>
                <option value="Payment">Payment</option>
              </select>
            </label>
            <label>
              Priority
              <select value={priority} onChange={(e) => setPriority(e.target.value)}>
                <option value="Medium">🟡 Medium</option>
                <option value="High">High</option>
                <option value="Low">Low</option>
              </select>
            </label>
          </div>

          <label>
            Attachments
            <div className="upload">
              <Upload size={16} /> Drag & drop files or click to upload
              <br />
              <small>Screenshots, logs, videos (Max 10MB)</small>
            </div>
          </label>

          <div className="submit-row">
            <label className="check">
              <input type="checkbox" checked={autoCreate} onChange={(e) => setAutoCreate(e.target.checked)} />
              Auto-create GitHub issue <GitPullRequest size={16} />
            </label>
            <button type="button" className="primary" onClick={createBug} disabled={submitting}>
              {submitting ? 'Creating…' : 'Create Bug'}
            </button>
          </div>
          {result && (
            <div className={`form-msg ${result.ok ? 'ok' : 'err'}`}>
              {result.message}
              {result.ok && result.url ? (
                <a href={result.url} target="_blank" rel="noreferrer">
                  View issue ↗
                </a>
              ) : null}
            </div>
          )}
        </section>

        <section className="panel bugs-panel">
          <div className="panel-head">
            <h2>My Bugs</h2>
            <div>
              <a>View All</a>
              <button className="filter">
                <Filter size={16} /> Filters
              </button>
            </div>
          </div>
          <div className="tabs">
            {(['All', ...STATUS_TABS] as const).map((tab) => {
              const count = tab === 'All' ? bugs.length : bugs.filter((b) => deriveStatus(b) === tab).length;
              return (
                <span key={tab} className={activeTab === tab ? 'selected' : ''} onClick={() => setActiveTab(tab)}>
                  {tab} <b>{count}</b>
                </span>
              );
            })}
          </div>
          <table>
            <thead>
              <tr>
                <th>Bug ID</th>
                <th>Title</th>
                <th>Repository</th>
                <th>Severity</th>
                <th>Status</th>
                <th>Updated</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {!project ? (
                <tr>
                  <td className="bugs-note" colSpan={7}>
                    Select a project to view its issues.
                  </td>
                </tr>
              ) : bugsLoading ? (
                <tr>
                  <td className="bugs-note" colSpan={7}>
                    Loading issues…
                  </td>
                </tr>
              ) : bugsError ? (
                <tr>
                  <td className="bugs-note err" colSpan={7}>
                    {bugsError}
                  </td>
                </tr>
              ) : (
                (() => {
                  const rows = activeTab === 'All' ? bugs : bugs.filter((b) => deriveStatus(b) === activeTab);
                  if (rows.length === 0) {
                    return (
                      <tr>
                        <td className="bugs-note" colSpan={7}>
                          No issues found.
                        </td>
                      </tr>
                    );
                  }
                  return rows.map((b) => {
                    const status = deriveStatus(b);
                    const sev = deriveSeverity(b);
                    const env = b.labels.map((l) => l.toLowerCase()).find((l) => l === 'stage' || l === 'live');
                    return (
                      <tr key={b.number}>
                        <td className="bug-id" data-label="Bug ID">
                          #{b.number}
                        </td>
                        <td className="bug-title" data-label="Title">
                          <strong>
                            <a href={b.url} target="_blank" rel="noreferrer">
                              {b.title}
                            </a>
                          </strong>
                        </td>
                        <td data-label="Repository">
                          <span className="repo-cell">
                            {PROJECTS[project as ProjectId]?.name ?? project}
                            <small>{env ?? '—'}</small>
                          </span>
                        </td>
                        <td data-label="Severity">
                          {sev ? <span className={`pill ${sev.toLowerCase()}`}>{sev}</span> : <span className="muted">—</span>}
                        </td>
                        <td data-label="Status">
                          <span className="status">{status}</span>
                        </td>
                        <td data-label="Updated">{timeAgo(b.updatedAt)}</td>
                        <td className="row-actions">
                          <a href={b.url} target="_blank" rel="noreferrer" aria-label="Open issue">
                            <MoreVertical size={17} />
                          </a>
                        </td>
                      </tr>
                    );
                  });
                })()
              )}
            </tbody>
          </table>
        </section>
      </main>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
