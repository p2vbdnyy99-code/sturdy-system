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
import { cleanNoneFields, missingProfileFields } from '../profileCompleteness.js';
import {
  listClients, getClient, createClient, renameClient, deleteClient, getClientProfile, upsertClientProfile,
  ClientNameTakenError, CLIENT_NAME_MAX,
} from '../repo/clients.js';

// Whitelisted against company_profiles' actual columns (src/db/schema/companyProfile.js)
// so a PATCH body can never write an arbitrary/unknown field through to the DB.
const PROFILE_FIELDS = [
  'industry', 'businessType', 'gstin', 'registrationDetails',
  'yearsInBusiness', 'annualTurnover', 'netWorth', 'employeeCount',
  'geography', 'certifications', 'licenses', 'equipment',
  'oemRelationships', 'experience', 'otherQualifications', 'noneFields',
];

function pickProfileFields(body) {
  const fields = {};
  for (const key of PROFILE_FIELDS) {
    if (body && Object.prototype.hasOwnProperty.call(body, key)) {
      fields[key] = body[key];
    }
  }
  if ('noneFields' in fields) fields.noneFields = cleanNoneFields(fields.noneFields);
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
      // `missing` lists the required fields still unanswered (all of them
      // when there is no profile row yet).
      return res.json(profile ? { ...profile, missing: missingProfileFields(profile) } : null);
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
      return res.json({ ...profile, missing: missingProfileFields(profile) });
    } catch (err) {
      handleError(res, err);
    }
  });

  // ── Clients (a consultant's client workspaces) ──────────────────────────
  // Each client has its own profile; tenders can be marked as being for a
  // client (PATCH /tenders/:id clientId) and are then checked against that
  // client's profile. All clients share the company's one plan.
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const cleanName = (v) => (typeof v === 'string' ? v.trim().replace(/\s+/g, ' ') : '');

  async function clientScope(req, res) {
    const scope = await requireCompanyAccess(getDb(), { userId: req.bidpilotUserId, companyId: req.params.id });
    if (!req.params.clientId) return { scope };
    const client = UUID_RE.test(req.params.clientId) ? await getClient(scope, req.params.clientId) : null;
    if (!client) { res.status(404).json({ error: 'Not found.' }); return null; }
    return { scope, client };
  }

  router.get('/companies/:id/clients', async (req, res) => {
    try {
      const ctx = await clientScope(req, res);
      if (!ctx) return;
      const list = await listClients(ctx.scope);
      const withStatus = await Promise.all(list.map(async (c) => {
        const missing = missingProfileFields(await getClientProfile(ctx.scope, c.id));
        return { id: c.id, name: c.name, profileComplete: missing.length === 0, missingCount: missing.length };
      }));
      return res.json({ clients: withStatus });
    } catch (err) {
      handleError(res, err);
    }
  });

  router.post('/companies/:id/clients', async (req, res) => {
    try {
      const ctx = await clientScope(req, res);
      if (!ctx) return;
      const name = cleanName(req.body?.name);
      if (!name) return res.status(400).json({ error: 'Write the client\'s name.' });
      if (name.length > CLIENT_NAME_MAX) return res.status(400).json({ error: `Keep the name under ${CLIENT_NAME_MAX} characters.` });
      const client = await createClient(ctx.scope, name);
      return res.status(201).json({ id: client.id, name: client.name, profileComplete: false, missingCount: missingProfileFields(null).length });
    } catch (err) {
      if (err instanceof ClientNameTakenError) return res.status(409).json({ error: err.message });
      handleError(res, err);
    }
  });

  router.patch('/companies/:id/clients/:clientId', async (req, res) => {
    try {
      const ctx = await clientScope(req, res);
      if (!ctx) return;
      const name = cleanName(req.body?.name);
      if (!name || name.length > CLIENT_NAME_MAX) return res.status(400).json({ error: 'Write the client\'s name.' });
      const client = await renameClient(ctx.scope, ctx.client.id, name);
      return res.json({ id: client.id, name: client.name });
    } catch (err) {
      if (err instanceof ClientNameTakenError) return res.status(409).json({ error: err.message });
      handleError(res, err);
    }
  });

  router.delete('/companies/:id/clients/:clientId', async (req, res) => {
    try {
      const ctx = await clientScope(req, res);
      if (!ctx) return;
      await deleteClient(ctx.scope, ctx.client.id);
      return res.json({ deleted: true });
    } catch (err) {
      handleError(res, err);
    }
  });

  router.get('/companies/:id/clients/:clientId/profile', async (req, res) => {
    try {
      const ctx = await clientScope(req, res);
      if (!ctx) return;
      const profile = await getClientProfile(ctx.scope, ctx.client.id);
      return res.json(profile ? { ...profile, missing: missingProfileFields(profile) } : null);
    } catch (err) {
      handleError(res, err);
    }
  });

  router.patch('/companies/:id/clients/:clientId/profile', async (req, res) => {
    try {
      const ctx = await clientScope(req, res);
      if (!ctx) return;
      const profile = await upsertClientProfile(ctx.scope, ctx.client.id, pickProfileFields(req.body));
      return res.json({ ...profile, missing: missingProfileFields(profile) });
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
