import React from 'react';
import { createRoot } from 'react-dom/client';
import { Bell, Bug, CheckCircle2, ChevronDown, Filter, GitPullRequest, HelpCircle, MoreVertical, Search, Upload, Clock3, AlertCircle } from 'lucide-react';
import './styles.css';
import { PROJECTS } from './projects';

type BugStatus = 'Open' | 'In Progress' | 'Review' | 'Closed';
type Severity = 'Low' | 'Medium' | 'High';

type BugRow = {
  id: string;
  title: string;
  repository: string;
  branch: string;
  severity: Severity;
  status: BugStatus;
  updated: string;
};

const bugRows: BugRow[] = [
  { id: 'BUG-125', title: 'Weather data not loading on home page', repository: 'Foodime', branch: 'stage', severity: 'High', status: 'Open', updated: '2h ago' },
  { id: 'BUG-124', title: 'Search functionality not working on mobile', repository: 'Soundmade', branch: 'develop', severity: 'Medium', status: 'In Progress', updated: '4h ago' },
  { id: 'BUG-123', title: 'Login redirect loop on stage environment', repository: 'WeWaive', branch: 'staging', severity: 'High', status: 'Open', updated: '6h ago' },
  { id: 'BUG-122', title: 'Add to cart button is not responsive', repository: 'Foodime', branch: 'main', severity: 'Medium', status: 'Review', updated: '1d ago' },
  { id: 'BUG-121', title: 'UI breaking on iOS Safari', repository: 'WeWaive', branch: 'main', severity: 'Low', status: 'Open', updated: '1d ago' },
];

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

  async function createBug() {
    setResult(null);
    if (!project) { setResult({ ok: false, message: 'Please select a project / repository.' }); return; }
    if (!title.trim()) { setResult({ ok: false, message: 'Please enter a bug title.' }); return; }
    if (!autoCreate) {
      setResult({ ok: false, message: 'No database is configured \u2014 enable \u201CAuto-create GitHub issue\u201D to save this bug.' });
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
        setResult({ ok: true, message: `Bug filed in ${data.repository} as issue #${data.number}.`, url: data.url });
        setTitle(''); setDescription(''); setSteps('');
      }
    } catch (err) {
      setResult({ ok: false, message: err instanceof Error ? err.message : 'Network error \u2014 is the server running?' });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand"><div className="logo"><Bug size={23} /></div><span>BugTracker</span></div>
        <div className="search"><Search size={18} /><input placeholder="Search bugs by title, ID, status, or repository..." /><kbd>⌘ K</kbd></div>
        <div className="actions"><div className="bell"><Bell size={20} /><span>3</span></div><HelpCircle size={20} /><div className="avatar">UR</div><div className="who"><strong>Urmi</strong><small>Tester</small></div><ChevronDown size={16} /></div>
      </header>

      <main className="container">
        <section className="panel create-panel">
          <h1>Create New Bug</h1>
          <p>Report a bug and auto-create a GitHub issue in the selected repository.</p>

          <div className="grid two">
            <label>Project / Repository *<select value={project} onChange={e => setProject(e.target.value)}><option value="">Select repository</option>{PROJECTS.map(p => <option key={p.id} value={p.id}>{p.name} — {p.owner}/{p.repo}</option>)}</select></label>
            <label>Environment *<div className="segmented"><button type="button" className={environment === 'Stage' ? 'active' : ''} onClick={() => setEnvironment('Stage')}>Stage</button><button type="button" className={environment === 'Live' ? 'active' : ''} onClick={() => setEnvironment('Live')}>Live</button></div></label>
          </div>

          <label>Bug Title *<input value={title} onChange={e => setTitle(e.target.value)} placeholder="Short and descriptive title" /></label>
          <label>Bug Description *<textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Describe the bug in detail. What happened?" /></label>
          <label>Steps to Reproduce<textarea value={steps} onChange={e => setSteps(e.target.value)} placeholder={'1. Go to...\n2. Click...\n3. See error...'} /></label>

          <div className="grid three">
            <label>Bug Severity *<select value={severity} onChange={e => setSeverity(e.target.value)}><option value="">🔴 Select severity</option><option value="High">High</option><option value="Medium">Medium</option><option value="Low">Low</option></select></label>
            <label>Bug Type *<select value={bugType} onChange={e => setBugType(e.target.value)}><option value="">🟢 Select type</option><option value="Technical">Technical</option><option value="UI/UX">UI/UX</option><option value="Data">Data</option><option value="Payment">Payment</option></select></label>
            <label>Priority<select value={priority} onChange={e => setPriority(e.target.value)}><option value="Medium">🟡 Medium</option><option value="High">High</option><option value="Low">Low</option></select></label>
          </div>

          <label>Attachments<div className="upload"><Upload size={16} /> Drag & drop files or click to upload<br /><small>Screenshots, logs, videos (Max 10MB)</small></div></label>

          <div className="submit-row"><label className="check"><input type="checkbox" checked={autoCreate} onChange={e => setAutoCreate(e.target.checked)} /> Auto-create GitHub issue <GitPullRequest size={16} /></label><button type="button" className="primary" onClick={createBug} disabled={submitting}>{submitting ? 'Creating…' : 'Create Bug'}</button></div>
          {result && <div className={`form-msg ${result.ok ? 'ok' : 'err'}`}>{result.message}{result.ok && result.url ? <a href={result.url} target="_blank" rel="noreferrer">View issue ↗</a> : null}</div>}
        </section>

        <section className="panel bugs-panel">
          <div className="panel-head"><h2>My Bugs</h2><div><a>View All</a><button className="filter"><Filter size={16} /> Filters</button></div></div>
          <div className="tabs"><span>All <b>25</b></span><span className="selected">Open <b>8</b></span><span>In Progress <b>3</b></span><span>Review <b>2</b></span><span>Closed <b>12</b></span></div>
          <table><thead><tr><th>Bug ID</th><th>Title</th><th>Repository</th><th>Severity</th><th>Status</th><th>Updated</th><th></th></tr></thead><tbody>{bugRows.map(b => <tr key={b.id}><td className="bug-id" data-label="Bug ID">{b.id}</td><td className="bug-title" data-label="Title"><strong>{b.title}</strong></td><td data-label="Repository"><span className="repo-cell">{b.repository}<small>{b.branch}</small></span></td><td data-label="Severity"><span className={`pill ${b.severity.toLowerCase()}`}>{b.severity}</span></td><td data-label="Status"><span className="status">{b.status}</span></td><td data-label="Updated">{b.updated}</td><td className="row-actions"><MoreVertical size={17} /></td></tr>)}</tbody></table>
        </section>

        <section className="stats">
          <Stat icon={<Bug />} label="Total Bugs" value="25" delta="↑ 12% from last week" />
          <Stat icon={<AlertCircle />} label="Open Bugs" value="8" delta="↓ 5% from last week" />
          <Stat icon={<Clock3 />} label="In Progress" value="3" delta="↑ 8% from last week" />
          <Stat icon={<CheckCircle2 />} label="Closed" value="12" delta="↑ 20% from last week" />
        </section>

        <section className="bottom-grid">
          <ChartCard title="Bugs by Repository" items={['Foodime 10 (40%)', 'Soundmade 7 (28%)', 'WeWaive 8 (32%)']} />
          <ChartCard title="Bugs by Severity" items={['High 9 (36%)', 'Medium 10 (40%)', 'Low 6 (24%)']} />
          <div className="panel activity"><h3>Recent Activity</h3><p><b>UR</b> Urmi created BUG-125 in Foodime <span>2h ago</span></p><p><b>MS</b> Muksana moved BUG-123 to In Progress <span>4h ago</span></p><p><b>UR</b> Urmi closed BUG-120 <span>1d ago</span></p></div>
        </section>
      </main>
    </div>
  );
}

function Stat({ icon, label, value, delta }: { icon: React.ReactNode; label: string; value: string; delta: string }) { return <div className="panel stat"><div className="stat-icon">{icon}</div><div><span>{label}</span><strong>{value}</strong><small>{delta}</small></div></div>; }
function ChartCard({ title, items }: { title: string; items: string[] }) { return <div className="panel chart"><h3>{title}</h3><div className="donut" /><ul>{items.map(i => <li key={i}>{i}</li>)}</ul></div>; }

createRoot(document.getElementById('root')!).render(<App />);
