// Phone sign-in with a one-time code sent by WhatsApp.
// -----------------------------------------------------------------------------
// - Codes are 6 digits, valid 10 minutes, and stored only as an HMAC.
// - A code allows 5 wrong tries, then a new code is needed.
// - Sending is limited: 3 codes per number per 15 minutes, 10 per number per
//   day, and 20 per IP address per hour (each WhatsApp message costs money and
//   lands on someone's phone).
// - Rows older than a day are deleted when a new code is requested.
// - Delivery: the WhatsApp Cloud API with an approved "authentication"
//   template. Outside production with no WhatsApp set up, the code is written
//   to the server log so the flow can be tested. In production it is never
//   logged, and phone sign-in is off until WhatsApp is configured.

import crypto from 'node:crypto';
import { and, desc, eq, gte, isNull, lt, sql } from 'drizzle-orm';
import { config } from '../../config.js';
import { log } from '../../logger.js';
import { phoneOtps } from '../../db/schema/index.js';

export const CODE_TTL_MS = 10 * 60 * 1000;
export const MAX_ATTEMPTS = 5;
const LIMITS = { per15MinPerPhone: 3, perDayPerPhone: 10, perHourPerIp: 20 };

export class PhoneOtpError extends Error {
  constructor(message, code) { super(message); this.name = 'PhoneOtpError'; this.code = code; }
  // code: 'invalid_phone' | 'rate_limited' | 'send_failed' | 'invalid_code' | 'locked'
}

/** E.164, or null. Indian numbers may be written without +91. */
export function normalizePhone(input) {
  if (typeof input !== 'string') return null;
  const raw = input.trim();
  const digits = raw.replace(/[\s\-().]/g, '');
  if (digits.startsWith('+')) return /^\+[1-9]\d{7,14}$/.test(digits) ? digits : null;
  if (/^[6-9]\d{9}$/.test(digits)) return `+91${digits}`;
  if (/^0[6-9]\d{9}$/.test(digits)) return `+91${digits.slice(1)}`;
  if (/^91[6-9]\d{9}$/.test(digits)) return `+${digits}`;
  return null;
}

/** "+91 98••• ••210" style, for messages and logs. */
export function maskPhone(phone) {
  return String(phone).replace(/^(\+\d{2})(\d{2})\d+(\d{3})$/, '$1 $2••• ••$3');
}

const isProduction = () => Boolean(config.bidpilot.csrfSecret) && process.env.NODE_ENV === 'production';
const whatsappConfigured = () => Boolean(config.bidpilot.whatsappOtp.token && config.bidpilot.whatsappOtp.phoneNumberId);

export function phoneSignInEnabled() {
  return whatsappConfigured() || !isProduction();
}

function hashCode(phone, code) {
  const secret = config.bidpilot.csrfSecret || 'dev-only-otp-secret';
  return crypto.createHmac('sha256', secret).update(`${phone}:${code}`).digest('hex');
}

let fetchImpl = (...args) => fetch(...args);
/** Tests replace the WhatsApp API. */
export function setWhatsappFetch(fn) { fetchImpl = fn || ((...args) => fetch(...args)); }

/** The Meta Cloud API request for an authentication template with a
 *  copy-code button (the code goes in the body and in the button). */
export function whatsappTemplateRequest(phone, code, cfg = config.bidpilot.whatsappOtp) {
  return {
    url: `https://graph.facebook.com/${cfg.apiVersion}/${cfg.phoneNumberId}/messages`,
    init: {
      method: 'POST',
      headers: { authorization: `Bearer ${cfg.token}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: phone.replace(/^\+/, ''),
        type: 'template',
        template: {
          name: cfg.template,
          language: { code: cfg.language },
          components: [
            { type: 'body', parameters: [{ type: 'text', text: code }] },
            { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: code }] },
          ],
        },
      }),
    },
  };
}

async function deliver(phone, code) {
  if (whatsappConfigured()) {
    const { url, init } = whatsappTemplateRequest(phone, code);
    const res = await fetchImpl(url, init);
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      // Meta's error says why (template not approved, number not on WhatsApp…); no code in it.
      log.warn(`whatsapp otp: send to ${maskPhone(phone)} failed (${res.status}): ${body.slice(0, 300)}`);
      throw new PhoneOtpError('We couldn’t send a code to that number on WhatsApp. Check the number, or try again in a minute.', 'send_failed');
    }
    return;
  }
  if (isProduction()) throw new PhoneOtpError('Phone sign-in is not available.', 'send_failed');
  log.info(`[DEV] WhatsApp sign-in code for ${phone} (WhatsApp not configured): ${code}`);
}

/** Create and send a code. */
export async function startPhoneSignIn(db, phoneInput, ip, now = new Date()) {
  const phone = normalizePhone(phoneInput);
  if (!phone) throw new PhoneOtpError('Enter a valid mobile number, for example 98765 43210 or +91 98765 43210.', 'invalid_phone');

  await db.delete(phoneOtps).where(lt(phoneOtps.createdAt, new Date(now.getTime() - 86_400_000)));
  const count = async (where) => Number((await db.select({ n: sql`count(*)::int` }).from(phoneOtps).where(where))[0].n);
  const since = (ms) => new Date(now.getTime() - ms);
  if (await count(and(eq(phoneOtps.phone, phone), gte(phoneOtps.createdAt, since(15 * 60_000)))) >= LIMITS.per15MinPerPhone
    || await count(and(eq(phoneOtps.phone, phone), gte(phoneOtps.createdAt, since(86_400_000)))) >= LIMITS.perDayPerPhone
    || (ip && await count(and(eq(phoneOtps.requestIp, ip), gte(phoneOtps.createdAt, since(3_600_000)))) >= LIMITS.perHourPerIp)) {
    throw new PhoneOtpError('Too many codes requested. Please wait a few minutes and try again.', 'rate_limited');
  }

  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
  const [row] = await db.insert(phoneOtps).values({
    phone, codeHash: hashCode(phone, code), expiresAt: new Date(now.getTime() + CODE_TTL_MS), requestIp: ip || null,
  }).returning();
  try {
    await deliver(phone, code);
  } catch (err) {
    await db.delete(phoneOtps).where(eq(phoneOtps.id, row.id));
    throw err;
  }
  return { phone, expiresInSeconds: CODE_TTL_MS / 1000 };
}

/** Check a code. Returns the verified E.164 number. */
export async function verifyPhoneCode(db, phoneInput, codeInput, now = new Date()) {
  const phone = normalizePhone(phoneInput);
  const code = String(codeInput ?? '').replace(/\s/g, '');
  const invalid = new PhoneOtpError('That code is wrong or has expired.', 'invalid_code');
  if (!phone || !/^\d{6}$/.test(code)) throw invalid;

  const [row] = await db.select().from(phoneOtps)
    .where(and(eq(phoneOtps.phone, phone), isNull(phoneOtps.consumedAt), gte(phoneOtps.expiresAt, now)))
    .orderBy(desc(phoneOtps.createdAt)).limit(1);
  if (!row) throw invalid;
  if (row.attempts >= MAX_ATTEMPTS) {
    throw new PhoneOtpError('Too many wrong tries. Ask for a new code.', 'locked');
  }
  const a = Buffer.from(row.codeHash, 'hex'); const b = Buffer.from(hashCode(phone, code), 'hex');
  if (!crypto.timingSafeEqual(a, b)) {
    await db.update(phoneOtps).set({ attempts: sql`${phoneOtps.attempts} + 1` }).where(eq(phoneOtps.id, row.id));
    throw invalid;
  }
  // Single use, even if two requests race with the right code.
  const used = await db.update(phoneOtps).set({ consumedAt: now })
    .where(and(eq(phoneOtps.id, row.id), isNull(phoneOtps.consumedAt))).returning();
  if (used.length === 0) throw invalid;
  return phone;
}
