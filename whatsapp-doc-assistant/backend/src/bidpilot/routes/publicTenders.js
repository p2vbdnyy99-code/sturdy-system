// The public tender search (no sign-in): government tenders collected from
// CPPP's public lists, so visitors can see what TenderTez finds before they
// sign up. Read-only, rate-limited per IP; tracking a tender needs an
// account (routes/feed.js).

import express from 'express';
import { getDb } from '../../db/client.js';
import { log } from '../../logger.js';
import { allow } from '../../ratelimit.js';
import { parseFeedQuery, searchFeed, cachedFacets } from '../repo/publicTenders.js';
import { landingPagesFrom } from '../../landingPages.js';

const PER_MINUTE = 60;

export function createPublicTendersRouter() {
  const router = express.Router();
  const facets = cachedFacets();

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

  // The landing pages that exist now (src/landingPages.js), so the app can
  // show /government-tenders/<group>/<slug> with the right filter.
  router.get('/public/tenders/landing', async (_req, res) => {
    try {
      res.set('Cache-Control', 'public, max-age=300');
      return res.json({ pages: landingPagesFrom(await facets(getDb())) });
    } catch (err) {
      log.error('bidpilot landing pages error:', err);
      return res.status(500).json({ error: 'Internal server error.' });
    }
  });

  return router;
}
