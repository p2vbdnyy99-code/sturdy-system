// Conversion events for Google Analytics, sent by the server (Nov 2026):
// sign_up, upload, analysis_complete and plan_click (ga4.js buildEvent says
// what each carries). So Google Analytics can show which pages and sources
// lead to sign-ups, uploads, analyses and plan interest, next to the page
// views it already gets. The site's own numbers stay in the database
// (/insights); this only feeds GA4.
//
// Never for the TenderTez team (staff.js): not for a team account, not from
// a browser with the staff marker, and not when a team member's company, or
// a tender the team uploaded or started (noteTeamTender), finishes an
// analysis. Sending never blocks or fails what triggered it.
// Off until server.js configures it (GA4 settings present).

import { eq } from 'drizzle-orm';
import { companyMembers, users } from '../db/schema/index.js';
import { isAdmin } from './insights.js';
import { hasStaffMarker } from './staff.js';

let send = null;
let visitorOf = () => null;
let adminEmails = [];

// Tenders the team touched: uploaded, given a document or sent to analysis
// from a team account or a browser with the staff marker. Their analysis
// finishes in the background with no request to look at, so this is how
// analysis_complete knows to stay quiet when a team member tests with an
// account that isn't in BIDPILOT_ADMIN_EMAILS. In memory (no schema change):
// a restart between the upload and the end of its analysis forgets the
// tender, and that one analysis_complete would be sent. Bounded, oldest
// dropped first; only the team's own tenders are ever added.
const TEAM_TENDERS_MAX = 5000;
const teamTenders = new Set();

/**
 * `sender(event)` posts one event (ga4.js createGa4EventSender), or null for
 * off. `visitorOfRequest(req)` gives `{ day, visitorId }`, the same daily
 * anonymous id as the visit counter (visits.js), or null.
 */
export function configureConversions({ sender = null, visitorOfRequest = () => null, admins = [] } = {}) {
  send = sender;
  visitorOf = visitorOfRequest;
  adminEmails = admins;
  teamTenders.clear();
}

/** Whether this request is the team's own: a team account, or a browser
 *  with the staff marker (staff.js). */
export function isTeamRequest({ req = null, user = null } = {}) {
  try {
    return Boolean((user && isAdmin(user, adminEmails)) || (req && hasStaffMarker(req)));
  } catch {
    return false;
  }
}

/** Remembers `tenderId` as the team's when this request is the team's, so
 *  its analysis_complete is never sent. Call it before the analysis can
 *  start. Never throws. */
export function noteTeamTender(tenderId, { req = null, user = null } = {}) {
  if (!tenderId || !isTeamRequest({ req, user })) return;
  const id = String(tenderId);
  teamTenders.delete(id);
  if (teamTenders.size >= TEAM_TENDERS_MAX) teamTenders.delete(teamTenders.values().next().value);
  teamTenders.add(id);
}

/** One event, fire-and-forget. `req` ties it to the visitor's day; `user`
 *  (when known) leaves the team's own accounts out. Never throws. */
export function trackConversion(name, { req = null, user = null, params = {} } = {}) {
  if (!send) return;
  try {
    if (isTeamRequest({ req, user })) return;
    const visitor = req ? visitorOf(req) : null;
    Promise.resolve(send({ name, params, visitorId: visitor?.visitorId ?? null, day: visitor?.day ?? null })).catch(() => {});
  } catch {
    // Analytics never breaks what it measures.
  }
}

/** Whether any member of the company is a team account. */
export async function companyHasStaff(db, companyId) {
  if (!adminEmails.length) return false;
  const rows = await db.select({ email: users.email })
    .from(companyMembers)
    .innerJoin(users, eq(users.id, companyMembers.userId))
    .where(eq(companyMembers.companyId, companyId));
  return rows.some((r) => isAdmin(r, adminEmails));
}

/** A background event for a company (no request): skipped for the team's
 *  own companies, and for a tender the team touched (noteTeamTender).
 *  Never throws. */
export async function trackCompanyConversion(db, companyId, name, params = {}, { tenderId = null } = {}) {
  if (!send) return;
  try {
    if (tenderId && teamTenders.has(String(tenderId))) return;
    if (await companyHasStaff(db, companyId)) return;
    trackConversion(name, { params });
  } catch {
    // Analytics never breaks what it measures.
  }
}
