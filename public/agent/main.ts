import { GenerativeChatAgent } from 'webdaemon';
import { runMatching } from './matcher.ts';

// deno-lint-ignore no-explicit-any
let matchingResults: any = null;

const systemPrompt = `You are a data deduplication expert. Help users analyze matching results and improve data quality.

You can help with:
- Explaining how records were matched
- Suggesting ways to improve data quality
- Answering questions about the deduplication process
- Providing insights about the data`;

const agent = new GenerativeChatAgent({
  targetScope: 'chat useTools read_memory write_memory',
  defaultSystemPrompt: systemPrompt,
  defaultTemperature: 0.3,
  maxToolRounds: 4,
});

Deno.serve({ port: 0 }, async (request) => {
  const url = new URL(request.url);
  
  // Handle custom routes for matching
  if (url.pathname.endsWith('/run-matching') && request.method === 'POST') {
    try {
      const body = await request.json();
      
      if (!body.files || body.files.length === 0) {
        return new Response(JSON.stringify({ error: 'No files provided' }), {
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // deno-lint-ignore no-explicit-any
      const filesData = {
        // deno-lint-ignore no-explicit-any
        databases: body.files.map((file: any) => ({
          name: file.name,
          rowCount: file.rowCount,
          // deno-lint-ignore no-explicit-any
          records: file.records.map((record: any, index: number) => ({
            ...normalizeRecord(record),
            sourceDb: file.name,
            rowIndex: index
          }))
        })),
        // deno-lint-ignore no-explicit-any
        totalRecords: body.files.reduce((sum: number, f: any) => sum + f.rowCount, 0),
        loadedAt: new Date().toISOString()
      };

      matchingResults = runMatching(filesData, body.settings);

      return new Response(JSON.stringify({ ok: matchingResults }), {
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error) {
      console.error('Matching error:', error);
      return new Response(JSON.stringify({ error: `Failed to run matching: ${error.message}` }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  // All other requests go to the chat agent (including lifecycle)
  return agent.handler(request);
});

// deno-lint-ignore no-explicit-any
function normalizeRecord(record: Record<string, any>): any {
  // deno-lint-ignore no-explicit-any
  const normalized: any = { original: record };

  const toString = (val: unknown): string => {
    if (val === null || val === undefined) return '';
    return String(val);
  };

  // Find email field
  const emailFields = ['email', 'email_address', 'contact_email', 'work_email', 'primary_email', 'e-mail'];
  for (const key of Object.keys(record)) {
    const lowerKey = key.toLowerCase();
    if (emailFields.some(ef => lowerKey.includes(ef))) {
      normalized.email = toString(record[key]);
      break;
    }
  }

  // Find phone field
  const phoneFields = ['phone', 'mobile', 'telephone', 'phone_number', 'phone_mobile', 'contact_phone'];
  for (const key of Object.keys(record)) {
    const lowerKey = key.toLowerCase();
    if (phoneFields.some(pf => lowerKey.includes(pf))) {
      normalized.phone = toString(record[key]);
      break;
    }
  }

  // Find name fields
  const firstNameFields = ['first_name', 'firstname', 'first', 'given_name'];
  const lastNameFields = ['last_name', 'lastname', 'last', 'surname', 'family_name'];
  const fullNameFields = ['full_name', 'fullname', 'name', 'attendee_name', 'participant_name'];

  for (const key of Object.keys(record)) {
    const lowerKey = key.toLowerCase();
    if (firstNameFields.includes(lowerKey)) {
      normalized.firstName = toString(record[key]);
    }
    if (lastNameFields.includes(lowerKey)) {
      normalized.lastName = toString(record[key]);
    }
    if (fullNameFields.includes(lowerKey)) {
      normalized.fullName = toString(record[key]);
    }
  }

  return normalized;
}
