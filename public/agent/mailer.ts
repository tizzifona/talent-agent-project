import { COLLECTIONS, TYPES, structuredGet, structuredQuery, structuredWrite } from './memory.ts';
import type { JsonMap } from './person-store.ts';

const SETTINGS_ID = 'default';
const BATCH_CAP = 10;

export interface MailSettings {
  host: string;
  port: number;
  user: string;
  app_password: string;
  from_name: string;
  daily_limit: number;
}

export interface OutboundMessage {
  email: string;
  subject: string;
  body: string;
  personId?: string;
}

function unwrap(record: JsonMap): JsonMap {
  const object = (record.object && typeof record.object === 'object')
    ? record.object as JsonMap
    : record;
  return { id: record.id, ...object };
}

function clampLimit(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 50;
  return Math.min(500, Math.max(1, Math.round(parsed)));
}

function blankSettings(): MailSettings {
  return {
    host: 'smtp.gmail.com',
    port: 587,
    user: '',
    app_password: '',
    from_name: 'Blue Hope',
    daily_limit: 50,
  };
}

function asSettings(row: JsonMap | null): MailSettings {
  const base = blankSettings();
  if (!row) return base;
  return {
    host: String(row.host || base.host),
    port: Number(row.port || base.port),
    user: String(row.user || ''),
    app_password: String(row.app_password || ''),
    from_name: String(row.from_name || base.from_name),
    daily_limit: clampLimit(row.daily_limit ?? base.daily_limit),
  };
}

export function publicMailSettings(settings: MailSettings): JsonMap {
  return {
    host: settings.host,
    port: settings.port,
    user: settings.user,
    from_name: settings.from_name,
    daily_limit: settings.daily_limit,
    password_set: Boolean(settings.app_password),
  };
}

async function readSettingsRow(): Promise<JsonMap | null> {
  try {
    const record = await structuredGet(COLLECTIONS.mailSettings, SETTINGS_ID);
    if (!record) return null;
    return unwrap(record);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/not found/i.test(message)) return null;
    throw error;
  }
}

export async function getMailSettings(): Promise<JsonMap> {
  return publicMailSettings(asSettings(await readSettingsRow()));
}

export async function saveMailSettings(input: JsonMap): Promise<JsonMap> {
  const current = asSettings(await readSettingsRow());
  const nextPassword = String(input.app_password || '').replace(/\s+/g, '');
  const next: MailSettings = {
    host: String(input.host || current.host || 'smtp.gmail.com').trim(),
    port: Number(input.port || current.port || 587),
    user: String(input.user || current.user || '').trim(),
    app_password: nextPassword || current.app_password,
    from_name: String(input.from_name || current.from_name || 'Blue Hope').trim() || 'Blue Hope',
    daily_limit: clampLimit(input.daily_limit ?? current.daily_limit),
  };
  if (!next.user) throw new Error('Gmail address is required');
  if (!next.app_password) throw new Error('Gmail app password is required');
  await structuredWrite(COLLECTIONS.mailSettings, TYPES.mailSettings, [{
    id: SETTINGS_ID,
    object: { ...next, updated_at: new Date().toISOString() },
  }]);
  return publicMailSettings(next);
}

function todayStamp(): string {
  return new Date().toISOString().slice(0, 10);
}

async function fingerprint(email: string, subject: string, body: string): Promise<string> {
  const raw = `${email.trim().toLowerCase()}\n${subject}\n${body}`;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
  const hex = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return `sent-${hex.slice(0, 40)}`;
}

async function alreadySent(id: string): Promise<boolean> {
  try {
    const record = await structuredGet(COLLECTIONS.mailSends, id);
    if (!record) return false;
    return unwrap(record).status === 'sent';
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/not found/i.test(message)) return false;
    throw error;
  }
}

async function sentToday(): Promise<number> {
  const today = todayStamp();
  const countRows = (records: JsonMap[]) => records
    .map(unwrap)
    .filter((row) => row.sent_on === today && row.status === 'sent')
    .length;
  try {
    const result = await structuredQuery(COLLECTIONS.mailSends, {
      type: TYPES.mailSend,
      filter: { sent_on: today },
      select: ['*'],
      limit: 500,
    });
    return countRows(result.records);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/not found/i.test(message)) return 0;
    try {
      const result = await structuredQuery(COLLECTIONS.mailSends, {
        type: TYPES.mailSend,
        filter: {},
        select: ['*'],
        order: 'created-desc',
        limit: 500,
      });
      return countRows(result.records);
    } catch (again) {
      const text = again instanceof Error ? again.message : String(again);
      if (/not found/i.test(text)) return 0;
      throw again;
    }
  }
}

async function rememberSend(id: string, email: string, subject: string, campaignId: string): Promise<void> {
  await structuredWrite(COLLECTIONS.mailSends, TYPES.mailSend, [{
    id,
    object: {
      email,
      subject,
      campaign_id: campaignId,
      status: 'sent',
      sent_on: todayStamp(),
      sent_at: new Date().toISOString(),
    },
  }]);
}

async function transmit(settings: MailSettings, message: OutboundMessage): Promise<void> {
  const imported = await import('nodemailer');
  const nodemailer = (imported as { default?: { createTransport: (opts: JsonMap) => { sendMail: (msg: JsonMap) => Promise<unknown> } } }).default
    ?? (imported as { createTransport: (opts: JsonMap) => { sendMail: (msg: JsonMap) => Promise<unknown> } });
  const transporter = nodemailer.createTransport({
    host: settings.host || 'smtp.gmail.com',
    port: settings.port || 587,
    secure: false,
    auth: {
      user: settings.user,
      pass: settings.app_password.replace(/\s+/g, ''),
    },
  });
  const fromName = settings.from_name.replace(/"/g, '');
  await transporter.sendMail({
    from: `"${fromName}" <${settings.user}>`,
    to: message.email,
    subject: message.subject,
    text: message.body,
  });
}

export async function deliverMessages(input: {
  messages: OutboundMessage[];
  templateSubject: string;
  templateBody: string;
  allowRepeat?: boolean;
  campaignId?: string;
}): Promise<JsonMap> {
  const settings = asSettings(await readSettingsRow());
  if (!settings.user || !settings.app_password) {
    throw new Error('Save the Gmail address and app password in Email connection first.');
  }

  const sentTodayCount = await sentToday();
  let sent = 0;
  let skippedDuplicate = 0;
  let skippedLimit = 0;
  let skippedInvalid = 0;
  let deferred = 0;
  const errors: string[] = [];
  const sentEmails: string[] = [];
  const seen = new Set<string>();
  let room = Math.max(0, settings.daily_limit - sentTodayCount);
  let stopForAuth = false;

  for (const message of input.messages) {
    const email = String(message.email || '').trim().toLowerCase();
    if (!email || !email.includes('@')) {
      skippedInvalid += 1;
      continue;
    }
    const id = await fingerprint(email, input.templateSubject, input.templateBody);
    if (seen.has(id) || (!input.allowRepeat && await alreadySent(id))) {
      skippedDuplicate += 1;
      continue;
    }
    if (room <= 0) {
      skippedLimit += 1;
      continue;
    }
    if (sent >= BATCH_CAP) {
      deferred += 1;
      continue;
    }
    seen.add(id);
    try {
      await transmit(settings, { ...message, email });
      await rememberSend(id, email, message.subject, input.campaignId || '');
      sentEmails.push(email);
      sent += 1;
      room -= 1;
      if (sent < BATCH_CAP) await new Promise((resolve) => setTimeout(resolve, 400));
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error);
      errors.push(`${email}: ${text}`);
      if (/auth|invalid login|username and password|application-specific password/i.test(text)) {
        stopForAuth = true;
        break;
      }
    }
  }

  return {
    sent,
    sentEmails,
    skippedDuplicate,
    skippedLimit,
    skippedInvalid,
    deferred,
    errors,
    stopForAuth,
    dailyLimit: settings.daily_limit,
    sentToday: sentTodayCount + sent,
    remainingToday: Math.max(0, settings.daily_limit - sentTodayCount - sent),
    batchCap: BATCH_CAP,
  };
}

export async function sendTestEmail(to: string): Promise<JsonMap> {
  const settings = asSettings(await readSettingsRow());
  const target = String(to || settings.user || '').trim();
  if (!target) throw new Error('Enter an address for the test message');
  const subject = 'Blue Hope test message';
  const body = 'This is a test from Talent Agent. If you can read it, Gmail SMTP is connected.';
  return await deliverMessages({
    messages: [{ email: target, subject, body }],
    templateSubject: `${subject}\n${Date.now()}`,
    templateBody: body,
    allowRepeat: true,
    campaignId: 'test',
  });
}
