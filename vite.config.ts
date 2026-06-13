import { defineConfig, loadEnv } from 'vite';
import type { Plugin, ViteDevServer, PreviewServer } from 'vite';
import type { IncomingMessage, ServerResponse } from 'node:http';
import react from '@vitejs/plugin-react';
import { findProject } from './src/projects';

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

async function createBugIssue(payload: BugPayload, token: string) {
  const project = findProject(payload.project);
  if (!project) return { status: 400, body: { error: 'Please select a valid project / repository.' } };

  const title = (payload.title || '').trim();
  if (!title) return { status: 400, body: { error: 'Bug title is required.' } };

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
    res = await fetch(`${GITHUB_API}/repos/${project.owner}/${project.repo}/issues`, {
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
      ? ' Check that GITHUB_TOKEN is valid and can create issues on this repo.'
      : res.status === 404
        ? ` Repository ${project.owner}/${project.repo} was not found, or the token cannot access it.`
        : '';
    return { status: res.status, body: { error: (data?.message || 'GitHub rejected the request.') + hint } };
  }

  return {
    status: 201,
    body: { url: data.html_url, number: data.number, repository: `${project.owner}/${project.repo}` },
  };
}

// Adds POST /api/bugs to both the dev server and the preview server so the
// app is fully functional with `npm run dev` and `npm run preview`. The token
// is read server-side only and is never exposed to the browser bundle.
function bugApiPlugin(token: string): Plugin {
  const attach = (server: ViteDevServer | PreviewServer) => {
    server.middlewares.use((req: IncomingMessage, res: ServerResponse, next: () => void) => {
      const path = (req.url || '').split('?')[0];
      if (req.method !== 'POST' || path !== '/api/bugs') return next();
      void (async () => {
        try {
          if (!token) {
            return sendJson(res, 500, {
              error: 'Server is missing GITHUB_TOKEN. Copy .env.example to .env, set the token, and restart.',
            });
          }
          const payload = await readJsonBody(req);
          const result = await createBugIssue(payload, token);
          sendJson(res, result.status, result.body);
        } catch (err) {
          sendJson(res, 500, { error: err instanceof Error ? err.message : 'Unexpected server error.' });
        }
      })();
    });
  };

  return { name: 'bug-api', configureServer: attach, configurePreviewServer: attach };
}

export default defineConfig(({ mode }) => {
  // Empty prefix loads every key from .env files into this Node process only.
  // GITHUB_TOKEN is intentionally NOT prefixed with VITE_, so it is never
  // inlined into client code.
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react(), bugApiPlugin(env.GITHUB_TOKEN || '')],
  };
});
