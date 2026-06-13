import React from 'react';
import { createRoot } from 'react-dom/client';
import { Bell, Bug, CheckCircle2, ChevronDown, Filter, GitPullRequest, HelpCircle, MoreVertical, Search, Upload, Clock3, AlertCircle } from 'lucide-react';
import './styles.css';

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

const repositories = [
  { name: 'Foodime', repo: 'TanvirAlam/foodime', stack: 'Turborepo / React / Node' },
  { name: 'Soundmade', repo: 'soundmade-com/soundmade-v2', stack: 'Turborepo / Expo / GraphQL' },
  { name: 'WeWaive', repo: 'TanvirAlam/wewaive', stack: 'Turborepo / Expo / Admin / API' },
];

const bugRows: BugRow[] = [
  { id: 'BUG-125', title: 'Weather data not loading on home page', repository: 'Foodime', branch: 'stage', severity: 'High', status: 'Open', updated: '2h ago' },
  { id: 'BUG-124', title: 'Search functionality not working on mobile', repository: 'Soundmade', branch: 'develop', severity: 'Medium', status: 'In Progress', updated: '4h ago' },
  { id: 'BUG-123', title: 'Login redirect loop on stage environment', repository: 'WeWaive', branch: 'staging', severity: 'High', status: 'Open', updated: '6h ago' },
  { id: 'BUG-122', title: 'Add to cart button is not responsive', repository: 'Foodime', branch: 'main', severity: 'Medium', status: 'Review', updated: '1d ago' },
  { id: 'BUG-121', title: 'UI breaking on iOS Safari', repository: 'WeWaive', branch: 'main', severity: 'Low', status: 'Open', updated: '1d ago' },
];

function App() {
  return (
    <div className="app">
      <header className="topbar">
        <div className="brand"><div className="logo"><Bug size={23} /></div><span>BugTracker</span></div>
        <div className="search"><Search size={18} /><input placeholder="Search bugs by title, ID, status, or repository..." /><kbd>⌘ K</kbd></div>
        <div className="actions"><div className="bell"><Bell size={20} /><span>3</span></div><HelpCircle size={20} /><div className="avatar">UR</div><div><strong>Urmi</strong><small>Tester</small></div><ChevronDown size={16} /></div>
      </header>

      <main className="container">
        <section className="panel create-panel">
          <h1>Create New Bug</h1>
          <p>Report a bug and auto-create a GitHub issue in the selected repository.</p>

          <div className="grid two">
            <label>Project / Repository *<select><option>Select repository</option>{repositories.map(r => <option key={r.repo}>{r.name} — {r.repo}</option>)}</select></label>
            <label>Environment *<div className="segmented"><button className="active">Stage</button><button>Live</button></div></label>
          </div>

          <label>Bug Title *<input placeholder="Short and descriptive title" /></label>
          <label>Bug Description *<textarea placeholder="Describe the bug in detail. What happened?" /></label>
          <label>Steps to Reproduce<textarea placeholder={'1. Go to...\n2. Click...\n3. See error...'} /></label>

          <div className="grid three">
            <label>Bug Severity *<select><option>🔴 Select severity</option><option>High</option><option>Medium</option><option>Low</option></select></label>
            <label>Bug Type *<select><option>🟢 Select type</option><option>Technical</option><option>UI/UX</option><option>Data</option><option>Payment</option></select></label>
            <label>Priority<select><option>🟡 Medium</option><option>High</option><option>Low</option></select></label>
          </div>

          <label>Attachments<div className="upload"><Upload size={16} /> Drag & drop files or click to upload<br /><small>Screenshots, logs, videos (Max 10MB)</small></div></label>

          <div className="submit-row"><label className="check"><input type="checkbox" defaultChecked /> Auto-create GitHub issue <GitPullRequest size={16} /></label><button className="primary">Create Bug</button></div>
        </section>

        <section className="panel bugs-panel">
          <div className="panel-head"><h2>My Bugs</h2><div><a>View All</a><button className="filter"><Filter size={16} /> Filters</button></div></div>
          <div className="tabs"><span>All <b>25</b></span><span className="selected">Open <b>8</b></span><span>In Progress <b>3</b></span><span>Review <b>2</b></span><span>Closed <b>12</b></span></div>
          <table><thead><tr><th>Bug ID</th><th>Title</th><th>Repository</th><th>Severity</th><th>Status</th><th>Updated</th><th></th></tr></thead><tbody>{bugRows.map(b => <tr key={b.id}><td>{b.id}</td><td><strong>{b.title}</strong></td><td>{b.repository}<small>{b.branch}</small></td><td><span className={`pill ${b.severity.toLowerCase()}`}>{b.severity}</span></td><td><span className="status">{b.status}</span></td><td>{b.updated}</td><td><MoreVertical size={17} /></td></tr>)}</tbody></table>
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
