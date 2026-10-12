import { getDigestPayload, submitDigestResponse } from './mailing-store.ts';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...CORS_HEADERS,
    },
  });
}

function digestFrom(url: URL, body?: Record<string, unknown>): string {
  const parts = url.pathname.split('/').filter(Boolean);
  const last = parts[parts.length - 1] || '';
  if (last && !['candidate', 'index.html', 'agent'].includes(last)) return last;
  return String(
    url.searchParams.get('c')
    || url.searchParams.get('digest')
    || body?.digest
    || body?.token
    || '',
  ).trim();
}

Deno.serve({ port: 0 }, async (request) => {
  const url = new URL(request.url);
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  try {
    if (request.method === 'GET') {
      const digest = digestFrom(url);
      const result = await getDigestPayload(digest);
      if (!result.valid) return json({ error: result.error || 'Link not found' }, 404);
      return json({
        ok: {
          valid: true,
          digest,
          expires_at: result.expires_at,
          fields: result.snapshot || result.person || {},
        },
      });
    }

    if (request.method === 'POST') {
      const body = await request.json().catch(() => ({})) as Record<string, unknown>;
      const digest = digestFrom(url, body);
      if (!digest) return json({ error: 'digest required' }, 400);
      const action = String(body.action || 'update');
      if (action !== 'update' && action !== 'opt_out') {
        return json({ error: 'action must be update or opt_out' }, 400);
      }
      const result = await submitDigestResponse({
        digest,
        action,
        fields: (body.fields as Record<string, unknown>) || {},
      });
      if (!result.ok) return json({ error: result.error || 'Could not save your reply.' }, 400);
      return json({ ok: result });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Candidate tab error:', error);
    return json({ error: message }, 500);
  }

  return json({ error: 'Not found' }, 404);
});
