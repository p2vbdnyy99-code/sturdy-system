// Company creation (onboarding) and company profile read/write.
// -----------------------------------------------------------------------------
// Company creation is deliberately NOT behind requireCompanyAccess — a user
// creating their first company doesn't have access to it yet (that's the
// whole point). Profile read/write IS company-scoped, same pattern as every
// other tenant-owned resource in this codebase.

import express from 'express';
import { getDb } from '../../db/client.js';
import { log } from '../../logger.js';
import { requireSession } from './auth.js';
import { requireCsrf } from '../auth/csrf.js';
import { requireCompanyAccess, TenantAccessError } from '../repo/tenants.js';
import { createCompanyForUser, getCompanyProfile, upsertCompanyProfile } from '../repo/companies.js';

// Whitelisted against company_profiles' actual columns (src/db/schema/companyProfile.js)
// so a PATCH body can never write an arbitrary/unknown field through to the DB.
const PROFILE_FIELDS = [
  'industry', 'businessType', 'gstin', 'registrationDetails',
  'yearsInBusiness', 'annualTurnover', 'netWorth', 'employeeCount',
  'geography', 'certifications', 'licenses', 'equipment',
  'oemRelationships', 'experience', 'otherQualifications',
];

function pickProfileFields(body) {
  const fields = {};
  for (const key of PROFILE_FIELDS) {
    if (body && Object.prototype.hasOwnProperty.call(body, key)) {
      fields[key] = body[key];
    }
  }
  return fields;
}

export function createCompaniesRouter() {
  const router = express.Router();
  router.use(express.json());
  router.use('/companies', requireSession());
  router.use('/companies', requireCsrf());

  router.post('/companies', async (req, res) => {
    try {
      const { name, industry, businessType } = req.body || {};
      if (!name || typeof name !== 'string' || !name.trim()) {
        return res.status(400).json({ error: 'A company name is required.' });
      }
      const db = getDb();
      const { company } = await createCompanyForUser(db, req.bidpilotUserId, {
        name: name.trim(),
        industry: typeof industry === 'string' && industry.trim() ? industry.trim() : undefined,
        businessType: typeof businessType === 'string' && businessType.trim() ? businessType.trim() : undefined,
      });
      return res.status(201).json({ companyId: company.id, name: company.name, role: 'owner' });
    } catch (err) {
      log.error('bidpilot company create error:', err);
      return res.status(500).json({ error: 'Internal server error.' });
    }
  });

  router.get('/companies/:id/profile', async (req, res) => {
    try {
      const db = getDb();
      await requireCompanyAccess(db, { userId: req.bidpilotUserId, companyId: req.params.id });
      const profile = await getCompanyProfile(db, req.params.id);
      return res.json(profile || null);
    } catch (err) {
      handleError(res, err);
    }
  });

  router.patch('/companies/:id/profile', async (req, res) => {
    try {
      const db = getDb();
      await requireCompanyAccess(db, { userId: req.bidpilotUserId, companyId: req.params.id });
      const fields = pickProfileFields(req.body);
      const profile = await upsertCompanyProfile(db, req.params.id, fields);
      return res.json(profile);
    } catch (err) {
      handleError(res, err);
    }
  });

  return router;
}

function handleError(res, err) {
  if (err instanceof TenantAccessError) {
    return res.status(403).json({ error: 'Not authorized for this company.' });
  }
  log.error('bidpilot companies route error:', err);
  return res.status(500).json({ error: 'Internal server error.' });
}
