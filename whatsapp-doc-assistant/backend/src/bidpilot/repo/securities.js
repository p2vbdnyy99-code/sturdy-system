// EMD and performance security for a company's tenders (tender_securities):
// what was given, how, and whether it came back. Everything here is the
// user's own record; nothing is read from the document except the EMD hint
// the tender page shows next to the form.
//
// Callers confirm the tender belongs to the scope's company (getTender)
// before list/create; update and delete also match the company and tender.

import { and, asc, eq, sql } from 'drizzle-orm';
import { tenderSecurities, tenders } from '../../db/schema/index.js';

export const KINDS = ['EMD', 'PERFORMANCE'];
export const MODES = ['ONLINE', 'DD', 'BG', 'FDR', 'EXEMPTED', 'NOT_REQUIRED'];
export const STATUSES = ['TO_ARRANGE', 'SUBMITTED', 'RETURNED', 'FORFEITED'];
/** Modes where money (or a bank's promise) is actually held by the buyer. */
export const HELD_MODES = ['ONLINE', 'DD', 'BG', 'FDR'];
export const MAX_PER_TENDER = 10;
export const EXPIRY_WINDOW_DAYS = 30;
const TEXT_MAX = { reference: 120, bank: 120, notes: 1000 };
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseAmount(v) {
  if (v === null || v === undefined || v === '') return { ok: true, value: null };
  const n = typeof v === 'number' ? v : Number(String(v).replace(/[₹,\s]/g, '').replace(/^rs\.?/i, ''));
  if (!Number.isFinite(n) || n < 0 || n > 1e12) return { ok: false };
  return { ok: true, value: n.toFixed(2) };
}

function parseDate(v) {
  if (v === null || v === undefined || v === '') return { ok: true, value: null };
  if (typeof v !== 'string' || !DATE_RE.test(v) || Number.isNaN(Date.parse(`${v}T00:00:00Z`))) return { ok: false };
  // Round-trips only for a real calendar date (no 2026-02-30).
  if (new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) !== v) return { ok: false };
  return { ok: true, value: v };
}

/**
 * Checks a create (all of kind and mode needed) or edit (only what is sent).
 * @returns {{ ok: true, values: object } | { ok: false, error: string }}
 */
export function parseSecurity(body, { partial = false } = {}) {
  const b = body ?? {};
  const has = (k) => Object.prototype.hasOwnProperty.call(b, k);
  const values = {};
  if (!partial || has('kind')) {
    if (!KINDS.includes(b.kind)) return { ok: false, error: 'Choose EMD or performance security.' };
    values.kind = b.kind;
  }
  if (!partial || has('mode')) {
    if (!MODES.includes(b.mode)) return { ok: false, error: 'Choose how it is given (online, DD, BG, FDR, exempt or not required).' };
    values.mode = b.mode;
  }
  if (has('status')) {
    if (!STATUSES.includes(b.status)) return { ok: false, error: 'Unknown status.' };
    values.status = b.status;
  }
  if (has('amount')) {
    const a = parseAmount(b.amount);
    if (!a.ok) return { ok: false, error: 'The amount must be a number of rupees.' };
    values.amount = a.value;
  }
  for (const k of ['reference', 'bank', 'notes']) {
    if (!has(k)) continue;
    if (b[k] !== null && typeof b[k] !== 'string') return { ok: false, error: `${k} must be text.` };
    const v = b[k] === null ? null : b[k].trim() || null;
    if (v && v.length > TEXT_MAX[k]) return { ok: false, error: `Keep ${k} under ${TEXT_MAX[k]} characters.` };
    values[k] = v;
  }
  for (const k of ['issuedOn', 'validUntil', 'claimUntil']) {
    if (!has(k)) continue;
    const d = parseDate(b[k]);
    if (!d.ok) return { ok: false, error: 'Dates must be real dates (YYYY-MM-DD).' };
    values[k] = d.value;
  }
  if (values.issuedOn && values.validUntil && values.validUntil < values.issuedOn) {
    return { ok: false, error: 'The expiry date is before the issue date.' };
  }
  if (values.validUntil && values.claimUntil && values.claimUntil < values.validUntil) {
    return { ok: false, error: 'The claim date is before the expiry date.' };
  }
  return { ok: true, values };
}

export function toSecurityRow(r) {
  return {
    id: r.id,
    kind: r.kind,
    mode: r.mode,
    amount: r.amount === null ? null : Number(r.amount),
    reference: r.reference,
    bank: r.bank,
    issuedOn: r.issuedOn,
    validUntil: r.validUntil,
    claimUntil: r.claimUntil,
    status: r.status,
    notes: r.notes,
    updatedAt: r.updatedAt,
  };
}

export async function listSecurities(scope, tenderId) {
  const rows = await scope.db.select().from(tenderSecurities)
    .where(and(eq(tenderSecurities.tenderId, tenderId), eq(tenderSecurities.companyId, scope.companyId)))
    .orderBy(asc(tenderSecurities.createdAt));
  return rows.map(toSecurityRow);
}

export class TooManySecuritiesError extends Error {}

export async function createSecurity(scope, tenderId, values, userId) {
  const [{ n }] = await scope.db.select({ n: sql`count(*)::int` }).from(tenderSecurities)
    .where(and(eq(tenderSecurities.tenderId, tenderId), eq(tenderSecurities.companyId, scope.companyId)));
  if (n >= MAX_PER_TENDER) throw new TooManySecuritiesError(`A tender can have at most ${MAX_PER_TENDER} entries.`);
  const row = await scope.insertOwned(tenderSecurities, 'companyId', { ...values, tenderId, createdBy: userId });
  return toSecurityRow(row);
}

export async function updateSecurity(scope, tenderId, id, values) {
  const [row] = await scope.db.update(tenderSecurities)
    .set({ ...values, updatedAt: new Date() })
    .where(and(eq(tenderSecurities.id, id), eq(tenderSecurities.tenderId, tenderId), eq(tenderSecurities.companyId, scope.companyId)))
    .returning();
  return row ? toSecurityRow(row) : null;
}

export async function deleteSecurity(scope, tenderId, id) {
  const rows = await scope.db.delete(tenderSecurities)
    .where(and(eq(tenderSecurities.id, id), eq(tenderSecurities.tenderId, tenderId), eq(tenderSecurities.companyId, scope.companyId)))
    .returning({ id: tenderSecurities.id });
  return rows.length > 0;
}

/** India's date today, YYYY-MM-DD. */
export function istToday(now = Date.now()) {
  return new Date(now + 330 * 60_000).toISOString().slice(0, 10);
}

function addDays(day, n) {
  return new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
}

/**
 * The company's money with buyers: entries SUBMITTED by a mode that holds
 * money, their total, and bank guarantees that expire within 30 days or have
 * expired while still not returned.
 */
export async function securitiesOverview(scope, today = istToday()) {
  const rows = await scope.db.select({ s: tenderSecurities, title: tenders.title, tenderNumber: tenders.tenderNumber })
    .from(tenderSecurities)
    .innerJoin(tenders, and(eq(tenders.id, tenderSecurities.tenderId), eq(tenders.companyId, scope.companyId)))
    .where(and(eq(tenderSecurities.companyId, scope.companyId), eq(tenderSecurities.status, 'SUBMITTED')))
    .orderBy(asc(tenderSecurities.validUntil), asc(tenderSecurities.createdAt));
  const held = rows.filter((r) => HELD_MODES.includes(r.s.mode));
  const until = addDays(today, EXPIRY_WINDOW_DAYS);
  const item = (r) => ({
    ...toSecurityRow(r.s),
    tenderId: r.s.tenderId,
    tenderTitle: r.title,
    tenderNumber: r.tenderNumber,
  });
  return {
    held: {
      count: held.length,
      amount: held.reduce((sum, r) => sum + (r.s.amount === null ? 0 : Number(r.s.amount)), 0),
      unknownAmounts: held.filter((r) => r.s.amount === null).length,
    },
    expiringSoon: held.filter((r) => r.s.mode === 'BG' && r.s.validUntil && r.s.validUntil >= today && r.s.validUntil <= until).map(item),
    expired: held.filter((r) => r.s.mode === 'BG' && r.s.validUntil && r.s.validUntil < today).map(item),
    items: held.map(item),
  };
}
