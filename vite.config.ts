import { defineConfig, loadEnv } from 'vite';
import type { Plugin, ViteDevServer, PreviewServer } from 'vite';
import type { IncomingMessage, ServerResponse } from 'node:http';
import react from '@vitejs/plugin-react';
import { PROJECTS, type ProjectId } from './src/projects';

const GITHUB_API = 'https://api.github.com';

type BugPayload = {
  project?: string;
  environment?: string;
  title?: string;
  description?: string;
  steps?: string;
  severity?: string;
  type?: string;
  priority?: string;
};

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
  const projectId = payload.project as ProjectId | undefined;
  const project = projectId ? PROJECTS[projectId] : undefined;
  if (!project) return { status: 400, body: { error: 'Please select a valid project / repository.' } };

  const title = (payload.title || '').trim();
  if (!title) return { status: 400, body: { error: 'Bug title is required.' } };

  // Each repository uses its own token: FOODIME_TOKEN, SOUNDMADE_TOKEN, etc.
  const envVar = `${(projectId as string).toUpperCase()}_TOKEN`;
  const token = env[envVar];
  if (!token) {
    return { status: 500, body: { error: `Server is missing ${envVar}. Add it to .env (or your environment) and restart.` } };
  }

  const environment = payload.environment === 'Live' ? 'Live' : 'Stage';

  const lines: string[] = [`**Environment:** ${environment}`];
  if (payload.severity) lines.push(`**Severity:** ${payload.severity}`);
  if (payload.type) lines.push(`**Type:** ${payload.type}`);
  if (payload.priority) lines.push(`**Priority:** ${payload.priority}`);
  lines.push('', '## Description', (payload.description || '').trim() || '_No description provided._');
  if ((payload.steps || '').trim()) {
    lines.push('', '## Steps to Reproduce', (payload.steps as string).trim());
  }
  lines.push('', '---', '_Filed via BugTracker._');

  const labels = ['bug', environment.toLowerCase()];
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

// Lists the most recently updated issues (any state) for a project's repo, so
// the UI can show existing bugs when a project is selected. Pull requests are
// filtered out (GitHub returns them from the issues endpoint too).
async function listBugIssues(projectId: string | null, env: Record<string, string>) {
  const id = projectId as ProjectId | null;
  const project = id ? PROJECTS[id] : undefined;
  if (!project) return { status: 400, body: { error: 'Please select a valid project / repository.' } };

  const envVar = `${(id as string).toUpperCase()}_TOKEN`;
  const token = env[envVar];
  if (!token) {
    return { status: 500, body: { error: `Server is missing ${envVar}. Add it to .env (or your environment) and restart.` } };
  }

  let res: Response;
  try {
    res = await fetch(`${GITHUB_API}/repos/${project.repo}/issues?state=all&per_page=50&sort=updated&direction=desc`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'BugTracker',
      },
    });
  } catch {
    return { status: 502, body: { error: 'Could not reach GitHub. Check your network connection.' } };
  }

  const data: any = await res.json().catch(() => []);
  if (!res.ok) {
    const message = data && data.message ? data.message : 'GitHub rejected the request.';
    return { status: res.status, body: { error: `${message} (${project.repo})` } };
  }

  const issues = (Array.isArray(data) ? data : [])
    .filter((i: any) => !i.pull_request)
    .map((i: any) => ({
      number: i.number,
      title: i.title,
      state: i.state,
      labels: (i.labels || []).map((l: any) => (typeof l === 'string' ? l : l?.name)).filter(Boolean),
      url: i.html_url,
      updatedAt: i.updated_at,
    }));

  return { status: 200, body: { repository: project.repo, name: project.name, issues } };
}

// Adds the /api/bugs route (GET list + POST create) to both the dev server and
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
