// The tender feed: public tenders collected from the CPPP latest-tenders page
// (discovery/collector.js), searchable by any signed-in user, and "Track" to
// add one to a company's tenders (without its document, which the user
// attaches from the portal). Public notices only; nothing company-specific is
// stored in public_tenders.

import express from 'express';
import { and, asc, desc, gte, ilike, lt, or, sql, eq } from 'drizzle-orm';
import { getDb } from '../../db/client.js';
import { log } from '../../logger.js';
import { config } from '../../config.js';
import { publicTenders, tenders } from '../../db/schema/index.js';
import { requireSession } from './auth.js';
import { requireCsrf } from '../auth/csrf.js';
import { requireCompanyAccess, TenantAccessError } from '../repo/tenants.js';
import { createTender } from '../repo/tenders.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CLOSING_SOON_DAYS = 7;

export function createFeedRouter() {
  const router = express.Router();
  router.use(express.json());
  router.use('/feed', requireSession());
  router.use('/feed', requireCsrf());

  // ?search=&when=open|closing|closed|all&page=&limit=
  router.get('/feed', async (req, res) => {
    try {
      const db = getDb();
      const now = new Date();
      const conditions = [];
      const search = typeof req.query.search === 'string' ? req.query.search.trim().slice(0, 100) : '';
      if (search) {
        const p = `%${search}%`;
        conditions.push(or(ilike(publicTenders.title, p), ilike(publicTenders.organisation, p), ilike(publicTenders.reference, p)));
      }
      const when = ['open', 'closing', 'closed', 'all'].includes(req.query.when) ? req.query.when : 'open';
      const soon = new Date(now.getTime() + CLOSING_SOON_DAYS * 86400000);
      if (when === 'open') conditions.push(gte(publicTenders.closingAt, now));
      if (when === 'closing') conditions.push(and(gte(publicTenders.closingAt, now), lt(publicTenders.closingAt, soon)));
      if (when === 'closed') conditions.push(lt(publicTenders.closingAt, now));
      const where = conditions.length ? and(...conditions) : undefined;
      const limit = Math.min(Math.max(1, Number.parseInt(req.query.limit, 10) || 25), 100);
      const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
      const order = when === 'closed' ? desc(publicTenders.closingAt) : asc(publicTenders.closingAt);
      const [rows, [{ count }], [range]] = await Promise.all([
        db.select().from(publicTenders).where(where).orderBy(order, desc(publicTenders.publishedAt)).limit(limit).offset((page - 1) * limit),
        db.select({ count: sql`count(*)::int` }).from(publicTenders).where(where),
        db.select({ first: sql`min(${publicTenders.firstSeenAt})`, last: sql`max(${publicTenders.lastSeenAt})`, all: sql`count(*)::int` }).from(publicTenders),
      ]);
      return res.json({
        tenders: rows.map((r) => ({
          id: r.id, source: r.source, title: r.title, reference: r.reference, organisation: r.organisation,
          publishedAt: r.publishedAt, closingAt: r.closingAt, openingAt: r.openingAt, url: r.url,
        })),
        total: count, page, limit,
        coverage: { collecting: config.bidpilot.discovery.cppp, since: range?.first ?? null, lastUpdate: range?.last ?? null, stored: range?.all ?? 0 },
      });
    } catch (err) {
      handleError(res, err);
    }
  });

  // Add a public tender to the company's tenders, without a document.
  router.post('/feed/:id/track', async (req, res) => {
    try {
      const db = getDb();
      const scope = await requireCompanyAccess(db, { userId: req.bidpilotUserId, companyId: req.body?.companyId });
      if (!UUID_RE.test(req.params.id)) return res.status(404).json({ error: 'Not found.' });
      const [pt] = await db.select().from(publicTenders).where(eq(publicTenders.id, req.params.id)).limit(1);
      if (!pt) return res.status(404).json({ error: 'Not found.' });
      const [existing] = await db.select({ id: tenders.id }).from(tenders)
        .where(and(eq(tenders.companyId, scope.companyId), eq(tenders.portalUrl, pt.url))).limit(1);
      if (existing) return res.json({ tenderId: existing.id, alreadyTracked: true });
      const tender = await createTender(scope, {
        title: pt.title,
        organization: pt.organisation,
        tenderNumber: pt.reference,
        submissionDeadline: pt.closingAt,
        openingDate: pt.openingAt,
        portalUrl: pt.url,
        portalRef: pt.reference,
        source: 'feed',
        status: 'INTERESTED',
        // No document yet: nothing to process. The tender page asks for the
        // PDF (POST /tenders/:id/document) before it can be analysed.
        processingStatus: 'COMPLETED',
        createdBy: req.bidpilotUserId,
      });
      return res.status(201).json({ tenderId: tender.id, alreadyTracked: false });
    } catch (err) {
      handleError(res, err);
    }
  });

  return router;
}

function handleError(res, err) {
  if (err instanceof TenantAccessError) return res.status(403).json({ error: 'Not authorized for this company.' });
  log.error('bidpilot feed route error:', err);
  return res.status(500).json({ error: 'Internal server error.' });
}
