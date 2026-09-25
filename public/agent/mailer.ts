import { COLLECTIONS, TYPES, structuredGet, structuredQuery, structuredWrite } from './memory.ts';
import type { JsonMap } from './person-store.ts';

const SETTINGS_ID = 'default';
const LINKED_USER = 'testtalentagend@gmail.com';
const LINKED_APP_PASSWORD = 'xkbrqnruigfeogyo';
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
  html?: string;
  personId?: string;
}

function emailCopy(text: string): string {
  return String(text || '')
    .replace(/\{\{(update_link|opt_out_link)\}\}/g, '')
    .split('\n')
    .filter((line) => !/https?:\/\//i.test(line))
    .join('\n')
    .replace(/using this link:\s*/gi, 'using the buttons below.\n\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function brandedEmail(text: string, updateLink = '', optOutLink = ''): string {
  const safe = emailCopy(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  const paragraphs = safe
    .split(/\n{2,}/)
    .map((part) => `<p style="margin:0 0 16px;line-height:1.55;">${part.replace(/\n/g, '<br>')}</p>`)
    .join('');
  const button = (href: string, label: string, filled: boolean) => href
    ? `<tr><td style="padding:0 0 10px;">
        <a href="${href}" style="display:block;width:100%;box-sizing:border-box;padding:14px 16px;border-radius:10px;font-weight:700;text-decoration:none;text-align:center;${filled
      ? 'background:#3bffc2;color:#0b1628;'
      : 'background:transparent;color:#e8f0ff;border:1px solid #1e2d4a;'}">${label}</a>
      </td></tr>`
    : '';
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><meta charset="utf-8"></head>
    <body style="margin:0;padding:12px;background:#0b1628;color:#e8f0ff;font-family:Manrope,Segoe UI,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#121f38;border:1px solid #1e2d4a;border-radius:16px;">
      <tr><td style="padding:20px 16px 8px;">
        <img src="https://tizzifona.github.io/talent-agent-project/images/icon-heart.png" alt="Blue Hope" width="42" height="42" style="display:block;border:0;border-radius:10px;">
        <p style="margin:14px 0 0;font-size:13px;letter-spacing:0.12em;text-transform:uppercase;color:#3bffc2;">Blue Hope</p>
      </td></tr>
      <tr><td style="padding:8px 16px 8px;font-size:16px;word-break:break-word;">
        ${paragraphs}
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          ${button(updateLink, 'Yes, I want to update my data', true)}
          ${button(optOutLink, 'No, I would like to stop working together', false)}
        </table>
      </td></tr>
    </table>
  </body></html>`;
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
    reply_secret_set: false,
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

function sendingUser(value: unknown): string {
  const user = String(value || '').trim();
  if (!user || user.toLowerCase() === 'tizzifona@gmail.com') return LINKED_USER;
  return user;
}

async function ensureLinkedMailbox(): Promise<MailSettings> {
  const current = asSettings(await readSettingsRow());
  const user = sendingUser(current.user);
  if (user && current.app_password) return { ...current, user };
  const next: MailSettings = {
    ...current,
    host: current.host || 'smtp.gmail.com',
    port: current.port || 587,
    user,
    app_password: current.app_password || LINKED_APP_PASSWORD,
    from_name: current.from_name || 'Blue Hope',
  };
  if (!next.user || !next.app_password) return next;
  await structuredWrite(COLLECTIONS.mailSettings, TYPES.mailSettings, [{
    id: SETTINGS_ID,
    object: { ...next, updated_at: new Date().toISOString() },
  }]);
  return next;
}

export async function replySecret(): Promise<string> {
  const row = await readSettingsRow();
  return String(row?.reply_secret || '').trim();
}

export async function getMailSettings(): Promise<JsonMap> {
  const settings = publicMailSettings(await ensureLinkedMailbox());
  settings.reply_secret_set = Boolean(await replySecret());
  return settings;
}

export async function saveMailSettings(input: JsonMap): Promise<JsonMap> {
  const row = await readSettingsRow();
  const current = asSettings(row);
  const nextPassword = String(input.app_password || '').replace(/\s+/g, '');
  const next: MailSettings = {
    host: String(input.host || current.host || 'smtp.gmail.com').trim(),
    port: Number(input.port || current.port || 587),
    user: sendingUser(input.user || current.user),
    app_password: nextPassword || current.app_password || LINKED_APP_PASSWORD,
    from_name: String(input.from_name || current.from_name || 'Blue Hope').trim() || 'Blue Hope',
    daily_limit: clampLimit(input.daily_limit ?? current.daily_limit),
  };
  if (!next.user) throw new Error('Enter the test Gmail address that owns the app password. The address in Send test to only receives the message.');
  if (!next.app_password) throw new Error('Gmail app password is required');
  const keptSecret = String(input.reply_secret || row?.reply_secret || '').trim();
  await structuredWrite(COLLECTIONS.mailSettings, TYPES.mailSettings, [{
    id: SETTINGS_ID,
    object: { ...next, reply_secret: keptSecret, updated_at: new Date().toISOString() },
  }]);
  return { ...publicMailSettings(next), reply_secret_set: Boolean(keptSecret) };
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

function relaxDenoEnv(): void {
  const deno = (globalThis as {
    Deno?: { env?: { get?: (key: string) => string | undefined; __talentRelaxed?: boolean } };
  }).Deno;
  const env = deno?.env;
  if (!env || typeof env.get !== 'function' || env.__talentRelaxed) return;
  const read = env.get.bind(env);
  env.get = (key: string) => {
    try {
      return read(key);
    } catch {
      return undefined;
    }
  };
  env.__talentRelaxed = true;
}

async function transmit(settings: MailSettings, message: OutboundMessage): Promise<void> {
  relaxDenoEnv();
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
    html: message.html || brandedEmail(message.body),
  });
}

export async function sentFlags(emails: string[], subject: string, body: string): Promise<boolean[]> {
  const flags: boolean[] = [];
  for (const email of emails) {
    flags.push(await alreadySent(await fingerprint(email, subject, body)));
  }
  return flags;
}

export async function deliverMessages(input: {
  messages: OutboundMessage[];
  templateSubject: string;
  templateBody: string;
  allowRepeat?: boolean;
  campaignId?: string;
}): Promise<JsonMap> {
  const settings = await ensureLinkedMailbox();
  if (!settings.user || !settings.app_password) {
    throw new Error('Gmail needs the address of the account that created the app password. Enter it in Test Gmail that sends.');
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

export async function sendTestEmail(to: string, auth: JsonMap = {}): Promise<JsonMap> {
  if (auth.user || auth.app_password) {
    await saveMailSettings({
      user: auth.user,
      app_password: auth.app_password,
      daily_limit: auth.daily_limit,
      host: 'smtp.gmail.com',
      port: 587,
    });
  }
  const settings = await ensureLinkedMailbox();
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
