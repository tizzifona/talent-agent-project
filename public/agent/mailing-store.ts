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
    name: 'Re-engagement check-in',
    subject: 'Still interested in Blue Hope opportunities?',
    body: `Hi {{first_name}},

We are checking in from Blue Hope. Your profile is still in our talent table.

Use this private link to update your details or leave the database:
{{update_link}}

The link stays open for 3 days.

Blue Hope team`,
  },
  {
    id: 'tpl-update',
    name: 'Profile update request',
    subject: 'Please confirm your talent profile',
    body: `Hello {{first_name}},

Please review and update your information so we can match you better.

Open your secure form here:
{{update_link}}

Valid for 3 days.

Blue Hope talent team`,
  },
  {
    id: 'tpl-opportunity',
    name: 'Opportunity match',
    subject: 'A possible match for your profile',
    body: `Hi {{first_name}},

We may have an opportunity that fits your background ({{job_title}} / {{technical_skills}}).

Confirm or refresh your data here before we share more:
{{update_link}}

Link expires in 3 days.

Blue Hope`,
  },
  {
    id: 'tpl-skills',
    name: 'Skills verification',
    subject: 'Quick skills confirmation',
    body: `Hello {{first_name}},

Please confirm your skills and experience are still current.

Update form:
{{update_link}}

Available for 3 days.

Blue Hope`,
  },
  {
    id: 'tpl-consent',
    name: 'Consent & data check',
    subject: 'Stay in the Blue Hope talent database?',
    body: `Hi {{first_name}},

You can stay in our talent database, update your data, or opt out completely using this link:
{{update_link}}

The link is valid for 3 days only.

Blue Hope`,
  },
];

function unwrap(record: JsonMap): JsonMap {
  const object = (record.object && typeof record.object === 'object')
    ? record.object as JsonMap
    : record;
  return { id: record.id, ...object };
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
  };
  return text.replace(/\{\{(\w+)\}\}/g, (_, key: string) => values[key] ?? '');
}

export async function ensureDefaultTemplates(): Promise<JsonMap[]> {
  const existing = await structuredQuery(COLLECTIONS.mailingTemplates, {
    type: TYPES.mailingTemplate,
    select: ['*'],
    limit: 50,
  });
  if (existing.count > 0) {
    return existing.records.map(unwrap).sort((a, b) => String(a.id).localeCompare(String(b.id)));
  }
  const now = new Date().toISOString();
  await structuredWrite(
    COLLECTIONS.mailingTemplates,
    TYPES.mailingTemplate,
    DEFAULT_TEMPLATES.map((tpl) => ({
      id: tpl.id,
      object: {
        name: tpl.name,
        subject: tpl.subject,
        body: tpl.body,
        created_at: now,
        updated_at: now,
      },
    })),
  );
  return DEFAULT_TEMPLATES.map((tpl) => ({ ...tpl, created_at: now, updated_at: now }));
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
  const people = await exportPersonRows(input.runId);
  let recipients = people.filter((p) => !p.held_out && !p.opted_out);
  if (input.segment === 'review') {
    recipients = recipients.filter((p) => p.needs_review);
  } else if (input.segment === 'employment') {
    recipients = recipients.filter((p) => !p.employment_status || p.employment_status === 'unknown');
  }

  const campaignId = `camp-${Date.now()}`;
  const createdAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS).toISOString();
  const base = String(input.baseUrl || '').replace(/[?#].*$/, '').replace(/\/$/, '');

  const messages: JsonMap[] = [];
  const tokenRecords: Array<{ id: string; object: JsonMap }> = [];

  for (const person of recipients) {
    const token = randomToken();
    const updateLink = `${base}?token=${token}`;
    const snapshot = personSnapshot(person);
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
      send_note: 'Stored only. Outbound email provider is not wired yet.',
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

export async function listCampaigns(tableId?: string): Promise<JsonMap[]> {
  const result = await structuredQuery(COLLECTIONS.mailingCampaigns, {
    type: TYPES.mailingCampaign,
    filter: tableId ? { table_id: tableId } : {},
    select: ['*'],
    order: 'created-desc',
    limit: 50,
  });
  return result.records.map(unwrap);
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
      ? 'Opt-out request submitted. An admin will confirm removal from the talent database.'
      : 'Update submitted. An admin will confirm before your row is changed.',
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
  const result = await structuredQuery(COLLECTIONS.pendingUpdates, {
    type: TYPES.pendingUpdate,
    filter: queryFilter,
    select: ['*'],
    order: 'created-desc',
    limit: 100,
  });
  return result.records.map(unwrap);
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
