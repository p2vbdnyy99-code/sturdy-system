// The public tender search (no sign-in): government tenders collected from
// CPPP's public lists, so visitors can see what TenderTez finds before they
// sign up. Read-only, rate-limited per IP; tracking a tender needs an
// account (routes/feed.js). Also "Bid document" for GeM bids: a redirect to
// the PDF on GeM (discovery/gemDocument.js).

import express from 'express';
import { eq } from 'drizzle-orm';
import { getDb } from '../../db/client.js';
import { publicTenders } from '../../db/schema/index.js';
import { gemDocumentUrl, isGemViewUrl } from '../discovery/gemDocument.js';
import { log } from '../../logger.js';
import { allow } from '../../ratelimit.js';
import { parseFeedQuery, searchFeed, cachedFacets } from '../repo/publicTenders.js';

const PER_MINUTE = 60;
const DOCUMENTS_PER_MINUTE = 20;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function createPublicTendersRouter() {
  const router = express.Router();
  const facets = cachedFacets();

  // Its own, smaller limit: each new bid costs one request to CPPP.
  router.get('/public/tenders/:id/document', async (req, res) => {
    if (!allow(`public-tender-doc:${req.ip}`, { limit: DOCUMENTS_PER_MINUTE })) {
      return res.status(429).json({ error: 'Too many requests. Please wait a minute.' });
    }
    if (!UUID_RE.test(req.params.id)) return res.status(404).json({ error: 'Not found.' });
    try {
      const [row] = await getDb().select({ kind: publicTenders.kind, url: publicTenders.url })
        .from(publicTenders).where(eq(publicTenders.id, req.params.id)).limit(1);
      if (!row || row.kind !== 'gem' || !isGemViewUrl(row.url)) return res.status(404).json({ error: 'No bid document link for this tender.' });
      let target = row.url; // the GeM page, if the document link can't be found
      try {
        target = (await gemDocumentUrl(row.url)) ?? row.url;
      } catch (err) {
        log.info(`bidpilot gem document: lookup failed (${String(err?.message || err).slice(0, 120)})`);
      }
      res.set('Cache-Control', 'no-store');
      return res.redirect(302, target);
    } catch (err) {
      log.error('bidpilot gem document error:', err);
      return res.status(500).json({ error: 'Internal server error.' });
    }
  });

  router.use('/public/tenders', (req, res, next) => {
    if (!allow(`public-tenders:${req.ip}`, { limit: PER_MINUTE })) {
      return res.status(429).json({ error: 'Too many requests. Please wait a minute.' });
    }
    res.set('Cache-Control', 'public, max-age=60');
    return next();
  });

  router.get('/public/tenders', async (req, res) => {
    const parsed = parseFeedQuery(req.query);
    if (!parsed.ok) return res.status(400).json({ error: parsed.error });
    try {
      return res.json(await searchFeed(getDb(), parsed.filters));
    } catch (err) {
      log.error('bidpilot public tenders error:', err);
      return res.status(500).json({ error: 'Internal server error.' });
    }
  });

  router.get('/public/tenders/facets', async (_req, res) => {
    try {
      return res.json(await facets(getDb()));
    } catch (err) {
      log.error('bidpilot public tender facets error:', err);
      return res.status(500).json({ error: 'Internal server error.' });
    }
  });

  return router;
}
