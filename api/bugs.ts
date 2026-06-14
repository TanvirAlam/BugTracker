const GITHUB_API = 'https://api.github.com';
const GITHUB_GRAPHQL = 'https://api.github.com/graphql';

const PROJECTS: Record<string, { name: string; repo: string }> = {
  foodime: { name: 'Foodime', repo: 'FoodimeRepo/foodime' },
  soundmade: { name: 'Soundmade', repo: 'soundmade-com/soundmade' },
  wewaive: { name: 'WeWaive', repo: 'wewaive/wewaive' },
  kiibee: { name: 'Kiibee', repo: 'kiibee-app/kiibee' },
};

// Handle both Node.js IncomingMessage and Vercel's request format
function readJsonBody(req: any): Promise<any> {
  if (req.body) return Promise.resolve(req.body);
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk: any) => {
      raw += chunk;
      if (raw.length > 16_000_000) req.destroy();
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

function resolveRepo(projectId: string | null | undefined, env: Record<string, string>) {
  const id = (projectId || '') as keyof typeof PROJECTS;
  const project = id ? PROJECTS[id] : undefined;
  if (!project) return { error: { status: 400, body: { error: 'Please select a valid project / repository.' } } };
  const envVar = `${(id as string).toUpperCase()}_TOKEN`;
  const token = env[envVar];
  if (!token) {
    return { error: { status: 500, body: { error: `Server is missing ${envVar}. Add it to .env (or your environment) and restart.` } } };
  }
  return { project, token, envVar };
}

async function listViaGraphql(project: { name: string; repo: string }, token: string) {
  const [owner, name] = project.repo.split('/');
  const query = `query($owner: String!, $name: String!, $count: Int!) {
    repository(owner: $owner, name: $name) {
      issues(first: $count, orderBy: { field: UPDATED_AT, direction: DESC }) {
        nodes { number title state url updatedAt labels(first: 20) { nodes { name } } assignees(first: 5) { nodes { login } } timelineItems(last: 10, itemTypes: [CROSS_REFERENCED_EVENT]) { nodes { ... on CrossReferencedEvent { source { ... on PullRequest { number url } } } } } }
      }
    }
  }`;
  const res = await fetch(GITHUB_GRAPHQL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'User-Agent': 'BugTracker',
    },
    body: JSON.stringify({ query, variables: { owner, name, count: 50 } }),
  });
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok || json.errors || !json.data?.repository) {
    const message = json?.errors?.[0]?.message || json?.message || `GitHub GraphQL error (${res.status}).`;
    throw new Error(`${message} (${project.repo})`);
  }
  return (json.data.repository.issues?.nodes || []).map((n: any) => {
    const prs = (n.timelineItems?.nodes || []).map((t: any) => t?.source).filter((s: any) => s && typeof s.number === 'number');
    const pr = prs.length ? prs[prs.length - 1] : null;
    return {
      number: n.number,
      title: n.title,
      state: String(n.state || '').toLowerCase(),
      labels: (n.labels?.nodes || []).map((l: any) => l?.name).filter(Boolean),
      url: n.url,
      updatedAt: n.updatedAt,
      assignee: n.assignees?.nodes?.[0]?.login ?? null,
      pr: pr ? pr.number : null,
      prUrl: pr ? pr.url : undefined,
    };
  });
}

async function listViaRest(project: { name: string; repo: string }, token: string) {
  const res = await fetch(`${GITHUB_API}/repos/${project.repo}/issues?state=all&per_page=50&sort=updated&direction=desc`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'BugTracker',
    },
  });
  const data: any = await res.json().catch(() => []);
  if (!res.ok) throw new Error(`${(data && data.message ? data.message : 'GitHub rejected the request.')} (${project.repo})`);
  return (Array.isArray(data) ? data : []).filter((i: any) => !i.pull_request).map((i: any) => ({
    number: i.number,
    title: i.title,
    state: i.state,
    labels: (i.labels || []).map((l: any) => (typeof l === 'string' ? l : l?.name)).filter(Boolean),
    url: i.html_url,
    updatedAt: i.updated_at,
    assignee: i.assignee?.login ?? i.assignees?.[0]?.login ?? null,
    pr: null,
    prUrl: undefined,
  }));
}

async function listBugIssues(projectId: string | null, env: Record<string, string>) {
  const resolved = resolveRepo(projectId, env);
  if ('error' in resolved) return resolved.error;
  const { project, token } = resolved;

  let issues: any[];
  try {
    issues = await listViaGraphql(project, token);
  } catch {
    issues = await listViaRest(project, token);
  }

  return { status: 200, body: { repository: project.repo, name: project.name, issues } };
}

async function createBugIssue(payload: any, env: Record<string, string>) {
  const resolved = resolveRepo(payload.project, env);
  if ('error' in resolved) return resolved.error;
  const { project, token, envVar } = resolved;

  const rawTitle = (payload.title || '').trim();
  if (!rawTitle) return { status: 400, body: { error: 'Bug title is required.' } };
  const title = rawTitle.replace(/^bugs?\b\s*[:\-]?\s*/i, '').trim();

  const lines: string[] = [`**Environment:** ${payload.environment === 'Live' ? 'Live' : 'Stage'}`];
  if (payload.tester) lines.push(`**Reported by:** ${payload.tester}`);
  if (payload.severity) lines.push(`**Severity:** ${payload.severity}`);
  if (payload.type) lines.push(`**Type:** ${payload.type}`);
  if (payload.priority) lines.push(`**Priority:** ${payload.priority}`);
  if (payload.device) lines.push(`**Device:** ${payload.device}`);
  if (payload.platform) lines.push(`**Platform:** ${payload.platform}`);
  lines.push('', '## Description', (payload.description || '').trim() || '_No description provided._');
  if ((payload.steps || '').trim()) lines.push('', '## Steps to Reproduce', (payload.steps as string).trim());
  lines.push('', '---', '_Filed via BugTracker._');

  const labels = ['bug', (payload.environment === 'Live' ? 'Live' : 'Stage').toLowerCase()];
  if (payload.severity) labels.push(`severity:${payload.severity.toLowerCase()}`);
  if (payload.type) labels.push(`type:${payload.type.toLowerCase()}`);

  let res: Response;
  try {
    res = await fetch(`${GITHUB_API}/repos/${project.repo}/issues`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
        'User-Agent': 'BugTracker',
      },
      body: JSON.stringify({ title: `BUG: ${title}`, body: lines.join('\n'), labels }),
    });
  } catch {
    return { status: 502, body: { error: 'Could not reach GitHub. Check your network connection.' } };
  }

  const data: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { status: res.status, body: { error: (data?.message || 'GitHub rejected the request.') } };
  }

  return { status: 201, body: { url: data.html_url, number: data.number, repository: project.repo } };
}

async function updateBugIssue(payload: any, env: Record<string, string>) {
  const resolved = resolveRepo(payload.project, env);
  if ('error' in resolved) return resolved.error;
  const { project, token } = resolved;

  const number = Number(payload.number);
  if (!Number.isInteger(number) || number <= 0) return { status: 400, body: { error: 'A valid issue number is required.' } };
  if (payload.action !== 'close-mistake' && payload.action !== 'reopen') return { status: 400, body: { error: 'Unsupported action.' } };

  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json',
    'User-Agent': 'BugTracker',
  };
  const issueUrl = `${GITHUB_API}/repos/${project.repo}/issues/${number}`;
  const label = payload.action === 'reopen' ? 'reopened' : 'mistakenly-created';
  const patchBody = payload.action === 'reopen' ? { state: 'open' } : { state: 'closed' };

  try {
    await fetch(`${issueUrl}/labels`, { method: 'POST', headers, body: JSON.stringify({ labels: [label] }) });
    const res = await fetch(issueUrl, { method: 'PATCH', headers, body: JSON.stringify(patchBody) });
    const data: any = await res.json().catch(() => ({}));
    if (!res.ok) return { status: res.status, body: { error: data?.message || 'GitHub rejected the update.' } };
    return { status: 200, body: { number, state: data.state, url: data.html_url } };
  } catch {
    return { status: 502, body: { error: 'Could not reach GitHub. Check your network connection.' } };
  }
}

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  try {
    if (req.method === 'GET') {
      const url = new URL(req.url || 'http://localhost/api/bugs');
      const result = await listBugIssues(url.searchParams.get('project'), process.env as Record<string, string>);
      res.statusCode = result.status;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(result.body));
    } else if (req.method === 'POST') {
      const body = await readJsonBody(req);
      const result = await createBugIssue(body, process.env as Record<string, string>);
      res.statusCode = result.status;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(result.body));
    } else if (req.method === 'PATCH') {
      const body = await readJsonBody(req);
      const result = await updateBugIssue(body, process.env as Record<string, string>);
      res.statusCode = result.status;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(result.body));
    } else {
      res.statusCode = 405;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Method not allowed' }));
    }
  } catch (err) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: err instanceof Error ? err.message : 'Unexpected server error.' }));
  }
}

  try {
    if (req.method === 'GET') {
      const url = new URL(req.url || 'http://localhost/api/bugs');
      const result = await listBugIssues(url.searchParams.get('project'), process.env as Record<string, string>);
      res.status(result.status).json(result.body);
    } else if (req.method === 'POST') {
      const body = await readJsonBody(req);
      const result = await createBugIssue(body, process.env as Record<string, string>);
      res.status(result.status).json(result.body);
    } else if (req.method === 'PATCH') {
      const body = await readJsonBody(req);
      const result = await updateBugIssue(body, process.env as Record<string, string>);
      res.status(result.status).json(result.body);
    } else {
      res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Unexpected server error.' });
  }
}