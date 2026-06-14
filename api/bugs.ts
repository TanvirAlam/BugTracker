import { readJsonBody, sendJson, listBugIssues, createBugIssue, updateBugIssue } from '../src/server/api';

function setCorsHeaders(res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

export const config = {
  runtime: 'nodejs20',
};

export default async function handler(req: any, res: any) {
  setCorsHeaders(res);
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  const path = (req.url || '').split('?')[0];
  if (path !== '/api/bugs') {
    res.statusCode = 404;
    res.end(JSON.stringify({ error: 'Not found' }));
    return;
  }

  try {
    if (req.method === 'GET') {
      const url = new URL(req.url || '', 'http://localhost');
      const result = await listBugIssues(url.searchParams.get('project'), process.env as Record<string, string>);
      sendJson(res, result.status, result.body);
    } else if (req.method === 'POST') {
      const payload = await readJsonBody(req);
      const result = await createBugIssue(payload, process.env as Record<string, string>);
      sendJson(res, result.status, result.body);
    } else if (req.method === 'PATCH') {
      const payload = await readJsonBody(req);
      const result = await updateBugIssue(payload, process.env as Record<string, string>);
      sendJson(res, result.status, result.body);
    } else {
      res.statusCode = 405;
      res.end(JSON.stringify({ error: 'Method not allowed' }));
    }
  } catch (err) {
    sendJson(res, 500, { error: err instanceof Error ? err.message : 'Unexpected server error.' });
  }
}