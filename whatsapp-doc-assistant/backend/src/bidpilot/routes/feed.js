// The tender feed inside the app: the same search as the public tender page
// (repo/publicTenders.js), plus "Track" to add a tender to a company's
// tenders (without its document, which the user attaches from the portal).
// Public notices only; nothing company-specific is stored in public_tenders.

import express from 'express';
import { and, eq } from 'drizzle-orm';
import { getDb } from '../../db/client.js';
import { log } from '../../logger.js';
import { config } from '../../config.js';
import { publicTenders, tenders } from '../../db/schema/index.js';
import { requireSession } from './auth.js';
import { requireCsrf } from '../auth/csrf.js';
import { requireCompanyAccess, TenantAccessError } from '../repo/tenants.js';
import { createTender } from '../repo/tenders.js';
import { parseFeedQuery, searchFeed, toFeedRow } from '../repo/publicTenders.js';
import {
  parseSavedFilters, listSavedSearches, createSavedSearch, deleteSavedSearch, listMatches, markSeen, unseenCount,
  SavedSearchLimitError,
} from '../repo/savedSearches.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function createFeedRouter() {
  const router = express.Router();
  router.use(express.json());
  router.use('/feed', requireSession());
  router.use('/feed', requireCsrf());

  // Same filters as GET /public/tenders.
  router.get('/feed', async (req, res) => {
    const parsed = parseFeedQuery(req.query);
    if (!parsed.ok) return res.status(400).json({ error: parsed.error });
    try {
      const result = await searchFeed(getDb(), parsed.filters);
      return res.json({ ...result, collecting: config.bidpilot.discovery.cppp });
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
      const { find } = toFeedRow(pt);
      // The same tender tracked twice is found by the portal's tender id.
      const portalRef = pt.tenderId ?? pt.reference;
      const sameTender = portalRef ? eq(tenders.portalRef, portalRef) : eq(tenders.portalUrl, find.url);
      const [existing] = await db.select({ id: tenders.id }).from(tenders)
        .where(and(eq(tenders.companyId, scope.companyId), sameTender)).limit(1);
      if (existing) return res.json({ tenderId: existing.id, alreadyTracked: true });
      const tender = await createTender(scope, {
        title: pt.title,
        organization: pt.organisation ?? pt.department ?? pt.state,
        tenderNumber: pt.reference ?? pt.tenderId,
        submissionDeadline: pt.closingAt,
        openingDate: pt.openingAt,
        portalUrl: find.url,
        portalRef,
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

  // ── Saved searches and their alerts (repo/savedSearches.js) ─────────────
  const scopeFor = (req, companyId) => requireCompanyAccess(getDb(), { userId: req.bidpilotUserId, companyId });

  router.get('/feed/searches', async (req, res) => {
    try {
      const scope = await scopeFor(req, req.query.companyId);
      return res.json({ searches: await listSavedSearches(scope), unseen: await unseenCount(scope) });
    } catch (err) {
      handleError(res, err);
    }
  });

  router.post('/feed/searches', async (req, res) => {
    try {
      const scope = await scopeFor(req, req.body?.companyId);
      const parsed = parseSavedFilters(req.body?.filters);
      if (!parsed.ok) return res.status(400).json({ error: parsed.error });
      const saved = await createSavedSearch(scope, { name: req.body?.name, filters: parsed.filters }, req.bidpilotUserId);
      return res.status(201).json(saved);
    } catch (err) {
      if (err instanceof SavedSearchLimitError) return res.status(400).json({ error: err.message });
      handleError(res, err);
    }
  });

  router.delete('/feed/searches/:sid', async (req, res) => {
    try {
      const scope = await scopeFor(req, req.body?.companyId ?? req.query.companyId);
      if (!UUID_RE.test(req.params.sid)) return res.status(404).json({ error: 'Not found.' });
      if (!(await deleteSavedSearch(scope, req.params.sid))) return res.status(404).json({ error: 'Not found.' });
      return res.json({ deleted: true });
    } catch (err) {
      handleError(res, err);
    }
  });

  router.get('/feed/alerts', async (req, res) => {
    try {
      const scope = await scopeFor(req, req.query.companyId);
      const savedSearchId = typeof req.query.savedSearchId === 'string' && UUID_RE.test(req.query.savedSearchId) ? req.query.savedSearchId : null;
      return res.json({ matches: await listMatches(scope, { savedSearchId }) });
    } catch (err) {
      handleError(res, err);
    }
  });

  router.post('/feed/alerts/seen', async (req, res) => {
    try {
      const scope = await scopeFor(req, req.body?.companyId);
      const ids = req.body?.matchIds;
      if (ids !== undefined && (!Array.isArray(ids) || ids.length > 200 || !ids.every((id) => typeof id === 'string' && UUID_RE.test(id)))) {
        return res.status(400).json({ error: 'matchIds must be a list of ids.' });
      }
      return res.json({ marked: await markSeen(scope, ids ?? null), unseen: await unseenCount(scope) });
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
