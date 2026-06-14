import { defineConfig, loadEnv } from 'vite';
import type { Plugin, ViteDevServer, PreviewServer } from 'vite';
import type { IncomingMessage, ServerResponse } from 'node:http';
import react from '@vitejs/plugin-react';
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
};

type Repo = { name: string; repo: string };

type ResolvedRepo =
  | { error: { status: number; body: { error: string } } }
  | { project: Repo; token: string; envVar: string };

// Resolves the per-project repo + server-side token, or an error response.
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

// Canonical bug title: starts with "BUG", with the tester's name before the
// title text. A leading "bug"/"bugs:" typed by the tester is stripped first so
// titles never end up double-prefixed.
function composeBugTitle(rawTitle: string, tester?: string): string {
  const stripped = rawTitle.trim().replace(/^bugs?\b\s*[:\-]?\s*/i, '').trim();
  const text = stripped || rawTitle.trim();
  const name = (tester || '').trim();
  return name ? `BUG: ${name} \u2014 ${text}` : `BUG: ${text}`;
}

function readJsonBody(req: IncomingMessage): Promise<BugPayload> {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 1_000_000) req.destroy(); // basic guard against huge bodies
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
    body: { url: data.html_url, number: data.number, repository: project.repo },
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

// Primary list path: GraphQL, so each issue can carry its linked PR + assignee
// in a single request. GraphQL's `issues` connection already excludes PRs.
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
    const prs = (n.timelineItems?.nodes || [])
      .map((t: any) => t?.source)
      .filter((s: any) => s && typeof s.number === 'number');
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

// Fallback list path: REST (no PR linkage) so the table still works if GraphQL
// fails for any reason.
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
    }));
}

// Lists the most recently updated issues (any state) for a project's repo, with
// linked PR + assignee. Tries GraphQL first, then falls back to REST.
async function listBugIssues(projectId: string | null, env: Record<string, string>) {
  const resolved = resolveRepo(projectId, env);
  if ('error' in resolved) return resolved.error;
  const { project, token } = resolved;

  try {
    const issues = await listViaGraphql(project, token);
    return { status: 200, body: { repository: project.repo, name: project.name, issues } };
  } catch {
    try {
      const issues = await listViaRest(project, token);
      return { status: 200, body: { repository: project.repo, name: project.name, issues } };
    } catch (restErr) {
      const message = restErr instanceof Error ? restErr.message : 'Could not reach GitHub. Check your network connection.';
      return { status: 502, body: { error: message } };
    }
  }
}

// Closes a mistakenly-created ticket (item 7) or reopens one (item 8), tagging
// it with a `mistakenly-created` / `reopened` label respectively. GitHub
// auto-creates a label the first time it is applied to an issue.
async function updateBugIssue(payload: BugPayload, env: Record<string, string>) {
  const resolved = resolveRepo(payload.project, env);
  if ('error' in resolved) return resolved.error;
  const { project, token } = resolved;

  const number = Number(payload.number);
  if (!Number.isInteger(number) || number <= 0) {
    return { status: 400, body: { error: 'A valid issue number is required.' } };
  }
  if (payload.action !== 'close-mistake' && payload.action !== 'reopen') {
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
  const label = payload.action === 'reopen' ? 'reopened' : 'mistakenly-created';
  const patchBody =
    payload.action === 'reopen' ? { state: 'open' } : { state: 'closed', state_reason: 'not_planned' };

  try {
    // Add the label (created automatically if it does not yet exist on the repo).
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

// Adds the /api/bugs route (GET list + POST create + PATCH update) to both the dev server and
// the preview server so the app is fully functional with `npm run dev` and
// `npm run preview`. Tokens are read server-side only and never exposed to the
// browser bundle.
function bugApiPlugin(env: Record<string, string>): Plugin {
  const attach = (server: ViteDevServer | PreviewServer) => {
    server.middlewares.use((req: IncomingMessage, res: ServerResponse, next: () => void) => {
      const path = (req.url || '').split('?')[0];
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
  // Empty prefix loads every key (incl. *_TOKEN) from .env files and process.env
  // into this Node process only. Tokens are NOT prefixed with VITE_, so they are
  // never inlined into client code.
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react(), bugApiPlugin(env)],
  };
});
