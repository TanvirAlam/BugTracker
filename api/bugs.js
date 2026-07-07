const GITHUB_API = 'https://api.github.com';
const GITHUB_GRAPHQL = 'https://api.github.com/graphql';

const PROJECTS = {
  foodime: { name: 'Foodime', repo: 'FoodimeRepo/foodime' },
  soundmade: { name: 'Soundmade', repo: 'soundmade-com/soundmade' },
  wewaive: { name: 'WeWaive', repo: 'wewaive/wewaive' },
  kiibee: { name: 'Kiibee', repo: 'kiibee-app/kiibee' },
};

function readJsonBody(req) {
  if (req.body) return Promise.resolve(req.body);
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 16000000) req.destroy();
    });
    req.on('end', () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

function resolveRepo(projectId, env) {
  const id = projectId || '';
  const project = PROJECTS[id];

  if (!project) {
    return {
      error: {
        status: 400,
        body: { error: 'Please select a valid project / repository.' },
      },
    };
  }

  const envVar = `${id.toUpperCase()}_TOKEN`;
  const token = env[envVar];

  if (!token) {
    return {
      error: {
        status: 500,
        body: {
          error: `Server is missing ${envVar}. Add it to .env or Vercel Environment Variables and redeploy.`,
        },
      },
    };
  }

  return { project, token, envVar };
}

async function listViaGraphql(project, token) {
  const [owner, name] = project.repo.split('/');
  const query = `query($owner: String!, $name: String!, $count: Int!) {
    repository(owner: $owner, name: $name) {
      issues(first: $count, orderBy: { field: UPDATED_AT, direction: DESC }) {
        nodes { number title state url updatedAt milestone { title url } labels(first: 20) { nodes { name } } assignees(first: 5) { nodes { login } } timelineItems(last: 10, itemTypes: [CROSS_REFERENCED_EVENT]) { nodes { ... on CrossReferencedEvent { source { ... on PullRequest { number url } } } } } }
      }
    }
  }`;
  const res = await fetch(GITHUB_GRAPHQL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json', 'User-Agent': 'BugTracker' },
    body: JSON.stringify({ query, variables: { owner, name, count: 50 } }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.errors || !json.data?.repository) throw new Error(`${json?.errors?.[0]?.message || json?.message || `GitHub GraphQL error (${res.status})`}. (${project.repo})`);
  return (json.data.repository.issues?.nodes || []).map((n) => {
    const prs = (n.timelineItems?.nodes || []).map((t) => t?.source).filter((s) => s && typeof s.number === 'number');
    const pr = prs.length ? prs[prs.length - 1] : null;
    return { number: n.number, title: n.title, state: String(n.state || '').toLowerCase(), labels: (n.labels?.nodes || []).map((l) => l?.name).filter(Boolean), url: n.url, updatedAt: n.updatedAt, assignee: n.assignees?.nodes?.[0]?.login ?? null, pr: pr ? pr.number : null, prUrl: pr ? pr.url : undefined, milestone: n.milestone ? { title: n.milestone.title, url: n.milestone.url } : null };
  });
}

async function listViaRest(project, token) {
  const res = await fetch(`${GITHUB_API}/repos/${project.repo}/issues?state=all&per_page=50&sort=updated&direction=desc`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'BugTracker' },
  });
  const data = await res.json().catch(() => []);
  if (!res.ok) throw new Error(`GitHub API error (${project.repo})`);
  return (Array.isArray(data) ? data : []).filter((i) => !i.pull_request).map((i) => ({ number: i.number, title: i.title, state: i.state, labels: (i.labels || []).map((l) => (typeof l === 'string' ? l : l?.name)).filter(Boolean), url: i.html_url, updatedAt: i.updated_at, assignee: i.assignee?.login ?? i.assignees?.[0]?.login ?? null, pr: null, prUrl: undefined, milestone: i.milestone ? { title: i.milestone.title, url: i.milestone.html_url } : null }));
}

async function listBugIssues(projectId, env) {
  const resolved = resolveRepo(projectId, env);
  if ('error' in resolved) return resolved.error;
  const { project, token } = resolved;
  let issues;
  try { issues = await listViaGraphql(project, token); } catch { issues = await listViaRest(project, token); }
  return { status: 200, body: { repository: project.repo, name: project.name, issues } };
}

async function createBugIssue(payload, env) {
  const resolved = resolveRepo(payload.project, env);
  if ('error' in resolved) return resolved.error;
  const { project, token } = resolved;
  const rawTitle = (payload.title || '').trim();
  if (!rawTitle) return { status: 400, body: { error: 'Bug title is required.' } };
  const title = rawTitle.replace(/^bugs?\b\s*[:\-]?\s*/i, '').trim();
  const lines = [`**Environment:** ${payload.environment === 'Live' ? 'Live' : 'Stage'}`];
  if (payload.tester) lines.push(`**Reported by:** ${payload.tester}`);
  if (payload.severity) lines.push(`**Severity:** ${payload.severity}`);
  if (payload.type) lines.push(`**Type:** ${payload.type}`);
  if (payload.priority) lines.push(`**Priority:** ${payload.priority}`);
  if (payload.device) lines.push(`**Device:** ${payload.device}`);
  if (payload.platform) lines.push(`**Platform:** ${payload.platform}`);
  lines.push('', '## Description', (payload.description || '').trim() || '_No description provided._');
  if ((payload.steps || '').trim()) lines.push('', '## Steps to Reproduce', (payload.steps).trim());
  lines.push('', '---', '_Filed via BugTracker._');
  const labels = ['bug', (payload.environment === 'Live' ? 'Live' : 'Stage').toLowerCase()];
  if (payload.severity) labels.push(`severity:${payload.severity.toLowerCase()}`);
  if (payload.type) labels.push(`type:${payload.type.toLowerCase()}`);
  let res;
  try { res = await fetch(`${GITHUB_API}/repos/${project.repo}/issues`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'Content-Type': 'application/json', 'User-Agent': 'BugTracker' }, body: JSON.stringify({ title: `BUG: ${title}`, body: lines.join('\n'), labels }) }); } catch { return { status: 502, body: { error: 'Could not reach GitHub.' } }; }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { status: res.status, body: { error: data?.message || 'GitHub rejected the request.' } };
  return { status: 201, body: { url: data.html_url, number: data.number, repository: project.repo } };
}

async function updateBugIssue(payload, env) {
  const resolved = resolveRepo(payload.project, env);
  if ('error' in resolved) return resolved.error;
  const { project, token } = resolved;
  const number = Number(payload.number);
  if (!Number.isInteger(number) || number <= 0) return { status: 400, body: { error: 'A valid issue number is required.' } };
  const allowedActions = ['close-mistake', 'reopen', 'solved', 'not-solved'];
  if (!allowedActions.includes(payload.action)) return { status: 400, body: { error: 'Unsupported action.' } };
  const headers = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'Content-Type': 'application/json', 'User-Agent': 'BugTracker' };
  const issueUrl = `${GITHUB_API}/repos/${project.repo}/issues/${number}`;
  if (payload.action === 'not-solved') {
    const reason = (payload.reason || '').trim();
    const commentBody = reason ? `**Not solved after testing:**\n\n${reason}` : 'Bug has been tested and it is not solved!';
    try {
      await fetch(`${issueUrl}/labels`, { method: 'POST', headers, body: JSON.stringify({ labels: ['not-solved'] }) });
      const res = await fetch(`${issueUrl}/comments`, { method: 'POST', headers, body: JSON.stringify({ body: commentBody }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return { status: res.status, body: { error: data?.message || 'GitHub rejected the comment.' } };
      return { status: 200, body: { number, commented: true, url: data.html_url } };
    } catch { return { status: 502, body: { error: 'Could not reach GitHub.' } }; }
  }
  const label = payload.action === 'reopen' ? 'reopened' : payload.action === 'solved' ? 'solved' : 'mistakenly-created';
  const patchBody = payload.action === 'reopen' ? { state: 'open' } : payload.action === 'solved' ? { state: 'closed', state_reason: 'completed' } : { state: 'closed' };
  try {
    await fetch(`${issueUrl}/labels`, { method: 'POST', headers, body: JSON.stringify({ labels: [label] }) });
    const res = await fetch(issueUrl, { method: 'PATCH', headers, body: JSON.stringify(patchBody) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { status: res.status, body: { error: data?.message || 'GitHub rejected the update.' } };
    return { status: 200, body: { number, state: data.state, url: data.html_url } };
  } catch { return { status: 502, body: { error: 'Could not reach GitHub.' } }; }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.statusCode = 204; res.end(); return; }
  try {
    if (req.method === 'GET') {
      const url = new URL(req.url || '', 'http://localhost');
      const result = await listBugIssues(url.searchParams.get('project'), process.env);
      res.statusCode = result.status; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(result.body));
    } else if (req.method === 'POST') {
      const body = await readJsonBody(req); const result = await createBugIssue(body, process.env);
      res.statusCode = result.status; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(result.body));
    } else if (req.method === 'PATCH') {
      const body = await readJsonBody(req); const result = await updateBugIssue(body, process.env);
      res.statusCode = result.status; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(result.body));
    } else { res.statusCode = 405; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ error: 'Method not allowed' })); }
  } catch (err) { res.statusCode = 500; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ error: err.message || 'Unexpected server error.' })); }
}