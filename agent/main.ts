import { GenerativeChatAgent } from '$static/lib/ts/GenerativeChatAgent.ts';
import { response } from '$static/lib/ts/Responses.ts';
import { Token } from '$static/lib/js/Token.js';
import { runMatching } from './matcher.ts';
import { enrichMatchingResults } from './enrich.ts';
import { normalizeRecord } from './normalize.ts';
import { memoryAvailable } from './memory.ts';
import { listConsents } from './consent-store.ts';
import {
  createPerson,
  exportPersonRows,
  getPerson,
  loadDashboardState,
  persistMatchingResults,
  queryInternal,
  queryPersons,
  softDeletePerson,
  updatePerson,
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
import {
  getTokenPayload,
  listCampaigns,
  listPendingUpdates,
  listTemplates,
  prepareCampaign,
  previewRecipients,
  reviewPendingUpdate,
  deleteTemplate,
  saveTemplate,
  sendCampaign,
  submitTokenResponse,
} from './mailing-store.ts';
import { deletePeopleList, getPeopleList, listPeopleLists, renamePeopleList, savePeopleList } from './list-store.ts';
import { getMailSettings, saveMailSettings, sendTestEmail } from './mailer.ts';

const systemPrompt = `You are the on-screen assistant for Blue Hope Talent Agent.
Help operators work with a saved talent table: search people, explain fields, review uncertain rows, and prepare mailing.
You appear on the working-table page for quick candidate lookup by criteria the operator configures.
Search, country, and skills apply together. Comma-separated skills must all match.
When asked to save the current people as a named list, use save_people_list.
Do not invent employment status. Consents live separately. refugee_status is sensitive.`;

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
  const isPlatformChat = !path.includes('/mailing/') && (
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

    if (url.pathname.endsWith('/persons/create') && request.method === 'POST') {
      const body = await request.json();
      return response({ ok: { record: await createPerson(body || {}) } });
    }

    if (url.pathname.endsWith('/persons/update') && request.method === 'POST') {
      const body = await request.json();
      if (!body?.id) return response({ error: 'Person id required' });
      return response({ ok: { record: await updatePerson(String(body.id), body.fields || body) } });
    }

    if (url.pathname.endsWith('/persons/delete') && request.method === 'POST') {
      const body = await request.json();
      if (!body?.id) return response({ error: 'Person id required' });
      return response({
        ok: {
          record: await softDeletePerson(
            String(body.id),
            actorFrom(request),
            String(body.note || ''),
          ),
        },
      });
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

    if (url.pathname.endsWith('/mailing/templates') && request.method === 'POST') {
      return response({ ok: { records: await listTemplates() } });
    }

    if (url.pathname.endsWith('/mailing/templates/delete') && request.method === 'POST') {
      const body = await request.json();
      if (!body?.id) return response({ error: 'Template id required' });
      return response({ ok: await deleteTemplate(String(body.id)) });
    }

    if (url.pathname.endsWith('/mailing/templates/save') && request.method === 'POST') {
      const body = await request.json();
      return response({ ok: { record: await saveTemplate(body || {}) } });
    }

    if (url.pathname.endsWith('/mailing/prepare') && request.method === 'POST') {
      const body = await request.json();
      if (!body?.runId || !body?.tableId) return response({ error: 'tableId and runId required' });
      return response({ ok: await prepareCampaign(body) });
    }

    if (url.pathname.endsWith('/mailing/recipients') && request.method === 'POST') {
      const body = await request.json();
      if (!body?.runId) return response({ error: 'runId required' });
      return response({ ok: await previewRecipients(body) });
    }

    if (url.pathname.endsWith('/mailing/send') && request.method === 'POST') {
      const body = await request.json();
      if (!body?.runId || !body?.tableId) return response({ error: 'tableId and runId required' });
      return response({ ok: await sendCampaign(body) });
    }

    if (url.pathname.endsWith('/mailing/settings') && request.method === 'POST') {
      return response({ ok: await getMailSettings() });
    }

    if (url.pathname.endsWith('/mailing/settings/save') && request.method === 'POST') {
      const body = await request.json();
      return response({ ok: await saveMailSettings(body || {}) });
    }

    if (url.pathname.endsWith('/mailing/test') && request.method === 'POST') {
      const body = await request.json().catch(() => ({}));
      return response({ ok: await sendTestEmail(String(body?.to || ''), body || {}) });
    }

    if (url.pathname.endsWith('/lists/rename') && request.method === 'POST') {
      const body = await request.json();
      if (!body?.id) return response({ error: 'List id required' });
      return response({ ok: { record: await renamePeopleList(String(body.id), String(body.name || '')) } });
    }

    if (url.pathname.endsWith('/lists/delete') && request.method === 'POST') {
      const body = await request.json();
      if (!body?.id) return response({ error: 'List id required' });
      return response({ ok: await deletePeopleList(String(body.id)) });
    }

    if (url.pathname.endsWith('/lists/save') && request.method === 'POST') {
      const body = await request.json();
      return response({ ok: { record: await savePeopleList(body || {}) } });
    }

    if (url.pathname.endsWith('/lists/list') && request.method === 'POST') {
      const body = await request.json().catch(() => ({}));
      return response({ ok: { records: await listPeopleLists(body?.tableId) } });
    }

    if (url.pathname.endsWith('/lists/get') && request.method === 'POST') {
      const body = await request.json();
      if (!body?.id) return response({ error: 'List id required' });
      const record = await getPeopleList(String(body.id));
      if (!record) return response({ error: 'List not found' });
      return response({ ok: { record } });
    }

    if (url.pathname.endsWith('/mailing/campaigns') && request.method === 'POST') {
      const body = await request.json().catch(() => ({}));
      return response({ ok: { records: await listCampaigns(body?.tableId) } });
    }

    if (url.pathname.endsWith('/mailing/pending') && request.method === 'POST') {
      const body = await request.json().catch(() => ({}));
      return response({ ok: { records: await listPendingUpdates(body || {}) } });
    }

    if (url.pathname.endsWith('/mailing/pending/review') && request.method === 'POST') {
      const body = await request.json();
      if (!body?.id) return response({ error: 'Pending id required' });
      const decision = String(body.decision || '');
      if (decision !== 'approve' && decision !== 'reject') {
        return response({ error: 'decision must be approve or reject' });
      }
      return response({
        ok: await reviewPendingUpdate(String(body.id), decision, actorFrom(request)),
      });
    }

    if (url.pathname.endsWith('/candidate/token') && request.method === 'POST') {
      const body = await request.json();
      if (!body?.token) return response({ error: 'token required' });
      return response({ ok: await getTokenPayload(String(body.token)) });
    }

    if (url.pathname.endsWith('/candidate/submit') && request.method === 'POST') {
      const body = await request.json();
      if (!body?.token) return response({ error: 'token required' });
      const action = String(body.action || 'update');
      if (action !== 'update' && action !== 'opt_out') {
        return response({ error: 'action must be update or opt_out' });
      }
      return response({
        ok: await submitTokenResponse({
          token: String(body.token),
          action,
          fields: body.fields || {},
        }),
      });
    }
  } catch (error) {
    console.error('Agent route error:', error);
    return response({ error: errorMessage(error) });
  }

  return agent.handler(request);
});
