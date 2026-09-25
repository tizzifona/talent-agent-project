import {
  COLLECTIONS,
  TYPES,
  structuredGet,
  structuredQuery,
  structuredWrite,
} from './memory.ts';
import {
  exportPersonRows,
  getPerson,
  softDeletePerson,
  updatePerson,
  type JsonMap,
} from './person-store.ts';
import { getPeopleList } from './list-store.ts';
import { brandedEmail, deliverMessages, replySecret, sentFlags } from './mailer.ts';

const TOKEN_TTL_MS = 3 * 24 * 60 * 60 * 1000;

export const EDITABLE_PERSON_FIELDS = [
  'first_name',
  'last_names',
  'primary_email',
  'secondary_email',
  'phone_number',
  'preferred_contact_method',
  'linkedin_url',
  'gender',
  'age',
  'country_of_origin',
  'country_of_residence',
  'city_of_residence',
  'legal_status',
  'refugee_status',
  'work_permission',
  'languages',
  'english_level',
  'highest_education_level',
  'field_of_study',
  'courses_and_certifications',
  'work_experience_summary',
  'job_title',
  'years_of_experience',
  'years_of_tech_experience',
  'has_tech_experience',
  'github_url',
  'technical_skills',
  'key_skills',
  'employment_status',
] as const;

const DEFAULT_TEMPLATES: Array<{ id: string; name: string; subject: string; body: string }> = [
  {
    id: 'tpl-reengage',
    name: 'Talent database update',
    subject: 'Are you interested in working with Blue Hope?',
    body: `Hello {{first_name}}!

Blue Hope is updating its talent database, and we would like to know if you are interested in continuing to work with us and take part in our projects.

If you are, please take a couple of minutes to update your information. That helps us look for projects that fit you better.`,
  },
  {
    id: 'tpl-update',
    name: 'Profile update request',
    subject: 'Please confirm your talent profile',
    body: `Hello {{first_name}},

Please review and update your information so we can match you better.

Use the buttons below. The form stays open for 3 days.

Blue Hope talent team`,
  },
  {
    id: 'tpl-opportunity',
    name: 'Opportunity match',
    subject: 'A possible match for your profile',
    body: `Hi {{first_name}},

We may have an opportunity that fits your background ({{job_title}} / {{technical_skills}}).

Confirm or refresh your data with the buttons below before we share more. The form stays open for 3 days.

Blue Hope`,
  },
  {
    id: 'tpl-skills',
    name: 'Skills verification',
    subject: 'Quick skills confirmation',
    body: `Hello {{first_name}},

Please confirm your skills and experience are still current.

Use the buttons below. The form stays open for 3 days.

Blue Hope`,
  },
  {
    id: 'tpl-consent',
    name: 'Consent & data check',
    subject: 'Stay in the Blue Hope talent database?',
    body: `Hi {{first_name}},

You can stay in our talent database, update your data, or opt out completely using the buttons below.

The form is valid for 3 days only.

Blue Hope`,
  },
];

function unwrap(record: JsonMap): JsonMap {
  const object = (record.object && typeof record.object === 'object')
    ? record.object as JsonMap
    : record;
  return { id: record.id, ...object };
}

function encodePayload(data: JsonMap): string {
  const bytes = new TextEncoder().encode(JSON.stringify(data));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export function publicCandidateLink(base: string, token: string, snapshot: JsonMap, expiresAt: string): string {
  const fields: JsonMap = {};
  for (const field of EDITABLE_PERSON_FIELDS) fields[field] = snapshot[field] ?? '';
  const payload = encodePayload({ exp: expiresAt, fields });
  return `${base}?token=${token}#d=${payload}`;
}

function withOptOut(updateLink: string): string {
  const hashAt = updateLink.indexOf('#');
  const before = hashAt >= 0 ? updateLink.slice(0, hashAt) : updateLink;
  const hash = hashAt >= 0 ? updateLink.slice(hashAt) : '';
  const joiner = before.includes('?') ? '&' : '?';
  return `${before}${joiner}intent=opt_out${hash}`;
}

function randomToken(): string {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function personSnapshot(person: JsonMap): JsonMap {
  const snap: JsonMap = {};
  for (const field of EDITABLE_PERSON_FIELDS) {
    snap[field] = person[field] ?? '';
  }
  snap.full_name = person.full_name || [person.first_name, person.last_names].filter(Boolean).join(' ');
  snap.candidate_id = person.candidate_id || '';
  snap.country = person.country || person.country_of_residence || '';
  return snap;
}

function renderTemplate(text: string, person: JsonMap, updateLink: string): string {
  const values: Record<string, string> = {
    first_name: String(person.first_name || 'there'),
    last_names: String(person.last_names || ''),
    full_name: String(person.full_name || ''),
    primary_email: String(person.primary_email || ''),
    job_title: String(person.job_title || ''),
    technical_skills: String(person.technical_skills || ''),
    update_link: updateLink,
    opt_out_link: updateLink.includes('token=') ? withOptOut(updateLink) : updateLink,
  };
  return text.replace(/\{\{(\w+)\}\}/g, (_, key: string) => values[key] ?? '');
}

export async function ensureDefaultTemplates(): Promise<JsonMap[]> {
  let rows: JsonMap[] = [];
  try {
    const existing = await structuredQuery(COLLECTIONS.mailingTemplates, {
      type: TYPES.mailingTemplate,
      select: ['*'],
      limit: 50,
    });
    rows = existing.records.map(unwrap);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/not found/i.test(message)) throw error;
  }
  const visible = rows.filter((row) => !row.deleted);
  const byId = new Map(visible.map((row) => [String(row.id), row]));
  const now = new Date().toISOString();
  const writes = DEFAULT_TEMPLATES.filter((tpl) => {
    const saved = byId.get(tpl.id);
    if (!saved) return true;
    return /\{\{update_link\}\}|\{\{opt_out_link\}\}|https?:\/\//i.test(String(saved.body || ''));
  }).map((tpl) => ({
    id: tpl.id,
    object: {
      name: String(byId.get(tpl.id)?.name || tpl.name),
      subject: String(byId.get(tpl.id)?.subject || tpl.subject),
      body: tpl.body,
      created_at: byId.get(tpl.id)?.created_at || now,
      updated_at: now,
      deleted: false,
    },
  }));
  if (writes.length) {
    await structuredWrite(COLLECTIONS.mailingTemplates, TYPES.mailingTemplate, writes);
  }
  const merged = new Map(visible.map((row) => [String(row.id), row]));
  for (const write of writes) merged.set(write.id, { id: write.id, ...write.object });
  return [...merged.values()].sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
}

export async function deleteTemplate(id: string): Promise<JsonMap> {
  const existing = await structuredGet(COLLECTIONS.mailingTemplates, id);
  if (!existing) return { deleted: false };
  const prev = unwrap(existing);
  await structuredWrite(COLLECTIONS.mailingTemplates, TYPES.mailingTemplate, [{
    id,
    object: { ...prev, deleted: true, updated_at: new Date().toISOString() },
  }]);
  return { deleted: true, id };
}

export async function listTemplates(): Promise<JsonMap[]> {
  return ensureDefaultTemplates();
}

export async function saveTemplate(input: {
  id?: string;
  name: string;
  subject: string;
  body: string;
}): Promise<JsonMap> {
  const id = String(input.id || `tpl-${Date.now()}`).slice(0, 120);
  const existing = await structuredGet(COLLECTIONS.mailingTemplates, id);
  const prev = existing ? unwrap(existing) : {};
  const object = {
    name: String(input.name || prev.name || 'Template').trim() || 'Template',
    subject: String(input.subject || '').trim(),
    body: String(input.body || '').trim(),
    created_at: prev.created_at || new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  await structuredWrite(COLLECTIONS.mailingTemplates, TYPES.mailingTemplate, [{ id, object }]);
  return { id, ...object };
}

async function selectRecipients(runId: string, segment: string): Promise<JsonMap[]> {
  const people = await exportPersonRows(runId);
  let recipients = people.filter((person) => !person.held_out && !person.opted_out && person.primary_email);
  if (segment === 'review') {
    recipients = recipients.filter((person) => person.needs_review);
  } else if (segment === 'employment') {
    recipients = recipients.filter((person) => !person.employment_status || person.employment_status === 'unknown');
  } else if (segment.startsWith('list:')) {
    const list = await getPeopleList(segment.slice(5));
    const ids = new Set(((list?.person_ids as string[]) || []).map((id) => String(id)));
    recipients = recipients.filter((person) => ids.has(String(person.id)));
  }
  const seen = new Set<string>();
  return recipients.filter((person) => {
    const email = String(person.primary_email || '').trim().toLowerCase();
    if (!email || seen.has(email)) return false;
    seen.add(email);
    return true;
  });
}

export async function previewRecipients(input: {
  runId: string;
  segment: string;
  subject: string;
  body: string;
}): Promise<JsonMap> {
  const recipients = await selectRecipients(input.runId, input.segment || 'all');
  const emails = recipients.map((person) => String(person.primary_email || '').trim().toLowerCase());
  const flags = await sentFlags(emails, String(input.subject || ''), String(input.body || ''));
  const people = recipients.map((person, index) => ({
    name: String(person.full_name || [person.first_name, person.last_names].filter(Boolean).join(' ') || ''),
    email: emails[index],
    sent: flags[index],
  }));
  return {
    total: people.length,
    sent: flags.filter(Boolean).length,
    people,
  };
}

export async function prepareCampaign(input: {
  tableId: string;
  tableName: string;
  runId: string;
  segment: string;
  templateId: string;
  subject: string;
  body: string;
  frequency: string;
  scheduleAt: string;
  baseUrl: string;
}): Promise<JsonMap> {
  const recipients = await selectRecipients(input.runId, input.segment);

  const campaignId = `camp-${Date.now()}`;
  const createdAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS).toISOString();
  const base = String(input.baseUrl || '').replace(/[?#].*$/, '').replace(/\/$/, '');

  const messages: JsonMap[] = [];
  const tokenRecords: Array<{ id: string; object: JsonMap }> = [];

  for (const person of recipients) {
    const token = randomToken();
    const snapshot = personSnapshot(person);
    const updateLink = publicCandidateLink(base, token, snapshot, expiresAt);
    tokenRecords.push({
      id: token,
      object: {
        token,
        campaign_id: campaignId,
        person_id: person.id,
        run_id: input.runId,
        table_id: input.tableId,
        email: person.primary_email || '',
        snapshot,
        created_at: createdAt,
        expires_at: expiresAt,
        used_at: '',
        status: 'active',
      },
    });
    messages.push({
      person_id: person.id,
      email: person.primary_email || '',
      subject: renderTemplate(input.subject, person, updateLink),
      body: renderTemplate(input.body, person, updateLink),
      update_link: updateLink,
      expires_at: expiresAt,
    });
  }

  await structuredWrite(COLLECTIONS.mailingTokens, TYPES.mailingToken, tokenRecords);
  await structuredWrite(COLLECTIONS.mailingCampaigns, TYPES.mailingCampaign, [{
    id: campaignId,
    object: {
      table_id: input.tableId,
      table_name: input.tableName,
      run_id: input.runId,
      segment: input.segment,
      template_id: input.templateId,
      subject: input.subject,
      body: input.body,
      frequency: input.frequency || 'once',
      schedule_at: input.scheduleAt || createdAt,
      recipient_count: messages.length,
      created_at: createdAt,
      status: 'prepared',
      send_note: 'Links prepared. Use Send to deliver through Gmail, within the daily limit.',
    },
  }]);

  return {
    campaignId,
    recipientCount: messages.length,
    expiresAt,
    messages,
    status: 'prepared',
  };
}

export async function sendCampaign(input: {
  tableId: string;
  tableName: string;
  runId: string;
  segment: string;
  templateId: string;
  subject: string;
  body: string;
  baseUrl: string;
}): Promise<JsonMap> {
  const recipients = await selectRecipients(input.runId, input.segment);
  const campaignId = `camp-${Date.now()}`;
  const createdAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS).toISOString();
  const base = String(input.baseUrl || '').replace(/[?#].*$/, '').replace(/\/$/, '');
  const messages: Array<{ email: string; subject: string; body: string; html?: string; personId: string }> = [];
  const tokenRecords: Array<{ id: string; object: JsonMap }> = [];

  for (const person of recipients) {
    const token = randomToken();
    const snapshot = personSnapshot(person);
    const updateLink = publicCandidateLink(base, token, snapshot, expiresAt);
    const optOutLink = withOptOut(updateLink);
    const email = String(person.primary_email || '').trim();
    const text = renderTemplate(input.body, person, updateLink);
    tokenRecords.push({
      id: token,
      object: {
        token,
        campaign_id: campaignId,
        person_id: person.id,
        run_id: input.runId,
        table_id: input.tableId,
        email,
        snapshot: personSnapshot(person),
        created_at: createdAt,
        expires_at: expiresAt,
        used_at: '',
        status: 'active',
      },
    });
    messages.push({
      personId: String(person.id || ''),
      email,
      subject: renderTemplate(input.subject, person, updateLink),
      body: text,
      html: brandedEmail(text, updateLink, optOutLink),
    });
  }

  const delivery = await deliverMessages({
    messages,
    templateSubject: input.subject,
    templateBody: input.body,
    campaignId,
  });
  const sentEmails = new Set((delivery.sentEmails as string[]) || []);
  const kept = tokenRecords.filter((record) => sentEmails.has(String(record.object.email || '').trim().toLowerCase()));
  if (kept.length) await structuredWrite(COLLECTIONS.mailingTokens, TYPES.mailingToken, kept);

  const limit = Number(delivery.dailyLimit || 50);
  const total = recipients.length;
  const sentCount = Number(delivery.sent || 0);
  const days = limit > 0 ? Math.max(0, Math.ceil(total / limit) - 1) : 0;
  const endsAt = new Date(Date.parse(createdAt) + days * 86400000).toISOString();
  await structuredWrite(COLLECTIONS.mailingCampaigns, TYPES.mailingCampaign, [{
    id: campaignId,
    object: {
      table_id: input.tableId,
      table_name: input.tableName,
      run_id: input.runId,
      segment: input.segment,
      template_id: input.templateId,
      subject: input.subject,
      body: input.body,
      recipient_count: total,
      sent_count: sentCount,
      daily_limit: limit,
      started_at: createdAt,
      ends_at: endsAt,
      created_at: createdAt,
      status: total > 0 && sentCount >= total ? 'complete' : 'running',
      send_note: 'Sending through Gmail within the daily limit.',
    },
  }]);

  return { campaignId, recipientCount: recipients.length, ...delivery };
}

export async function listCampaigns(tableId?: string): Promise<JsonMap[]> {
  try {
    const result = await structuredQuery(COLLECTIONS.mailingCampaigns, {
      type: TYPES.mailingCampaign,
      filter: tableId ? { table_id: tableId } : {},
      select: ['*'],
      order: 'created-desc',
      limit: 50,
    });
    return result.records.map(unwrap);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/not found/i.test(message)) return [];
    throw error;
  }
}

function tokenExpired(token: JsonMap): boolean {
  const expires = Date.parse(String(token.expires_at || ''));
  if (!Number.isFinite(expires)) return true;
  return Date.now() > expires;
}

export async function getTokenPayload(token: string): Promise<JsonMap> {
  const record = await structuredGet(COLLECTIONS.mailingTokens, token);
  if (!record) return { valid: false, error: 'Link not found' };
  const data = unwrap(record);
  if (data.status === 'used' || data.status === 'revoked') {
    return { valid: false, error: 'This link was already used or revoked', token: data };
  }
  if (tokenExpired(data)) {
    return { valid: false, error: 'This link expired after 3 days', token: data };
  }
  return {
    valid: true,
    token: data,
    fields: EDITABLE_PERSON_FIELDS,
    person: data.snapshot || {},
  };
}

export async function submitTokenResponse(input: {
  token: string;
  action: 'update' | 'opt_out';
  fields?: JsonMap;
}): Promise<JsonMap> {
  const check = await getTokenPayload(input.token);
  if (!check.valid) return check;

  const tokenData = check.token as JsonMap;
  const now = new Date().toISOString();
  const pendingId = `pend-${Date.now()}-${String(tokenData.person_id || '').slice(0, 40)}`.slice(0, 180);

  const proposed: JsonMap = {};
  if (input.action === 'update') {
    for (const field of EDITABLE_PERSON_FIELDS) {
      if (input.fields && field in input.fields) {
        proposed[field] = String(input.fields[field] ?? '');
      }
    }
  }

  await structuredWrite(COLLECTIONS.pendingUpdates, TYPES.pendingUpdate, [{
    id: pendingId,
    object: {
      token: input.token,
      campaign_id: tokenData.campaign_id,
      person_id: tokenData.person_id,
      run_id: tokenData.run_id,
      table_id: tokenData.table_id,
      action: input.action,
      proposed_fields: proposed,
      previous_snapshot: tokenData.snapshot || {},
      status: 'pending',
      created_at: now,
      reviewed_at: '',
      reviewed_by: '',
    },
  }]);

  await structuredWrite(COLLECTIONS.mailingTokens, TYPES.mailingToken, [{
    id: input.token,
    object: {
      ...Object.fromEntries(
        Object.entries(tokenData).filter(([key]) => key !== 'id'),
      ),
      status: 'used',
      used_at: now,
      pending_id: pendingId,
    },
  }]);

  return {
    ok: true,
    pendingId,
    message: input.action === 'opt_out'
      ? 'Thank you for your reply!'
      : 'Thank you! We look forward to working together.',
  };
}

export async function listPendingUpdates(filter: {
  tableId?: string;
  runId?: string;
  status?: string;
} = {}): Promise<JsonMap[]> {
  const queryFilter: JsonMap = {};
  if (filter.tableId) queryFilter.table_id = filter.tableId;
  if (filter.runId) queryFilter.run_id = filter.runId;
  if (filter.status) queryFilter.status = filter.status;
  try {
    const result = await structuredQuery(COLLECTIONS.pendingUpdates, {
      type: TYPES.pendingUpdate,
      filter: queryFilter,
      select: ['*'],
      order: 'created-desc',
      limit: 100,
    });
    return result.records.map(unwrap);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/not found/i.test(message)) return [];
    throw error;
  }
}

export async function reviewPendingUpdate(
  id: string,
  decision: 'approve' | 'reject',
  actor: string,
): Promise<JsonMap> {
  const record = await structuredGet(COLLECTIONS.pendingUpdates, id);
  if (!record) throw new Error('Pending update not found');
  const pending = unwrap(record);
  if (pending.status !== 'pending') throw new Error('This request was already reviewed');

  const now = new Date().toISOString();
  let personResult: JsonMap | null = null;

  if (decision === 'approve') {
    const person = await getPerson(String(pending.person_id));
    if (!person) throw new Error('Person not found');
    if (pending.action === 'opt_out') {
      personResult = await softDeletePerson(String(pending.person_id), actor, 'Candidate opted out via mailing link');
    } else {
      personResult = await updatePerson(String(pending.person_id), pending.proposed_fields as JsonMap || {});
    }
  }

  const next = {
    ...Object.fromEntries(Object.entries(pending).filter(([key]) => key !== 'id')),
    status: decision === 'approve' ? 'approved' : 'rejected',
    reviewed_at: now,
    reviewed_by: actor,
  };
  await structuredWrite(COLLECTIONS.pendingUpdates, TYPES.pendingUpdate, [{ id, object: next }]);
  return { pending: { id, ...next }, person: personResult };
}

const SUPABASE_URL = 'https://akjiwfexxjgoaqakveco.supabase.co';

async function supabaseRequest(secret: string, path: string, method: string, body?: JsonMap): Promise<unknown> {
  const headers: Record<string, string> = {
    apikey: secret,
    Authorization: `Bearer ${secret}`,
    'Content-Type': 'application/json',
  };
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Supabase ${res.status}`);
  }
  if (res.status === 204) return null;
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

export async function importPublicReplies(): Promise<JsonMap> {
  const secret = await replySecret();
  if (!secret) return { imported: 0, skipped: 0, note: 'Paste the Supabase secret key in Sending account and save it.' };
  const rows = await supabaseRequest(
    secret,
    'candidate_replies?imported_at=is.null&select=id,token,action,fields&order=created_at.asc',
    'GET',
  ) as Array<{ id: string; token: string; action: string; fields?: JsonMap }>;
  let imported = 0;
  let skipped = 0;
  for (const row of rows || []) {
    const action = row.action === 'opt_out' ? 'opt_out' : 'update';
    const result = await submitTokenResponse({
      token: String(row.token || ''),
      action,
      fields: row.fields || {},
    });
    if (!result.ok) {
      skipped += 1;
      continue;
    }
    imported += 1;
    await supabaseRequest(secret, `candidate_replies?id=eq.${row.id}`, 'PATCH', {
      imported_at: new Date().toISOString(),
    });
  }
  return { imported, skipped };
}
