import { GenerativeChatAgent } from '$static/lib/ts/GenerativeChatAgent.ts';
import { response } from '$static/lib/ts/Responses.ts';
import { runMatching } from './matcher.ts';
import { normalizeRecord } from './normalize.ts';
import { memoryAvailable } from './memory.ts';
import {
  exportPersonRows,
  getPerson,
  loadDashboardState,
  persistMatchingResults,
  queryInternal,
  queryPersons,
} from './person-store.ts';

const systemPrompt = `You are a talent-data assistant for Blue Hope.
Help users work with the unified person graph after identity resolution.
You can explain match confidence, provenance, review reasons, and data quality.
The canonical table lives in structured memory (bh-talent-persons) and survives refresh.
Do not invent employment status. Empty employment_status is a verification segment, not a guess.`;

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

  const matchingResults = runMatching(filesData, body.settings || { fuzzyThreshold: 85 });
  const sourceFiles = body.files.map((file: { name: string }) => file.name);

  let persist: { runId: string; personsWritten: number; internalWritten: number } | null = null;
  let persistError = '';
  if (memoryAvailable()) {
    try {
      persist = await persistMatchingResults(matchingResults, sourceFiles);
    } catch (error) {
      persistError = errorMessage(error);
      console.error('Persist to structured memory failed:', error);
    }
  }

  const summary = {
    persisted: !!persist,
    persistError: persistError || undefined,
    runId: persist?.runId,
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

  try {
    if (url.pathname.endsWith('/run-matching') && request.method === 'POST') {
      return await handleRunMatching(request);
    }

    if (url.pathname.endsWith('/dashboard/state') && request.method === 'POST') {
      if (!memoryAvailable()) {
        return response({ ok: { hasData: false, run: null, stats: null } });
      }
      return response({ ok: await loadDashboardState() });
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
      return response({ ok: { records: await exportPersonRows() } });
    }

    if (url.pathname.endsWith('/internal/list') && request.method === 'POST') {
      const body = await request.json().catch(() => ({}));
      return response({ ok: { records: await queryInternal(body?.runId) } });
    }
  } catch (error) {
    console.error('Agent route error:', error);
    return response({ error: errorMessage(error) });
  }

  return agent.handler(request);
});
