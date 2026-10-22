// GET /bidpilot/insights?days=7|30|90: the founder's live dashboard
// (src/bidpilot/insights.js). Anyone else gets 404, so the route's existence
// isn't advertised.
import express from 'express';
import { getDb } from '../../db/client.js';
import { log } from '../../logger.js';
import { config } from '../../config.js';
import { requireSession } from './auth.js';
import { insights, isAdmin } from '../insights.js';

export function createInsightsRouter() {
  const router = express.Router();

  router.get('/insights', requireSession(), async (req, res) => {
    if (!isAdmin(req.bidpilotUser, config.bidpilot.adminEmails)) {
      return res.status(404).json({ error: 'Not found.' });
    }
    try {
      res.set('Cache-Control', 'no-store');
      return res.json(await insights(getDb(), { days: req.query.days, adminEmails: config.bidpilot.adminEmails }));
    } catch (err) {
      log.error('bidpilot insights error:', err);
      return res.status(500).json({ error: 'Internal server error.' });
    }
  });

  return router;
}
