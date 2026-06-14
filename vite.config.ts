import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import type { ViteDevServer, PreviewServer } from 'vite';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { readJsonBody, sendJson, listBugIssues, createBugIssue, updateBugIssue } from './src/server/api';

function setCorsHeaders(res: ServerResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function bugApiPlugin(env: Record<string, string>) {
  const attach = (server: ViteDevServer | PreviewServer) => {
    server.middlewares.use((req: IncomingMessage, res: ServerResponse, next: () => void) => {
      const path = (req.url || '').split('?')[0];
      if (path === '/api/login') {
        if (req.method !== 'POST') return next();
        void (async () => {
          try {
            const payload = await readJsonBody(req);
            const result = { status: 200, body: { ok: true } };
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