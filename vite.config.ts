import { defineConfig, loadEnv } from 'vite';
import type { Plugin, ViteDevServer, PreviewServer } from 'vite';
import type { IncomingMessage, ServerResponse } from 'node:http';
import react from '@vitejs/plugin-react';
import { appendFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { PROJECTS, type ProjectId } from './src/projects';

const GITHUB_API = 'https://api.github.com';
const GITHUB_GRAPHQL = 'https://api.github.com/graphql';

type BugPayload = {
  project?: string;
  environment?: string;
  title?: string;
  description?: string;
  steps?: string;
  severity?: string;
  type?: string;
  priority?: string;
  tester?: string;
  device?: string;
  platform?: string;
  number?: number;
  action?: string;
  reason?: string;
  name?: string;
  attachmentName?: string;
  attachmentContent?: string;
};

type Repo = { name: string; repo: string };

type ResolvedRepo =
  | { error: { status: number; body: { error: string } } }
  | { project: Repo; token: string; envVar: string };

function resolveRepo(projectId: string | null | undefined, env: Record<string, string>): ResolvedRepo {
  const id = (projectId || '') as ProjectId;
  const project = id ? PROJECTS[id] : undefined;
  if (!project) return { error: { status: 400, body: { error: 'Please select a valid project / repository.' } } };
  const envVar = `${(id as string).toUpperCase()}_TOKEN`;
  const token = env[envVar];
  if (!token) {
    return { error: { status: 500, body: { error: `Server is missing ${envVar}. Add it to .env (or your environment) and restart.` } } };
  }
  return { project, token, envVar };
}

function composeBugTitle(rawTitle: string, tester?: string): string {
  const stripped = rawTitle.trim().replace(/^bugs?\b\s*[:\-]?\s*/i, '').trim();
  const text = stripped || rawTitle.trim();
  const name = (tester || '').trim();
  return name ? `BUG: ${name} — ${text}` : `BUG: ${text}`;
}

function readJsonBody(req: IncomingMessage): Promise<BugPayload> {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 16_000_000) req.destroy();
    });
    req.on('end', () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw) as BugPayload);
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

async function createBugIssue(payload: BugPayload, env: Record<string, string>) {
  const resolved = resolveRepo(payload.project, env);
  if ('error' in resolved) return resolved.error;
  const { project, token, envVar } = resolved;

  const rawTitle = (payload.title || '').trim();
  if (!rawTitle) return { status: 400, body: { error: 'Bug title is required.' } };
  const title = composeBugTitle(rawTitle, payload.tester);

  const environment = payload.environment === 'Live' ? 'Live' : 'Stage';

  let attachmentUrl = '';
  let attachmentWarning = '';
  let safeName = '';
  if (payload.attachmentName && payload.attachmentContent) {
    safeName = payload.attachmentName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80) || 'attachment';
    const filePath = `bugtracker-attachments/${Date.now()}-${safeName}`;
    try {
      const up = await fetch(`${GITHUB_API}/repos/${project.repo}/contents/${filePath}`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'Content-Type': 'application/json',
          'User-Agent': 'BugTracker',
        },
        body: JSON.stringify({ message: `Add bug attachment ${safeName}`, content: payload.attachmentContent }),
      });
      const upData: any = await up.json().catch(() => ({}));
      if (up.ok && upData?.content) {
        attachmentUrl = upData.content.download_url || upData.content.html_url || '';
      } else {
        const hint = up.status === 403 ? ` Ensure ${envVar} has "Contents: Read and write".` : '';
        attachmentWarning = (upData?.message || `Attachment upload failed (${up.status}).`) + hint;
      }
    } catch {
      attachmentWarning = 'Attachment upload failed: could not reach GitHub.';
    }
  }

  const lines: string[] = [`**Environment:** ${environment}`];
  if (payload.tester) lines.push(`**Reported by:** ${payload.tester}`);
  if (payload.severity) lines.push(`**Severity:** ${payload.severity}`);
  if (payload.type) lines.push(`**Type:** ${payload.type}`);
  if (payload.priority) lines.push(`**Priority:** ${payload.priority}`);
  if (payload.device) lines.push(`**Device:** ${payload.device}`);
  if (payload.platform) lines.push(`**Platform:** ${payload.platform}`);
  lines.push('', '## Description', (payload.description || '').trim() || '_No description provided._');
  if ((payload.steps || '').trim()) {
    lines.push('', '## Steps to Reproduce', (payload.steps as string).trim());
  }
  if (attachmentUrl) {
    lines.push('', '## Attachment', `![${safeName}](${attachmentUrl})`);
  }
  if (attachmentWarning) {
    lines.push('', `_Attachment note: ${attachmentWarning}_`);
  }
  lines.push('', '---', '_Filed via BugTracker._');

  const labels = ['bug', environment.toLowerCase()];
  if (payload.severity) labels.push(`severity:${payload.severity.toLowerCase()}`);
  if (payload.type) labels.push(`type:${payload.type.toLowerCase()}`);
  if (payload.device) labels.push(`device:${payload.device.toLowerCase()}`);
  if (payload.platform) labels.push(`platform:${payload.platform.toLowerCase()}`);

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
      body: JSON.stringify({ title, body: lines.join('\n'), labels }),
    });
  } catch {
    return { status: 502, body: { error: 'Could not reach GitHub. Check your network connection.' } };
  }

  const data: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    const hint = res.status === 401 || res.status === 403
      ? ` Check that ${envVar} is valid and can create issues on ${project.repo}.`
      : res.status === 404
        ? ` Repository ${project.repo} was not found, or ${envVar} cannot access it.`
        : '';
    return { status: res.status, body: { error: (data?.message || 'GitHub rejected the request.') + hint } };
  }

  return {
    status: 201,
    body: {
      url: data.html_url,
      number: data.number,
      repository: project.repo,
      attachmentWarning: attachmentWarning || undefined,
    },
  };
}

const ISSUES_QUERY = `
query($owner: String!, $name: String!, $count: Int!) {
  repository(owner: $owner, name: $name) {
    issues(first: $count, orderBy: { field: UPDATED_AT, direction: DESC }) {
      nodes {
        number
        title
        state
        url
        updatedAt
        milestone { title url }
        labels(first: 20) { nodes { name } }
        assignees(first: 5) { nodes { login } }
        timelineItems(last: 10, itemTypes: [CROSS_REFERENCED_EVENT]) {
          nodes {
            ... on CrossReferencedEvent {
              source {
                ... on PullRequest { number url }
              }
            }
          }
        }
      }
    }
  }
}`;

async function listViaGraphql(project: Repo, token: string) {
  const [owner, name] = project.repo.split('/');
  const res = await fetch(GITHUB_GRAPHQL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'User-Agent': 'BugTracker',
    },
    body: JSON.stringify({ query: ISSUES_QUERY, variables: { owner, name, count: 50 } }),
  });
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok || json.errors || !json.data?.repository) {
    const message = json?.errors?.[0]?.message || json?.message || `GitHub GraphQL error (${res.status}).`;
    throw new Error(`${message} (${project.repo})`);
  }
  const nodes: any[] = json.data.repository.issues?.nodes || [];
  return nodes.map((n) => {
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
      milestone: n.milestone ? { title: n.milestone.title, url: n.milestone.url } : null,
    };
  });
}

async function listViaRest(project: Repo, token: string) {
  const res = await fetch(`${GITHUB_API}/repos/${project.repo}/issues?state=all&per_page=50&sort=updated&direction=desc`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'BugTracker',
    },
  });
  const data: any = await res.json().catch(() => []);
  if (!res.ok) {
    const message = data && data.message ? data.message : 'GitHub rejected the request.';
    throw new Error(`${message} (${project.repo})`);
  }
  return (Array.isArray(data) ? data : [])
    .filter((i: any) => !i.pull_request)
    .map((i: any) => ({
      number: i.number,
      title: i.title,
      state: i.state,
      labels: (i.labels || []).map((l: any) => (typeof l === 'string' ? l : l?.name)).filter(Boolean),
      url: i.html_url,
      updatedAt: i.updated_at,
      assignee: i.assignee?.login ?? i.assignees?.[0]?.login ?? null,
      pr: null as number | null,
      prUrl: undefined as string | undefined,
      milestone: i.milestone ? { title: i.milestone.title, url: i.milestone.html_url } : null,
    }));
}

async function fetchOpenPrMap(project: Repo, token: string) {
  const map = new Map<number, { number: number; url: string; draft: boolean }>();
  const res = await fetch(`${GITHUB_API}/repos/${project.repo}/pulls?state=open&per_page=100`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'BugTracker',
    },
  });
  if (!res.ok) return map;
  const data: any = await res.json().catch(() => []);
  if (!Array.isArray(data)) return map;
  for (const pr of data) {
    const match = /^\s*#?(\d+)\b/.exec(pr.title || '');
    if (!match) continue;
    const issueNumber = Number(match[1]);
    if (!Number.isInteger(issueNumber) || issueNumber === pr.number) continue;
    const existing = map.get(issueNumber);
    if (!existing || pr.number > existing.number) {
      map.set(issueNumber, { number: pr.number, url: pr.html_url, draft: !!pr.draft });
    }
  }
  return map;
}

async function fetchIssueRow(
  project: Repo,
  token: string,
  number: number,
  pr: { number: number; url: string; draft: boolean },
) {
  try {
    const res = await fetch(`${GITHUB_API}/repos/${project.repo}/issues/${number}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'BugTracker',
      },
    });
    if (!res.ok) return null;
    const i: any = await res.json().catch(() => null);
    if (!i || i.pull_request) return null;
    return {
      number: i.number,
      title: i.title,
      state: i.state,
      labels: (i.labels || []).map((l: any) => (typeof l === 'string' ? l : l?.name)).filter(Boolean),
      url: i.html_url,
      updatedAt: i.updated_at,
      assignee: i.assignee?.login ?? i.assignees?.[0]?.login ?? null,
      pr: pr.number,
      prUrl: pr.url,
      prDraft: pr.draft,
      hasOpenPr: true,
      milestone: i.milestone ? { title: i.milestone.title, url: i.milestone.html_url } : null,
    };
  } catch {
    return null;
  }
}

async function applyOpenPrs(project: Repo, token: string, issues: any[]) {
  const prMap = await fetchOpenPrMap(project, token);
  if (!prMap.size) return issues;

  const byNumber = new Map<number, any>(issues.map((i) => [i.number, i]));
  for (const [issueNumber, pr] of prMap) {
    const row = byNumber.get(issueNumber);
    if (row) {
      row.pr = pr.number;
      row.prUrl = pr.url;
      row.prDraft = pr.draft;
      row.hasOpenPr = true;
    }
  }

  const missing = [...prMap.keys()].filter((n) => !byNumber.has(n));
  const fetched = await Promise.all(missing.map((n) => fetchIssueRow(project, token, n, prMap.get(n)!)));
  const extras = fetched.filter((r): r is NonNullable<typeof r> => r != null);

  const all = [...issues, ...extras];
  all.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  return all;
}

async function listBugIssues(projectId: string | null, env: Record<string, string>) {
  const resolved = resolveRepo(projectId, env);
  if ('error' in resolved) return resolved.error;
  const { project, token } = resolved;

  let issues: any[];
  try {
    issues = await listViaGraphql(project, token);
  } catch {
    try {
      issues = await listViaRest(project, token);
    } catch (restErr) {
      const message = restErr instanceof Error ? restErr.message : 'Could not reach GitHub. Check your network connection.';
      return { status: 502, body: { error: message } };
    }
  }

  try {
    issues = await applyOpenPrs(project, token, issues);
  } catch {
    /* keep unannotated issues */
  }

  return { status: 200, body: { repository: project.repo, name: project.name, issues } };
}

async function updateBugIssue(payload: BugPayload, env: Record<string, string>) {
  const resolved = resolveRepo(payload.project, env);
  if ('error' in resolved) return resolved.error;
  const { project, token } = resolved;

  const number = Number(payload.number);
  if (!Number.isInteger(number) || number <= 0) {
    return { status: 400, body: { error: 'A valid issue number is required.' } };
  }
  const allowedActions = ['close-mistake', 'reopen', 'solved', 'not-solved'];
  if (!allowedActions.includes(payload.action ?? '')) {
    return { status: 400, body: { error: 'Unsupported action.' } };
  }

  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json',
    'User-Agent': 'BugTracker',
  };
  const issueUrl = `${GITHUB_API}/repos/${project.repo}/issues/${number}`;

  // "Not solved" keeps the issue open and records a verification comment instead.
  if (payload.action === 'not-solved') {
    const reason = (payload.reason || '').trim();
    const commentBody = reason
      ? `**Not solved after testing:**\n\n${reason}`
      : 'Bug has been tested and it is not solved!';
    try {
      await fetch(`${issueUrl}/labels`, { method: 'POST', headers, body: JSON.stringify({ labels: ['not-solved'] }) });
      const res = await fetch(`${issueUrl}/comments`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ body: commentBody }),
      });
      const data: any = await res.json().catch(() => ({}));
      if (!res.ok) {
        return { status: res.status, body: { error: data?.message || 'GitHub rejected the comment.' } };
      }
      return { status: 200, body: { number, commented: true, url: data.html_url } };
    } catch {
      return { status: 502, body: { error: 'Could not reach GitHub. Check your network connection.' } };
    }
  }

  const label =
    payload.action === 'reopen' ? 'reopened' : payload.action === 'solved' ? 'solved' : 'mistakenly-created';
  const patchBody =
    payload.action === 'reopen'
      ? { state: 'open' }
      : payload.action === 'solved'
        ? { state: 'closed', state_reason: 'completed' }
        : { state: 'closed', state_reason: 'not_planned' };

  try {
    await fetch(`${issueUrl}/labels`, { method: 'POST', headers, body: JSON.stringify({ labels: [label] }) });
    const res = await fetch(issueUrl, { method: 'PATCH', headers, body: JSON.stringify(patchBody) });
    const data: any = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { status: res.status, body: { error: data?.message || 'GitHub rejected the update.' } };
    }
    return { status: 200, body: { number, state: data.state, url: data.html_url } };
  } catch {
    return { status: 502, body: { error: 'Could not reach GitHub. Check your network connection.' } };
  }
}

async function logLogin(payload: BugPayload) {
  const rawName = (payload.name || '').toString().replace(/[\r\n\t]+/g, ' ').trim();
  const name = rawName || 'Unknown';
  const projectId = (payload.project || '').toString();
  const project = PROJECTS[projectId as ProjectId];
  const projectLabel = project ? `${project.name} (${projectId})` : projectId || 'unknown';
  const line = `[${new Date().toISOString()}] ${name} logged in to ${projectLabel}\n`;
  try {
    const dir = join(process.cwd(), 'logs');
    await mkdir(dir, { recursive: true });
    await appendFile(join(dir, 'logins.log'), line, 'utf8');
    return { status: 200, body: { ok: true } };
  } catch (err) {
    return { status: 500, body: { error: err instanceof Error ? err.message : 'Failed to write login log.' } };
  }
}

function bugApiPlugin(env: Record<string, string>): Plugin {
  const attach = (server: ViteDevServer | PreviewServer) => {
    server.middlewares.use((req: IncomingMessage, res: ServerResponse, next: () => void) => {
      const path = (req.url || '').split('?')[0];
      if (path === '/api/login') {
        if (req.method !== 'POST') return next();
        void (async () => {
          try {
            const payload = await readJsonBody(req);
            const result = await logLogin(payload);
            sendJson(res, result.status, result.body);
          } catch (err) {
            sendJson(res, 500, { error: err instanceof Error ? err.message : 'Unexpected server error.' });
          }
        })();
        return;
      }
      if (path !== '/api/bugs') return next();
      void (async () => {
        try {
          if (req.method === 'GET') {
            const url = new URL(req.url || '', 'http://localhost');
            const result = await listBugIssues(url.searchParams.get('project'), env);
            sendJson(res, result.status, result.body);
          } else if (req.method === 'POST') {
            const payload = await readJsonBody(req);
            const result = await createBugIssue(payload, env);
            sendJson(res, result.status, result.body);
          } else if (req.method === 'PATCH') {
            const payload = await readJsonBody(req);
            const result = await updateBugIssue(payload, env);
            sendJson(res, result.status, result.body);
          } else {
            next();
          }
        } catch (err) {
          sendJson(res, 500, { error: err instanceof Error ? err.message : 'Unexpected server error.' });
        }
      })();
    });
  };

  return { name: 'bug-api', configureServer: attach, configurePreviewServer: attach };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react(), bugApiPlugin(env)],
  };
});