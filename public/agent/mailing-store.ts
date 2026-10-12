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
  getPersonByDigest,
  patchPersonMeta,
  softDeletePerson,
  updatePerson,
  type JsonMap,
} from './person-store.ts';
import { getPeopleList } from './list-store.ts';
import { brandedEmail, deliverMessages, listPersonSends, sentFlags } from './mailer.ts';
import { Lifecycle } from '$static/lib/ts/Lifecycle.ts';

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

export function publicCandidateLink(
  base: string,
  digest: string,
  snapshot: JsonMap,
  expiresAt: string,
  submitUrl = '',
): string {
  const fields: JsonMap = {};
  for (const field of EDITABLE_PERSON_FIELDS) fields[field] = snapshot[field] ?? '';
  const payload = encodePayload({ exp: expiresAt, fields, submit: submitUrl });
  return `${base}?c=${digest}#d=${payload}`;
}

export function candidateSubmitUrl(digest: string, submitBase = ''): string {
  const trimmed = String(submitBase || '').replace(/\/$/, '');
  if (trimmed) return `${trimmed}/${encodeURIComponent(digest)}`;
  try {
    const { system } = Lifecycle.getConfig();
    return `${system.protocol}//${system.party}/tab/${system.sourcePrefix}/candidate/${encodeURIComponent(digest)}`;
  } catch {
    return '';
  }
}

function withOptOut(updateLink: string): string {
  const hashAt = updateLink.indexOf('#');
  const before = hashAt >= 0 ? updateLink.slice(0, hashAt) : updateLink;
  const hash = hashAt >= 0 ? updateLink.slice(hashAt) : '';
  const joiner = before.includes('?') ? '&' : '?';
  return `${before}${joiner}intent=opt_out${hash}`;
}

function randomDigest(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

async function ensurePersonDigest(person: JsonMap, expiresAt: string): Promise<string> {
  const existing = String(person.update_digest || '').trim();
  const digest = existing || randomDigest();
  await patchPersonMeta(String(person.id), {
    update_digest: digest,
    update_link_expires_at: expiresAt,
    info_update_status: String(person.info_update_status || 'not_updated'),
  });
  person.update_digest = digest;
  person.update_link_expires_at = expiresAt;
  return digest;
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
    opt_out_link: withOptOut(updateLink),
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
  submitBaseUrl?: string;
}): Promise<JsonMap> {
  const recipients = await selectRecipients(input.runId, input.segment);

  const campaignId = `camp-${Date.now()}`;
  const createdAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS).toISOString();
  const base = String(input.baseUrl || '').replace(/[?#].*$/, '').replace(/\/$/, '');

  const messages: JsonMap[] = [];
  const tokenRecords: Array<{ id: string; object: JsonMap }> = [];

  for (const person of recipients) {
    const digest = await ensurePersonDigest(person, expiresAt);
    const snapshot = personSnapshot(person);
    const submitUrl = candidateSubmitUrl(digest, input.submitBaseUrl);
    const updateLink = publicCandidateLink(base, digest, snapshot, expiresAt, submitUrl);
    tokenRecords.push({
      id: digest,
      object: {
        token: digest,
        digest,
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
  submitBaseUrl?: string;
}): Promise<JsonMap> {
  const recipients = await selectRecipients(input.runId, input.segment);
  const campaignId = `camp-${Date.now()}`;
  const createdAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS).toISOString();
  const base = String(input.baseUrl || '').replace(/[?#].*$/, '').replace(/\/$/, '');
  const messages: Array<{ email: string; subject: string; body: string; html?: string; personId: string; digest: string }> = [];
  const tokenRecords: Array<{ id: string; object: JsonMap }> = [];

  for (const person of recipients) {
    const digest = await ensurePersonDigest(person, expiresAt);
    const snapshot = personSnapshot(person);
    const submitUrl = candidateSubmitUrl(digest, input.submitBaseUrl);
    const updateLink = publicCandidateLink(base, digest, snapshot, expiresAt, submitUrl);
    const optOutLink = withOptOut(updateLink);
    const email = String(person.primary_email || '').trim();
    const text = renderTemplate(input.body, person, updateLink);
    tokenRecords.push({
      id: digest,
      object: {
        token: digest,
        digest,
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
      digest,
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

function linkExpired(expiresAt: unknown): boolean {
  const expires = Date.parse(String(expiresAt || ''));
  if (!Number.isFinite(expires)) return true;
  return Date.now() > expires;
}

export async function getDigestPayload(digest: string): Promise<JsonMap> {
  const value = String(digest || '').trim();
  if (!value) return { valid: false, error: 'Link not found' };
  const person = await getPersonByDigest(value);
  const tokenRecord = await structuredGet(COLLECTIONS.mailingTokens, value);
  const token = tokenRecord ? unwrap(tokenRecord) : null;
  if (token?.status === 'revoked') {
    return { valid: false, error: 'This link was revoked', token };
  }
  if (!person && !token) return { valid: false, error: 'Link not found' };
  const expiresAt = person?.update_link_expires_at || token?.expires_at;
  if (linkExpired(expiresAt)) {
    return { valid: false, error: 'This link expired after 3 days', token, person };
  }
  const snapshot = personSnapshot(person || (token?.snapshot as JsonMap) || {});
  return {
    valid: true,
    digest: value,
    token,
    person,
    fields: EDITABLE_PERSON_FIELDS,
    snapshot,
    expires_at: expiresAt,
  };
}

export async function getTokenPayload(token: string): Promise<JsonMap> {
  const result = await getDigestPayload(token);
  if (!result.valid) return result;
  return {
    ...result,
    person: result.snapshot || result.person || {},
  };
}

export async function submitDigestResponse(input: {
  digest: string;
  action: 'update' | 'opt_out';
  fields?: JsonMap;
}): Promise<JsonMap> {
  const check = await getDigestPayload(input.digest);
  if (!check.valid) return check;

  const person = (check.person as JsonMap) || {};
  const tokenData = (check.token as JsonMap) || {};
  const personId = String(person.id || tokenData.person_id || '');
  if (!personId) return { valid: false, error: 'Candidate not found' };

  const now = new Date().toISOString();
  const pendingId = `pend-${input.digest}`.slice(0, 180);
  const existing = await structuredGet(COLLECTIONS.pendingUpdates, pendingId);
  const previous = existing ? unwrap(existing) : {};
  const snapshot = check.snapshot || personSnapshot(person);

  const proposed: JsonMap = {};
  if (input.action === 'update') {
    for (const field of EDITABLE_PERSON_FIELDS) {
      if (input.fields && field in input.fields) {
        proposed[field] = String(input.fields[field] ?? '');
      }
    }
  }

  const payload = {
    digest: input.digest,
    action: input.action,
    fields: proposed,
    created_at: now,
  };

  await structuredWrite(COLLECTIONS.pendingUpdates, TYPES.pendingUpdate, [{
    id: pendingId,
    object: {
      token: input.digest,
      digest: input.digest,
      campaign_id: tokenData.campaign_id || previous.campaign_id || '',
      person_id: personId,
      run_id: tokenData.run_id || person.run_id || previous.run_id || '',
      table_id: tokenData.table_id || previous.table_id || '',
      action: input.action,
      proposed_fields: proposed,
      previous_snapshot: snapshot,
      payload,
      version: Number(previous.version || 0) + 1,
      status: 'pending',
      created_at: previous.created_at || now,
      updated_at: now,
      reviewed_at: '',
      reviewed_by: '',
    },
  }]);

  if (tokenData.token || tokenData.digest) {
    await structuredWrite(COLLECTIONS.mailingTokens, TYPES.mailingToken, [{
      id: input.digest,
      object: {
        ...Object.fromEntries(Object.entries(tokenData).filter(([key]) => key !== 'id')),
        status: 'active',
        used_at: now,
        reply_count: Number(tokenData.reply_count || 0) + 1,
        pending_id: pendingId,
      },
    }]);
  }

  await patchPersonMeta(personId, {
    info_update_status: 'pending',
  });

  return {
    ok: true,
    pendingId,
    message: input.action === 'opt_out'
      ? 'Thank you for your reply!'
      : 'Thank you! We look forward to working together.',
  };
}

export async function submitTokenResponse(input: {
  token: string;
  action: 'update' | 'opt_out';
  fields?: JsonMap;
}): Promise<JsonMap> {
  return submitDigestResponse({
    digest: input.token,
    action: input.action,
    fields: input.fields,
  });
}

export async function listPendingUpdates(filter: {
  tableId?: string;
  runId?: string;
  status?: string;
} = {}): Promise<JsonMap[]> {
  try {
    const result = await structuredQuery(COLLECTIONS.pendingUpdates, {
      type: TYPES.pendingUpdate,
      select: ['*'],
      order: 'created-desc',
      limit: 100,
    });
    return result.records.map(unwrap).filter((row) => {
      if (filter.status && String(row.status || 'pending') !== filter.status) return false;
      if (filter.tableId && row.table_id && String(row.table_id) !== String(filter.tableId)) return false;
      if (filter.runId && row.run_id && String(row.run_id) !== String(filter.runId)) return false;
      return true;
    });
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
      personResult = await patchPersonMeta(String(pending.person_id), { info_update_status: 'updated' });
    }
  } else {
    await patchPersonMeta(String(pending.person_id), { info_update_status: 'not_updated' }).catch(() => null);
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

async function listMailingTokens(personId = ''): Promise<JsonMap[]> {
  try {
    const result = await structuredQuery(COLLECTIONS.mailingTokens, {
      type: TYPES.mailingToken,
      filter: personId ? { person_id: personId } : {},
      select: ['*'],
      order: 'created-desc',
      limit: personId ? 80 : 300,
    });
    const rows = result.records.map(unwrap);
    return personId ? rows.filter((row) => String(row.person_id || '') === String(personId)) : rows;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/not found/i.test(message)) return [];
    throw error;
  }
}

function tokenWasReplied(token: JsonMap): boolean {
  return Boolean(
    token.used_at
    || token.pending_id
    || Number(token.reply_count || 0) > 0
    || token.status === 'used',
  );
}

function replyLabelFor(
  token: JsonMap | undefined,
  pendingRows: JsonMap[],
  personStatus: string,
): string {
  const pendingRow = pendingRows.find((row) => {
    if (!token) return false;
    const tokenId = String(token.id || token.token || token.digest || '');
    return String(row.token || '') === tokenId
      || String(row.digest || '') === tokenId
      || (row.campaign_id && token.campaign_id && String(row.campaign_id) === String(token.campaign_id));
  });
  const status = String(pendingRow?.status || '');
  if (status === 'pending') return 'Pending';
  if (status === 'approved') return pendingRow?.action === 'opt_out' ? 'Opted out' : 'Yes';
  if (token && tokenWasReplied(token)) {
    if (personStatus === 'updated') return 'Yes';
    if (personStatus === 'opted_out') return 'Opted out';
    return 'Pending';
  }
  return 'No';
}

export function deriveInfoUpdateStatus(
  person: JsonMap,
  pendingRows: JsonMap[],
  tokens: JsonMap[],
): string {
  const personId = String(person.id || '');
  const stored = String(person.info_update_status || '');
  if (stored === 'opted_out' || person.opted_out) return 'opted_out';
  const minePending = pendingRows.filter((row) => String(row.person_id || '') === personId);
  if (minePending.some((row) => String(row.status || 'pending') === 'pending')) return 'pending';
  if (minePending.some((row) => row.status === 'approved' && row.action === 'opt_out')) return 'opted_out';
  if (minePending.some((row) => row.status === 'approved')) return 'updated';
  if (stored === 'updated' || stored === 'pending') return stored;
  const mineTokens = tokens.filter((row) => String(row.person_id || '') === personId);
  if (mineTokens.some(tokenWasReplied)) return 'pending';
  return stored || 'not_updated';
}

export async function enrichPeopleUpdateStatus(
  records: JsonMap[],
  persist = false,
): Promise<JsonMap[]> {
  if (!records.length) return records;
  const pending = await listPendingUpdates();
  const tokens = await listMailingTokens();
  const next: JsonMap[] = [];
  for (const person of records) {
    const status = deriveInfoUpdateStatus(person, pending, tokens);
    if (persist && status !== String(person.info_update_status || 'not_updated') && person.id) {
      await patchPersonMeta(String(person.id), { info_update_status: status }).catch(() => null);
    }
    next.push({ ...person, info_update_status: status });
  }
  return next;
}

export async function listPersonCommunication(personId: string): Promise<JsonMap> {
  const person = await getPerson(personId);
  if (!person) throw new Error('Person not found');
  const pending = (await listPendingUpdates()).filter((row) => String(row.person_id) === String(personId));
  const tokens = await listMailingTokens(personId);
  const sends = await listPersonSends(personId, String(person.primary_email || ''));
  const status = deriveInfoUpdateStatus(person, pending, tokens);
  if (status !== String(person.info_update_status || 'not_updated')) {
    await patchPersonMeta(personId, { info_update_status: status }).catch(() => null);
  }
  const campaigns = await listCampaigns();
  const subjects = Object.fromEntries(
    campaigns.map((row) => [String(row.id), String(row.subject || '')]),
  );
  const messages: JsonMap[] = [];
  const seen = new Set<string>();
  for (const send of sends) {
    const campaignId = String(send.campaign_id || '');
    const token = tokens.find((row) => campaignId && String(row.campaign_id || '') === campaignId);
    if (campaignId) seen.add(campaignId);
    messages.push({
      date: send.sent_at || send.created_at || '',
      subject: send.subject || subjects[campaignId] || 'Mailing',
      campaign_id: campaignId,
      sent: 'Sent',
      reply: replyLabelFor(token, pending, status),
    });
  }
  for (const token of tokens) {
    const campaignId = String(token.campaign_id || token.id || '');
    if (campaignId && seen.has(campaignId)) continue;
    if (campaignId) seen.add(campaignId);
    messages.push({
      date: token.created_at || token.used_at || '',
      subject: subjects[String(token.campaign_id || '')] || 'Personal update link',
      campaign_id: token.campaign_id || '',
      sent: tokenWasReplied(token) ? 'Sent' : 'Prepared',
      reply: replyLabelFor(token, pending, status),
    });
  }
  messages.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
  return {
    person_id: personId,
    info_update_status: status,
    digest: person.update_digest || '',
    expires_at: person.update_link_expires_at || '',
    messages,
    sends,
    tokens,
    pending,
  };
}
