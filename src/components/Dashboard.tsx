import React from 'react';
import { Bug, LogOut, Upload, Lock, Search, RotateCcw, Ban } from 'lucide-react';
import { deriveStatus, deriveSeverity, timeAgo } from '../utils/bugs';
import { PROJECTS } from '../projects';
import { STATUS_TABS, type BugStatus, type IssueRow } from '../types/bug';
import type { ProjectId } from '../projects';

type FormResult = { ok: boolean; message: string; url?: string };

export function Dashboard({
  projectId,
  testerName,
  onLogout,
}: {
  projectId: ProjectId;
  testerName: string;
  onLogout: () => void;
}) {
  const project = projectId;
  const [title, setTitle] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [steps, setSteps] = React.useState('');
  const [severity, setSeverity] = React.useState('');
  const [bugType, setBugType] = React.useState('');
  const [priority, setPriority] = React.useState('Medium');
  const [device, setDevice] = React.useState('');
  const [platform, setPlatform] = React.useState('');
  const [autoCreate] = React.useState(true);
  const [submitting, setSubmitting] = React.useState(false);
  const [result, setResult] = React.useState<FormResult | null>(null);
  const [bugs, setBugs] = React.useState<IssueRow[]>([]);
  const [bugsLoading, setBugsLoading] = React.useState(false);
  const [bugsError, setBugsError] = React.useState<string | null>(null);
  const [activeTab, setActiveTab] = React.useState<'All' | BugStatus>('All');
  const [query, setQuery] = React.useState('');
  const [actingNumber, setActingNumber] = React.useState<number | null>(null);
  const [actionError, setActionError] = React.useState<string | null>(null);
  const [attachmentName, setAttachmentName] = React.useState('');
  const [attachmentPreview, setAttachmentPreview] = React.useState('');
  const [attachmentContent, setAttachmentContent] = React.useState('');
  const fileInputRef = React.useRef<HTMLInputElement>(null);

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
        body: JSON.stringify({
          project,
          tester: testerName,
          title,
          description,
          steps,
          severity,
          type: bugType,
          priority,
          device,
          platform,
          attachmentName: attachmentName || undefined,
          attachmentContent: attachmentContent || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setResult({ ok: false, message: data.error || `Request failed (${res.status}).` });
      } else {
        setResult({
          ok: true,
          message: `Bug filed in ${data.repository} as issue #${data.number}.${
            data.attachmentWarning ? ` Attachment note: ${data.attachmentWarning}` : ''
          }`,
          url: data.url,
        });
        setTitle('');
        setDescription('');
        setSteps('');
        clearAttachment();
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

  async function updateBug(number: number, action: 'close-mistake' | 'reopen') {
    setActionError(null);
    setActingNumber(number);
    try {
      const res = await fetch('/api/bugs', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project, number, action }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setActionError(data.error || `Request failed (${res.status}).`);
      } else {
        await loadBugs(project);
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Network error \u2014 is the server running?');
    } finally {
      setActingNumber(null);
    }
  }

  function onPickFile(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setResult({ ok: false, message: 'Attachment must be an image.' });
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setResult({ ok: false, message: 'Attachment is too large (max 10MB).' });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      setAttachmentName(file.name);
      setAttachmentPreview(dataUrl);
      setAttachmentContent(dataUrl.includes(',') ? dataUrl.split(',')[1] : '');
    };
    reader.readAsDataURL(file);
  }

  function clearAttachment() {
    setAttachmentName('');
    setAttachmentPreview('');
    setAttachmentContent('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  const projectInfo = PROJECTS[projectId as keyof typeof PROJECTS];

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <div className="logo">
            <Bug size={23} />
          </div>
          <span>XIIA::BugTracker</span>
        </div>
        <div className="session">
          <div className="who">
            <span>{testerName || 'Tester'}</span>
            <small>{projectInfo?.name ?? projectId}</small>
          </div>
          <button type="button" className="logout" onClick={onLogout}>
            <LogOut size={16} /> Logout
          </button>
        </div>
      </header>

      <main className="container">
        <section className="panel create-panel">
          <h1>Create New Bug</h1>
          <p>Report a bug and auto-create a GitHub issue in the selected repository.</p>

          <div className="grid two">
            <label>
              Project / Repository
              <div className="locked-field" title="You are logged in to this project">
                <span>
                  {projectInfo?.name ?? projectId} — {projectInfo?.repo ?? ''}
                </span>
                <Lock size={15} />
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

          <div className="grid two">
            <label>
              Device
              <select value={device} onChange={(e) => setDevice(e.target.value)}>
                <option value="">Select device</option>
                <option value="Mac">Mac</option>
                <option value="Windows">Windows</option>
                <option value="Android">Android</option>
                <option value="iOS">iOS</option>
                <option value="Web">Web</option>
              </select>
            </label>
            <label>
              Platform
              <select value={platform} onChange={(e) => setPlatform(e.target.value)}>
                <option value="">Select platform</option>
                <option value="Web">Web</option>
                <option value="Mobile">Mobile</option>
                <option value="Admin">Admin</option>
              </select>
            </label>
          </div>

          <label>
            Attachments
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="file-input-hidden"
              onChange={(e) => onPickFile(e.target.files?.[0])}
            />
            {attachmentPreview ? (
              <div className="upload has-file">
                <img src={attachmentPreview} alt={attachmentName} className="attach-preview" />
                <div className="attach-meta">
                  <span>{attachmentName}</span>
                  <div className="attach-actions">
                    <button type="button" onClick={() => fileInputRef.current?.click()}>
                      Replace
                    </button>
                    <button type="button" onClick={clearAttachment}>
                      Remove
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div
                className="upload"
                role="button"
                tabIndex={0}
                onClick={() => fileInputRef.current?.click()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click();
                }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  onPickFile(e.dataTransfer.files?.[0]);
                }}
              >
                <Upload size={16} /> Drag & drop files or click to upload
                <br />
                <small>Screenshots, logs, images (Max 10MB)</small>
              </div>
            )}
          </label>

          <div className="submit-row">
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
            <div className="bugs-search">
              <Search size={16} />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search bugs…"
                aria-label="Search bugs"
              />
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
          {actionError && <div className="form-msg err bugs-msg">{actionError}</div>}
          <table>
            <thead>
              <tr>
                <th>Bug ID</th>
                <th>Title</th>
                <th>Assignee</th>
                <th>PR</th>
                <th>Severity</th>
                <th>Status</th>
                <th>Updated</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {!projectId ? (
                <tr>
                  <td className="bugs-note" colSpan={8}>
                    Select a project to view its issues.
                  </td>
                </tr>
              ) : bugsLoading ? (
                <tr>
                  <td className="bugs-note" colSpan={8}>
                    Loading issues…
                  </td>
                </tr>
              ) : bugsError ? (
                <tr>
                  <td className="bugs-note err" colSpan={8}>
                    {bugsError}
                  </td>
                </tr>
              ) : (
                (() => {
                  const q = query.trim().toLowerCase();
                  const byTab = activeTab === 'All' ? bugs : bugs.filter((b) => deriveStatus(b) === activeTab);
                  const rows = q
                    ? byTab.filter(
                        (b) =>
                          b.title.toLowerCase().includes(q) ||
                          String(b.number).includes(q) ||
                          (b.assignee ? b.assignee.toLowerCase().includes(q) : false),
                      )
                    : byTab;
                  if (rows.length === 0) {
                    return (
                      <tr>
                        <td className="bugs-note" colSpan={8}>
                          No issues found.
                        </td>
                      </tr>
                    );
                  }
                  return rows.map((b) => {
                    const status = deriveStatus(b);
                    const sev = deriveSeverity(b);
                    const busy = actingNumber === b.number;
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
                        <td data-label="Assignee">
                          {b.assignee ? b.assignee : <span className="muted">—</span>}
                        </td>
                        <td data-label="PR">
                          {b.pr ? (
                            <a href={b.prUrl} target="_blank" rel="noreferrer">
                              #{b.pr}
                            </a>
                          ) : (
                            <span className="muted">—</span>
                          )}
                        </td>
                        <td data-label="Severity">
                          {sev ? <span className={`pill ${sev.toLowerCase()}`}>{sev}</span> : <span className="muted">—</span>}
                        </td>
                        <td data-label="Status">
                          <span className="status">{status}</span>
                        </td>
                        <td data-label="Updated">{timeAgo(b.updatedAt)}</td>
                        <td className="row-actions">
                          {status === 'Closed' ? (
                            <button
                              type="button"
                              className="row-btn reopen"
                              disabled={busy}
                              onClick={() => updateBug(b.number, 'reopen')}
                            >
                              <RotateCcw size={14} /> {busy ? '…' : 'Reopen'}
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="row-btn danger"
                              disabled={busy}
                              onClick={() => updateBug(b.number, 'close-mistake')}
                            >
                              <Ban size={14} /> {busy ? '…' : 'Close (mistake)'}
                            </button>
                          )}
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
