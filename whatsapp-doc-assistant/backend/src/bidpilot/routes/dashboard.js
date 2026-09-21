// Dashboard summary — the "what needs attention" answer, aggregated
// server-side (see repo/tenders.js's getDashboardSummary docblock for why
// this isn't derived from the paginated tender list client-side).
import express from 'express';
import { getDb } from '../../db/client.js';
import { log } from '../../logger.js';
import { requireSession } from './auth.js';
import { requireCompanyAccess, TenantAccessError } from '../repo/tenants.js';
import { getDashboardSummary } from '../repo/tenders.js';

export function createDashboardRouter() {
  const router = express.Router();
  router.use('/dashboard', requireSession());

  router.get('/dashboard/summary', async (req, res) => {
    try {
      const db = getDb();
      const scope = await requireCompanyAccess(db, {
        userId: req.bidpilotUserId,
        companyId: req.query.companyId,
      });
      const summary = await getDashboardSummary(scope);
      return res.json(summary);
    } catch (err) {
      if (err instanceof TenantAccessError) {
        return res.status(403).json({ error: 'Not authorized for this company.' });
      }
      log.error('bidpilot dashboard route error:', err);
      return res.status(500).json({ error: 'Internal server error.' });
    }
  });

  return router;
}
