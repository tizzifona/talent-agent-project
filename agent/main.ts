import { GenerativeChatAgent } from '$static/lib/ts/GenerativeChatAgent.ts';
import { response } from '$static/lib/ts/Responses.ts';
import { Token } from '$static/lib/js/Token.js';
import { runMatching } from './matcher.ts';
import { enrichMatchingResults } from './enrich.ts';
import { normalizeRecord } from './normalize.ts';
import { memoryAvailable } from './memory.ts';
import { listConsents } from './consent-store.ts';
import {
  exportPersonRows,
  getPerson,
  loadDashboardState,
  persistMatchingResults,
  queryInternal,
  queryPersons,
} from './person-store.ts';
import {
  confirmPerson,
  mergePersons,
  rejectPerson,
  searchMergeTargets,
} from './review.ts';
import {
  deleteTable,
  getTable,
  listTables,
  renameTable,
} from './table-store.ts';

const systemPrompt = `You are the on-screen assistant for Blue Hope Talent Agent.
The product has three stages:
1. Upload and deduplicate CSV or Excel files into one person per contact (email, then phone, then a cautious name check; uncertain rows go to review).
2. Saved tables: preview people, rename, export CSV or Excel, review, or delete from the library.
3. Mailing settings: choose a table and a segment. Sending is not enabled yet.

Answer how-to and product questions from this description. Do not call index_search, index_resolve, or structured_get for those questions.
Only query structured memory collections bh-talent-persons, bh-talent-tables, bh-talent-internal, bh-talent-runs, and bh-talent-review-actions when the user asks about people or saved tables.
Never call index_resolve without a key returned by index_search.
If a tool fails, answer from this guide instead of repeating the platform error.
Do not invent employment status. Empty employment_status is a verification segment, not a guess.
The unified table follows the consolidation spec: candidate_id, source_database (BD1-BD7), name, demographics and location, contact details, legal status and work permission, languages and education, professional experience and skills.
Consents (privacy_policy_accepted, data_processing_consent, future_contact_consent) live in bh-talent-consents as separate fields. refugee_status is sensitive and is excluded from exports by default.`;

const agent = new GenerativeChatAgent({
  targetScope: 'chat useTools read_memory write_memory',
  defaultSystemPrompt: systemPrompt,
  defaultTemperature: 0.3,
  maxToolRounds: 4,
});

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function actorFrom(request: Request): string {
  const token = Token.from(request);
  if (!token) return 'unknown';
  try {
    return token.getCounterparty() || 'unknown';
  } catch {
    return 'unknown';
  }
}

async function handleReview(request: Request): Promise<Response> {
  const body = await request.json();
  const id = String(body?.id || '');
  const action = String(body?.action || '');
  const note = String(body?.note || '');
  const actor = actorFrom(request);
  if (!id) return response({ error: 'Person id required' });

  if (action === 'confirm') {
    return response({ ok: { person: await confirmPerson(id, actor, note) } });
  }
  if (action === 'reject') {
    return response({ ok: { person: await rejectPerson(id, actor, note) } });
  }
  if (action === 'merge') {
    const targetId = String(body?.targetId || '');
    return response({ ok: await mergePersons(id, targetId, actor, note) });
  }
  return response({ error: 'Unknown review action' });
}

async function handleRunMatching(request: Request): Promise<Response> {
  const body = await request.json();
  if (!body.files || body.files.length === 0) {
    return response({ error: 'No files provided' });
  }

  const filesData = {
    databases: body.files.map((file: { name: string; rowCount: number; records: Record<string, unknown>[] }) => ({
      name: file.name,
      rowCount: file.rowCount,
      records: file.records.map((record, index) => ({
        ...normalizeRecord(record, file.name),
        sourceDb: file.name,
        rowIndex: index,
      })),
    })),
    totalRecords: body.files.reduce(
      (sum: number, file: { rowCount: number }) => sum + file.rowCount,
      0,
    ),
    loadedAt: new Date().toISOString(),
  };

  const matchingResults = enrichMatchingResults(
    runMatching(filesData, body.settings || { fuzzyThreshold: 85 }),
  );
  const sourceFiles = body.files.map((file: { name: string }) => file.name);

  let persist: {
    runId: string;
    tableId: string;
    tableName: string;
    personsWritten: number;
    internalWritten: number;
  } | null = null;
  let persistError = '';
  if (memoryAvailable()) {
    try {
      persist = await persistMatchingResults(
        matchingResults,
        sourceFiles,
        String(body.tableName || ''),
      );
    } catch (error) {
      persistError = errorMessage(error);
      console.error('Persist to structured memory failed:', error);
    }
  }

  const summary = {
    persisted: !!persist,
    persistError: persistError || undefined,
    runId: persist?.runId,
    tableId: persist?.tableId,
    tableName: persist?.tableName,
    personsWritten: persist?.personsWritten || 0,
    internalWritten: persist?.internalWritten || 0,
    totalRecords: matchingResults.totalRecords,
    uniquePersons: matchingResults.uniquePersons,
    emailMatches: matchingResults.emailMatches,
    phoneMatches: matchingResults.phoneMatches,
    sourceIdMatches: matchingResults.sourceIdMatches,
    fuzzyMatches: matchingResults.fuzzyMatches,
    fuzzyAutoMatches: matchingResults.fuzzyAutoMatches,
    manualReview: matchingResults.manualReview,
    needsReviewCount: matchingResults.needsReviewCount,
    heldOut: matchingResults.heldOut,
    internalCount: matchingResults.internalCount,
    processedAt: matchingResults.processedAt,
    settings: matchingResults.settings,
  };

  if (persist) {
    return response({ ok: summary });
  }

  return response({
    ok: {
      ...summary,
      persons: matchingResults.persons,
      heldOutPersons: matchingResults.heldOutPersons,
      internalAccounts: matchingResults.internalAccounts,
    },
  });
}

Deno.serve({ port: 0 }, async (request) => {
  const url = new URL(request.url);
  const path = url.pathname;
  const isPlatformChat = (
    path.endsWith('/session')
    || path.endsWith('/send')
    || path.endsWith('/settings')
    || path.endsWith('/models')
    || path.endsWith('/chats')
    || path.endsWith('/client-tool-results')
    || path.endsWith('/close')
    || path === '/delete'
    || path.endsWith('/rpc')
    || path.includes('/daemon/')
  );
  if (isPlatformChat) {
    return agent.handler(request);
  }

  try {
    if (url.pathname.endsWith('/run-matching') && request.method === 'POST') {
      return await handleRunMatching(request);
    }

    if (url.pathname.endsWith('/dashboard/state') && request.method === 'POST') {
      if (!memoryAvailable()) {
        return response({ ok: { hasData: false, run: null, stats: null } });
      }
      const body = await request.json().catch(() => ({}));
      return response({ ok: await loadDashboardState(body?.runId) });
    }

    if (url.pathname.endsWith('/persons/query') && request.method === 'POST') {
      const body = await request.json();
      return response({ ok: await queryPersons(body || {}) });
    }

    if (url.pathname.endsWith('/persons/get') && request.method === 'POST') {
      const body = await request.json();
      if (!body?.id) return response({ error: 'Person id required' });
      return response({ ok: { record: await getPerson(body.id) } });
    }

    if (url.pathname.endsWith('/persons/export') && request.method === 'POST') {
      const body = await request.json().catch(() => ({}));
      return response({ ok: { records: await exportPersonRows(body?.runId) } });
    }

    if (url.pathname.endsWith('/consents/list') && request.method === 'POST') {
      const body = await request.json().catch(() => ({}));
      return response({ ok: { records: await listConsents(body?.runId) } });
    }

    if (url.pathname.endsWith('/internal/list') && request.method === 'POST') {
      const body = await request.json().catch(() => ({}));
      return response({ ok: { records: await queryInternal(body?.runId) } });
    }

    if (url.pathname.endsWith('/persons/review') && request.method === 'POST') {
      return await handleReview(request);
    }

    if (url.pathname.endsWith('/persons/merge-targets') && request.method === 'POST') {
      const body = await request.json();
      if (!body?.id) return response({ error: 'Person id required' });
      return response({
        ok: { records: await searchMergeTargets(String(body.id), String(body.search || '')) },
      });
    }

    if (url.pathname.endsWith('/tables/list') && request.method === 'POST') {
      return response({ ok: { records: await listTables() } });
    }

    if (url.pathname.endsWith('/tables/get') && request.method === 'POST') {
      const body = await request.json();
      if (!body?.id) return response({ error: 'Table id required' });
      return response({ ok: { record: await getTable(String(body.id)) } });
    }

    if (url.pathname.endsWith('/tables/rename') && request.method === 'POST') {
      const body = await request.json();
      if (!body?.id) return response({ error: 'Table id required' });
      return response({ ok: { record: await renameTable(String(body.id), String(body.name || '')) } });
    }

    if (url.pathname.endsWith('/tables/delete') && request.method === 'POST') {
      const body = await request.json();
      if (!body?.id) return response({ error: 'Table id required' });
      await deleteTable(String(body.id));
      return response({ ok: { deleted: true } });
    }
  } catch (error) {
    console.error('Agent route error:', error);
    return response({ error: errorMessage(error) });
  }

  return agent.handler(request);
});
