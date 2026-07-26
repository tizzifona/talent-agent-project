import { GenerativeChatAgent } from '$static/lib/ts/GenerativeChatAgent.ts';
import { response } from '$static/lib/ts/Responses.ts';
import { runMatching } from './matcher.ts';
import { applyFilters } from './filters.ts';

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
        return response({ error: 'No files provided' });
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

      return response({ ok: matchingResults });
    } catch (error) {
      console.error('Matching error:', error);
      return response({ error: `Failed to run matching: ${error.message}` });
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

  // Strip spaces/underscores/dashes so "First Name", "first_name", "FirstName"
  // all compare equal.
  const cleanKey = (key: string): string => key.toLowerCase().replace(/[\s_-]/g, '');

  // Find email field
  const emailFields = ['email', 'emailaddress', 'contactemail', 'workemail', 'primaryemail', 'e-mail'];
  for (const key of Object.keys(record)) {
    const cleaned = cleanKey(key);
    if (emailFields.some((ef) => cleaned.includes(cleanKey(ef)))) {
      normalized.email = toString(record[key]);
      break;
    }
  }

  // Find phone field
  const phoneFields = ['phone', 'mobile', 'telephone', 'phonenumber', 'phonemobile', 'contactphone'];
  for (const key of Object.keys(record)) {
    const cleaned = cleanKey(key);
    if (phoneFields.some((pf) => cleaned.includes(cleanKey(pf)))) {
      normalized.phone = toString(record[key]);
      break;
    }
  }

  // Find name fields
  const firstNameFields = ['firstname', 'first', 'givenname'];
  const lastNameFields = ['lastname', 'last', 'surname', 'familyname'];
  const fullNameFields = ['fullname', 'name', 'attendeename', 'participantname'];

  for (const key of Object.keys(record)) {
    const cleaned = cleanKey(key);
    if (firstNameFields.includes(cleaned)) {
      normalized.firstName = toString(record[key]);
    }
    if (lastNameFields.includes(cleaned)) {
      normalized.lastName = toString(record[key]);
    }
    if (fullNameFields.includes(cleaned)) {
      normalized.fullName = toString(record[key]);
    }
  }

  // Some sources store the full name as "Last, First". Detect that and
  // split it so first/last name columns come out right in the final table.
  if (normalized.fullName && normalized.fullName.includes(',') && !normalized.firstName && !normalized.lastName) {
    const [last, first] = normalized.fullName.split(',').map((part: string) => part.trim());
    if (last && first) {
      normalized.lastName = last;
      normalized.firstName = first;
      normalized.fullName = `${first} ${last}`;
    }
  }

  // Fill in whichever of firstName/lastName/fullName is missing from the others.
  if (!normalized.fullName && (normalized.firstName || normalized.lastName)) {
    normalized.fullName = [normalized.firstName, normalized.lastName].filter(Boolean).join(' ');
  }
  if (normalized.fullName && !normalized.firstName && !normalized.lastName) {
    const parts = normalized.fullName.trim().split(/\s+/);
    normalized.firstName = parts[0] || '';
    normalized.lastName = parts.slice(1).join(' ');
  }

  // Find skills field
  const skillsFields = ['skills', 'keyskills', 'competencies', 'expertise'];
  for (const key of Object.keys(record)) {
    const cleaned = cleanKey(key);
    if (skillsFields.includes(cleaned)) {
      const raw = toString(record[key]);
      normalized.skills = raw
        .split(/[,;|]/)
        .map((s) => s.trim())
        .filter(Boolean);
      break;
    }
  }

  // Flag internal/staff accounts and obvious test/placeholder rows.
  // Internal accounts are routed to a separate bucket (not discarded).
  // Test rows are flagged for manual confirmation, not auto-excluded.
  const filterResult = applyFilters(normalized.fullName, normalized.email);
  normalized.isInternal = filterResult.isInternal;
  normalized.internalDomain = filterResult.internalDomain;
  normalized.isTestRow = filterResult.isTestRow;
  normalized.testReason = filterResult.testReason;

  return normalized;
}
