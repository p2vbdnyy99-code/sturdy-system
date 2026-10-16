// BidPilot tender ingestion routes — deliberately mounted under /bidpilot in
// server.js, entirely separate from Papyr's WhatsApp /webhook handling. This
// router does not import router.js/whatsapp.js, and nothing there imports this.

import express from 'express';
import multer from 'multer';
import { getDb } from '../../db/client.js';
import { log } from '../../logger.js';
import { requireSession } from './auth.js';
import { requireCsrf } from '../auth/csrf.js';
import { requireCompanyAccess, TenantAccessError } from '../repo/tenants.js';
import { getTender, startAnalysis, listTendersPaginated, updateTenderTracking, updateProcessingStatus, NOTES_MAX } from '../repo/tenders.js';
import {
  getChecklist, setRequirementDone, addCustomItem, setCustomDone, deleteCustomItem, CUSTOM_LABEL_MAX,
} from '../repo/checklist.js';
import { buildChecklistXlsx } from '../checklistXlsx.js';
import {
  parseSecurity, listSecurities, createSecurity, updateSecurity, deleteSecurity, TooManySecuritiesError,
} from '../repo/securities.js';
import { createCorrigendum, listCorrigenda, getCorrigendum, finishCorrigendum, applyCorrigendum } from '../repo/corrigenda.js';
import { askForChanges, validateCorrigendumResult, APPLICABLE_FIELDS, CORRIGENDUM_FIELDS } from '../analysis/corrigendum.js';
import { withAnalysisSlot, safeErrorMessage } from '../analysis/pipeline.js';
import { parseTenderDate } from '../analysis/dates.js';
import { validateUpload } from '../ingestion/validate.js';
import { extractStructured } from '../../pdf.js';
import { spansToText } from '../../extract/spans.js';
import { recordChunkUsage } from '../analysis/budget.js';
import { getClient, getClientProfile } from '../repo/clients.js';
import { getCompanyProfile } from '../repo/companies.js';
import { findFormats, formatSource, draftFormat, validateDraft } from '../analysis/annexures.js';
import { listDrafts, getDraft, saveDraft } from '../repo/annexures.js';
import { buildAnnexureDocx, draftValues, draftCoverage } from '../annexureDocx.js';
import { assertAnnexureBudget, recordAnnexureUsage } from '../analysis/budget.js';
import { companies } from '../../db/schema/index.js';
import { eq } from 'drizzle-orm';
import { listPages } from '../repo/pages.js';
import { listDocumentsForTender, createTenderDocument } from '../repo/documents.js';
import { sha256 } from '../ingestion/hash.js';
import { listRequirements, listEvidenceForRequirement } from '../repo/requirements.js';
import { listBoq } from '../repo/boq.js';
import { listDates } from '../repo/dates.js';
import { listRedFlags } from '../repo/redFlags.js';
import { listEvents, getLatestAnalysisEvent } from '../repo/events.js';
import { ingestUpload, processExtraction } from '../ingestion/pipeline.js';
import { ValidationError } from '../ingestion/validate.js';
import { getStorage } from '../storage/index.js';
import { chunkPages } from '../analysis/chunker.js';
import { assertAnalysisBudget, AnalysisBudgetError, claimTenderSlot } from '../analysis/budget.js';
import { runAnalysis } from '../analysis/pipeline.js';
import { runEligibility, EligibilityError } from '../analysis/eligibilityPipeline.js';
import { config } from '../../config.js';
import { tenderStatus, tenderAnalysisStatus } from '../../db/schema/enums.js';
import { OVERVIEW_FIELDS } from '../analysis/schema.js';
import { profileNeededFor, PROFILE_REQUIRED_MESSAGE, FREE_TENDERS_WITHOUT_PROFILE } from '../profileGate.js';

// multer buffers the upload in memory (never touches disk itself) — fine at
// this size ceiling (BIDPILOT_MAX_UPLOAD_MB, default 50MB); a much larger
// limit would warrant streaming instead.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.bidpilot.maxUploadBytes },
});

export function createTendersRouter() {
  const router = express.Router();
  router.use(express.json());
  // Scoped to /tenders explicitly (not a bare router.use(requireSession()))
  // so mounting this router alongside download.js's router at the same
  // /bidpilot prefix can never accidentally gate the signed-URL download
  // route behind a session cookie — a signed URL is meant to be
  // self-authorizing, with no separate auth check at all.
  router.use('/tenders', requireSession());
  // CSRF is self-exempting for GET/HEAD/OPTIONS (see csrf.js), so applying it
  // to the whole /tenders subtree only actually gates the state-changing
  // upload route — safe to apply broadly rather than per-route.
  router.use('/tenders', requireCsrf());

  router.post('/tenders/upload', (req, res) => {
    upload.single('file')(req, res, async (multerErr) => {
      if (multerErr) {
        // multer's own errors (e.g. LIMIT_FILE_SIZE) — never leak internals.
        return res.status(413).json({ error: 'Upload rejected (file too large or malformed).' });
      }
      try {
        await handleUpload(req, res);
      } catch (err) {
        handleError(res, err);
      }
    });
  });

  router.get('/tenders', async (req, res) => {
    try {
      const db = getDb();
      const scope = await requireCompanyAccess(db, {
        userId: req.bidpilotUserId,
        companyId: req.query.companyId,
      });

      const { status, analysisStatus, search, sortBy, sortOrder } = req.query;
      if (status && !tenderStatus.enumValues.includes(status)) {
        return res.status(400).json({ error: `Invalid status. Must be one of: ${tenderStatus.enumValues.join(', ')}` });
      }
      if (analysisStatus && !tenderAnalysisStatus.enumValues.includes(analysisStatus)) {
        return res.status(400).json({ error: `Invalid analysisStatus. Must be one of: ${tenderAnalysisStatus.enumValues.join(', ')}` });
      }
      const { clientId } = req.query;
      if (clientId && clientId !== 'none' && !UUID_RE.test(clientId)) {
        return res.status(400).json({ error: "clientId must be a client's id or 'none'." });
      }
      if (sortBy && !['deadline', 'createdAt'].includes(sortBy)) {
        return res.status(400).json({ error: "sortBy must be 'deadline' or 'createdAt'." });
      }
      if (sortOrder && !['asc', 'desc'].includes(sortOrder)) {
        return res.status(400).json({ error: "sortOrder must be 'asc' or 'desc'." });
      }

      const page = Number.parseInt(req.query.page, 10) || 1;
      const limit = Number.parseInt(req.query.limit, 10) || 20;

      const result = await listTendersPaginated(scope, {
        page, limit, status, analysisStatus, search, clientId, sortBy, sortOrder,
      });
      return res.json(result);
    } catch (err) {
      handleError(res, err);
    }
  });

  router.get('/tenders/:id', async (req, res) => {
    try {
      const db = getDb();
      const scope = await requireCompanyAccess(db, {
        userId: req.bidpilotUserId,
        companyId: req.query.companyId,
      });
      const tender = await getTender(scope, req.params.id);
      if (!tender) return res.status(404).json({ error: 'Not found.' });

      const [pages, requirements, boq, dates, redFlags, documents, activity, analysisEvent] = await Promise.all([
        listPages(scope, tender.id),
        listRequirements(scope, tender.id),
        listBoq(scope, tender.id),
        listDates(scope, tender.id),
        listRedFlags(scope, tender.id),
        listDocumentsForTender(scope, tender.id),
        listEvents(scope, tender.id),
        getLatestAnalysisEvent(scope, tender.id),
      ]);

      // Null for runs from before section counts were recorded, and for
      // tenders never analyzed — the UI shows no coverage warning either way.
      const meta = analysisEvent?.metadata;
      const analysisCoverage = meta && Number.isInteger(meta.chunkCount)
        ? { sections: meta.chunkCount, failedSections: meta.failedChunkCount ?? 0 }
        : null;

      const requirementsWithEvidence = await Promise.all(
        requirements.map(async (r) => ({
          id: r.id,
          category: r.category,
          title: r.title,
          description: r.description,
          mandatory: r.mandatory,
          evidence: (await listEvidenceForRequirement(scope, r.id)).map((e) => ({
            sourcePage: e.sourcePage,
            evidenceText: e.evidenceText,
            extractedValue: e.extractedValue,
            confidence: e.confidence,
          })),
          // Milestone 6 — previously written by POST .../eligibility but
          // never surfaced here, so a result was invisible outside the
          // one-shot response of the run that produced it. Fixed as part of
          // the eligibility-evidence redesign.
          companyStatus: r.companyStatus,
          actionRequired: r.actionRequired,
          companyEvidence: r.companyEvidence || [],
        })),
      );

      const overviewEvidence = tender.overviewEvidence || {};
      const overview = {};
      for (const field of OVERVIEW_FIELDS) {
        const evidence = overviewEvidence[field];
        // submissionDeadline/openingDate: the typed column is null whenever
        // the AI's extracted text didn't calendar-parse — fall back to the
        // raw text rather than reporting the field as not-found (see
        // repo/analysis.js's DATE_OVERVIEW_FIELDS comment). Every other field
        // is plain text, so tender[field] alone is always the whole answer.
        const value = tender[field] ?? evidence?.rawValue ?? null;
        if (value === null || value === undefined) {
          overview[field] = null;
          continue;
        }
        overview[field] = {
          value,
          sourcePage: evidence?.sourcePage ?? null,
          evidenceText: evidence?.evidenceText ?? null,
        };
      }

      const document = documents[0]
        ? {
            filename: documents[0].filename,
            mimeType: documents[0].mimeType,
            sizeBytes: documents[0].sizeBytes,
            uploadedAt: documents[0].createdAt,
          }
        : null;

      return res.json({
        id: tender.id,
        title: tender.title,
        source: tender.source,
        status: tender.status,
        internalDeadline: tender.internalDeadline,
        notes: tender.notes,
        portalUrl: tender.portalUrl,
        portalRef: tender.portalRef,
        clientId: tender.clientId,
        processingStatus: tender.processingStatus,
        processingError: tender.processingError,
        analysisStatus: tender.analysisStatus,
        analysisError: tender.analysisError,
        analyzedAt: tender.analyzedAt,
        analysisCoverage,
        pageCount: pages.length,
        createdAt: tender.createdAt,
        updatedAt: tender.updatedAt,
        overview,
        requirements: requirementsWithEvidence,
        boq,
        dates,
        redFlags,
        document,
        activity,
      });
    } catch (err) {
      handleError(res, err);
    }
  });

  router.post('/tenders/:id/analyze', async (req, res) => {
    try {
      const db = getDb();
      const scope = await requireCompanyAccess(db, {
        userId: req.bidpilotUserId,
        companyId: req.body?.companyId,
      });
      const tender = await getTender(scope, req.params.id);
      if (!tender) return res.status(404).json({ error: 'Not found.' });
      // A tender tracked from the feed has no document until one is attached.
      if ((await listDocumentsForTender(scope, tender.id)).length === 0) {
        return res.status(409).json({ error: 'Attach the tender document first, then analyse it.', code: 'no_document' });
      }
      if (await refuseIfProfileNeeded(db, scope.companyId, res, tender.id)) return;

      // Analysis needs completed extraction text to work from — cannot run
      // on a tender that's still UPLOADED/PROCESSING/EXTRACTING, or that
      // failed extraction entirely.
      if (tender.processingStatus !== 'COMPLETED') {
        return res.status(409).json({
          error: `Tender processing is ${tender.processingStatus}, not COMPLETED — cannot analyze yet.`,
        });
      }

      const pages = await listPages(scope, tender.id);
      const chunks = chunkPages(pages, { maxChars: config.bidpilot.analysis.chunkChars });
      try {
        await assertAnalysisBudget(db, scope.companyId, chunks.length);
        // Last, so a tender refused by the checks above never uses a slot.
        await claimTenderSlot(db, scope.companyId, tender.id);
      } catch (err) {
        if (err instanceof AnalysisBudgetError) {
          const status = { tender_too_large: 413, trial_exhausted: 402, plan_exhausted: 402, plan_expired: 402 }[err.reason] ?? 429;
          return res.status(status).json({ error: err.message, code: err.reason });
        }
        throw err;
      }

      // Atomic compare-and-set — see startAnalysis()'s docblock. A row is
      // only returned to the request that actually won the race.
      const isReanalysis = tender.analysisStatus === 'COMPLETED';
      const started = await startAnalysis(scope, tender.id);
      if (!started) {
        return res.status(409).json({ error: 'Analysis is already in progress for this tender.' });
      }

      res.status(202).json({ tenderId: tender.id, analysisStatus: 'ANALYZING' });

      // Off the request path — same idiom as upload's extraction trigger.
      setImmediate(() => {
        runAnalysis(scope, tender.id, { isReanalysis }).catch((err) => {
          log.error(`bidpilot: unhandled analysis failure for tender=${tender.id}:`, err);
        });
      });
    } catch (err) {
      handleError(res, err);
    }
  });

  router.get('/tenders/:id/document-url', async (req, res) => {
    try {
      const db = getDb();
      const scope = await requireCompanyAccess(db, {
        userId: req.bidpilotUserId,
        companyId: req.query.companyId,
      });
      const tender = await getTender(scope, req.params.id);
      if (!tender) return res.status(404).json({ error: 'Not found.' });

      const [document] = await listDocumentsForTender(scope, tender.id);
      if (!document) return res.status(404).json({ error: 'No document on this tender.' });

      const url = await getStorage().getSignedDownloadUrl({ key: document.storagePath });
      return res.json({ url, expiresInSeconds: 300 });
    } catch (err) {
      handleError(res, err);
    }
  });

  // Milestone 6 — always exactly one AI call, so this runs synchronously on
  // the request path (unlike /analyze's 202-then-poll pattern, which exists
  // specifically because a chunked analysis can take a long time). See
  // analysis/eligibilityPipeline.js's file header for why budget/AI errors
  // are surfaced here rather than swallowed-and-logged, and for the
  // server-side evidence-verification step that's the actual fix from this
  // milestone's security review.
  router.post('/tenders/:id/eligibility', async (req, res) => {
    try {
      const db = getDb();
      const scope = await requireCompanyAccess(db, {
        userId: req.bidpilotUserId,
        companyId: req.body?.companyId,
      });
      const tender = await getTender(scope, req.params.id);
      if (!tender) return res.status(404).json({ error: 'Not found.' });

      const { evaluated, results } = await runEligibility(scope, tender.id);
      return res.json({ tenderId: tender.id, evaluated, requirements: results });
    } catch (err) {
      if (err instanceof AnalysisBudgetError) {
        return res.status(429).json({ error: err.message });
      }
      if (err instanceof EligibilityError) {
        return res.status(502).json({ error: err.message });
      }
      handleError(res, err);
    }
  });

  // ── Bid tracker ─────────────────────────────────────────────────────────
  // Stage, internal deadline, notes, portal link and client. Every field is
  // optional; only those sent are changed.
  router.patch('/tenders/:id', async (req, res) => {
    try {
      const db = getDb();
      const scope = await requireCompanyAccess(db, { userId: req.bidpilotUserId, companyId: req.body?.companyId });
      const parsed = await parseTrackingChanges(db, scope, req.body ?? {});
      if (parsed.error) return res.status(400).json({ error: parsed.error });
      const row = await updateTenderTracking(scope, req.params.id, parsed.changes, req.bidpilotUserId);
      if (!row) return res.status(404).json({ error: 'Not found.' });
      return res.json({
        id: row.id, status: row.status, internalDeadline: row.internalDeadline, notes: row.notes,
        portalUrl: row.portalUrl, portalRef: row.portalRef, clientId: row.clientId,
      });
    } catch (err) {
      handleError(res, err);
    }
  });

  // ── Submission checklist ────────────────────────────────────────────────
  async function checklistScope(req, res, companyId) {
    const db = getDb();
    const scope = await requireCompanyAccess(db, { userId: req.bidpilotUserId, companyId });
    const tender = await getTender(scope, req.params.id);
    if (!tender) { res.status(404).json({ error: 'Not found.' }); return null; }
    return { scope, tender };
  }

  router.get('/tenders/:id/checklist', async (req, res) => {
    try {
      const ctx = await checklistScope(req, res, req.query.companyId);
      if (!ctx) return;
      return res.json(await getChecklist(ctx.scope, ctx.tender.id));
    } catch (err) {
      handleError(res, err);
    }
  });

  router.get('/tenders/:id/checklist.xlsx', async (req, res) => {
    try {
      const ctx = await checklistScope(req, res, req.query.companyId);
      if (!ctx) return;
      const checklist = await getChecklist(ctx.scope, ctx.tender.id);
      const deadline = ctx.tender.submissionDeadline
        ? ctx.tender.submissionDeadline.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' })
        : null;
      const buf = await buildChecklistXlsx({ tender: ctx.tender, checklist, deadline });
      const base = String(ctx.tender.title || 'tender').replace(/\.pdf$/i, '').replace(/[^A-Za-z0-9._-]+/g, '-').slice(0, 60) || 'tender';
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${base}-checklist.xlsx"`);
      return res.send(buf);
    } catch (err) {
      handleError(res, err);
    }
  });

  router.put('/tenders/:id/checklist/requirement', async (req, res) => {
    try {
      const ctx = await checklistScope(req, res, req.body?.companyId);
      if (!ctx) return;
      const { key, done } = req.body ?? {};
      if (typeof key !== 'string' || typeof done !== 'boolean') {
        return res.status(400).json({ error: 'key (string) and done (true/false) are required.' });
      }
      const ok = await setRequirementDone(ctx.scope, ctx.tender.id, key, done, req.bidpilotUserId);
      if (!ok) return res.status(404).json({ error: 'That item is no longer in this tender.' });
      return res.json(await getChecklist(ctx.scope, ctx.tender.id));
    } catch (err) {
      handleError(res, err);
    }
  });

  router.post('/tenders/:id/checklist/custom', async (req, res) => {
    try {
      const ctx = await checklistScope(req, res, req.body?.companyId);
      if (!ctx) return;
      const label = typeof req.body?.label === 'string' ? req.body.label.trim() : '';
      if (!label) return res.status(400).json({ error: 'Write what the item is.' });
      if (label.length > CUSTOM_LABEL_MAX) return res.status(400).json({ error: `Keep it under ${CUSTOM_LABEL_MAX} characters.` });
      await addCustomItem(ctx.scope, ctx.tender.id, label);
      return res.status(201).json(await getChecklist(ctx.scope, ctx.tender.id));
    } catch (err) {
      handleError(res, err);
    }
  });

  router.patch('/tenders/:id/checklist/custom/:itemId', async (req, res) => {
    try {
      const ctx = await checklistScope(req, res, req.body?.companyId);
      if (!ctx) return;
      if (typeof req.body?.done !== 'boolean') return res.status(400).json({ error: 'done (true/false) is required.' });
      if (!UUID_RE.test(req.params.itemId)) return res.status(404).json({ error: 'Not found.' });
      const ok = await setCustomDone(ctx.scope, ctx.tender.id, req.params.itemId, req.body.done, req.bidpilotUserId);
      if (!ok) return res.status(404).json({ error: 'Not found.' });
      return res.json(await getChecklist(ctx.scope, ctx.tender.id));
    } catch (err) {
      handleError(res, err);
    }
  });

  router.delete('/tenders/:id/checklist/custom/:itemId', async (req, res) => {
    try {
      const ctx = await checklistScope(req, res, req.body?.companyId ?? req.query.companyId);
      if (!ctx) return;
      if (!UUID_RE.test(req.params.itemId)) return res.status(404).json({ error: 'Not found.' });
      const ok = await deleteCustomItem(ctx.scope, ctx.tender.id, req.params.itemId);
      if (!ok) return res.status(404).json({ error: 'Not found.' });
      return res.json(await getChecklist(ctx.scope, ctx.tender.id));
    } catch (err) {
      handleError(res, err);
    }
  });

  // ── EMD and performance security ────────────────────────────────────────
  // The user's own record of what was given and whether it came back
  // (repo/securities.js). Same company check as the checklist.
  router.get('/tenders/:id/securities', async (req, res) => {
    try {
      const ctx = await checklistScope(req, res, req.query.companyId);
      if (!ctx) return;
      return res.json({ securities: await listSecurities(ctx.scope, ctx.tender.id) });
    } catch (err) {
      handleError(res, err);
    }
  });

  router.post('/tenders/:id/securities', async (req, res) => {
    try {
      const ctx = await checklistScope(req, res, req.body?.companyId);
      if (!ctx) return;
      const parsed = parseSecurity(req.body);
      if (!parsed.ok) return res.status(400).json({ error: parsed.error });
      const security = await createSecurity(ctx.scope, ctx.tender.id, parsed.values, req.bidpilotUserId);
      return res.status(201).json(security);
    } catch (err) {
      if (err instanceof TooManySecuritiesError) return res.status(400).json({ error: err.message });
      handleError(res, err);
    }
  });

  router.patch('/tenders/:id/securities/:sid', async (req, res) => {
    try {
      const ctx = await checklistScope(req, res, req.body?.companyId);
      if (!ctx) return;
      if (!UUID_RE.test(req.params.sid)) return res.status(404).json({ error: 'Not found.' });
      const parsed = parseSecurity(req.body, { partial: true });
      if (!parsed.ok) return res.status(400).json({ error: parsed.error });
      const security = await updateSecurity(ctx.scope, ctx.tender.id, req.params.sid, parsed.values);
      if (!security) return res.status(404).json({ error: 'Not found.' });
      return res.json(security);
    } catch (err) {
      handleError(res, err);
    }
  });

  router.delete('/tenders/:id/securities/:sid', async (req, res) => {
    try {
      const ctx = await checklistScope(req, res, req.body?.companyId ?? req.query.companyId);
      if (!ctx) return;
      if (!UUID_RE.test(req.params.sid)) return res.status(404).json({ error: 'Not found.' });
      const ok = await deleteSecurity(ctx.scope, ctx.tender.id, req.params.sid);
      if (!ok) return res.status(404).json({ error: 'Not found.' });
      return res.json({ deleted: true });
    } catch (err) {
      handleError(res, err);
    }
  });

  // ── Annexure drafts (analysis/annexures.js) ─────────────────────────────
  // The tender's own formats, found in its pages; Draft makes one AI call
  // that only places placeholders; the Word file fills them from the
  // profile (the client's, for a client's tender) when it is downloaded.
  async function bidderFor(scope, tender) {
    if (tender.clientId) {
      const client = await getClient(scope, tender.clientId);
      if (client) return { name: client.name, isClient: true, profile: await getClientProfile(scope, client.id) };
    }
    const [company] = await scope.db.select({ name: companies.name }).from(companies).where(eq(companies.id, scope.companyId)).limit(1);
    return { name: company?.name ?? 'Your company', isClient: false, profile: await getCompanyProfile(scope.db, scope.companyId) };
  }

  function draftSummary(draft, values) {
    if (!draft) return null;
    const c = draftCoverage(draft.blocks, values);
    return { draftedAt: draft.updatedAt, paragraphs: draft.blocks.length, missing: c.missingLabels, blanks: c.blanks, filled: c.fieldsUsed.length - c.missing.length };
  }

  router.get('/tenders/:id/annexures', async (req, res) => {
    try {
      const ctx = await checklistScope(req, res, req.query.companyId);
      if (!ctx) return;
      const [pages, drafts, bidder] = await Promise.all([
        listPages(ctx.scope, ctx.tender.id), listDrafts(ctx.scope, ctx.tender.id), bidderFor(ctx.scope, ctx.tender),
      ]);
      const values = draftValues(bidder.profile, bidder.name);
      const byKey = new Map(drafts.map((d) => [d.formatKey, d]));
      return res.json({
        bidder: { name: bidder.name, isClient: bidder.isClient },
        formats: findFormats(pages).map((f) => ({ ...f, draft: draftSummary(byKey.get(f.key), values) })),
      });
    } catch (err) {
      handleError(res, err);
    }
  });

  router.post('/tenders/:id/annexures/:key/draft', async (req, res) => {
    try {
      const ctx = await checklistScope(req, res, req.body?.companyId);
      if (!ctx) return;
      const key = Number.parseInt(req.params.key, 10);
      const pages = await listPages(ctx.scope, ctx.tender.id);
      const format = findFormats(pages).find((f) => f.key === key);
      if (!format) return res.status(404).json({ error: 'That format isn\u2019t in this tender.' });
      await assertAnnexureBudget(getDb(), ctx.scope.companyId);
      const source = formatSource(pages, format);
      const parsed = await withAnalysisSlot(() => draftFormat(source));
      const checked = validateDraft(parsed, source);
      if (checked.blocks.length === 0) {
        return res.status(502).json({ error: 'The draft didn\u2019t match the tender\u2019s wording closely enough, so nothing was kept. Please try again.' });
      }
      await recordAnnexureUsage(getDb(), { companyId: ctx.scope.companyId, tenderId: ctx.tender.id, metadata: { formatKey: key, dropped: checked.dropped } });
      const draft = await saveDraft(ctx.scope, {
        tenderId: ctx.tender.id, clientId: ctx.tender.clientId, formatKey: key, title: format.title,
        pages: format.pages, blocks: checked.blocks, userId: req.bidpilotUserId,
      });
      const bidder = await bidderFor(ctx.scope, ctx.tender);
      return res.json({ ...format, draft: draftSummary(draft, draftValues(bidder.profile, bidder.name)), dropped: checked.dropped });
    } catch (err) {
      if (err instanceof AnalysisBudgetError) return res.status(429).json({ error: err.message });
      log.error(`bidpilot annexure draft failed: ${safeErrorMessage(err)}`);
      if (err instanceof TenantAccessError) return handleError(res, err);
      return res.status(502).json({ error: 'Could not draft this annexure. Please try again.' });
    }
  });

  router.get('/tenders/:id/annexures/:key/docx', async (req, res) => {
    try {
      const ctx = await checklistScope(req, res, req.query.companyId);
      if (!ctx) return;
      const key = Number.parseInt(req.params.key, 10);
      const draft = Number.isInteger(key) ? await getDraft(ctx.scope, ctx.tender.id, key) : null;
      if (!draft) return res.status(404).json({ error: 'Draft this annexure first.' });
      const bidder = await bidderFor(ctx.scope, ctx.tender);
      const buf = await buildAnnexureDocx({
        title: draft.title, tenderTitle: String(ctx.tender.title || 'the tender').replace(/\.pdf$/i, ''),
        pages: draft.pages, blocks: draft.blocks, values: draftValues(bidder.profile, bidder.name), bidderName: bidder.name,
      });
      const base = `${String(draft.title).split('·')[0]}`.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'annexure';
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      res.setHeader('Content-Disposition', `attachment; filename="${base}-draft.docx"`);
      return res.send(buf);
    } catch (err) {
      handleError(res, err);
    }
  });

  // ── Attach the document to a tender tracked from the feed ───────────────
  // Same checks as an upload (it becomes a counted tender once it has a
  // document), then the usual extraction in the background.
  router.post('/tenders/:id/document', (req, res) => {
    upload.single('file')(req, res, async (multerErr) => {
      if (multerErr) return res.status(413).json({ error: 'Upload rejected (file too large or malformed).' });
      try {
        const ctx = await checklistScope(req, res, req.body?.companyId);
        if (!ctx) return;
        if (!req.file) return res.status(400).json({ error: 'No file uploaded (expected multipart field "file").' });
        if ((await listDocumentsForTender(ctx.scope, ctx.tender.id)).length > 0) {
          return res.status(409).json({ error: 'This tender already has its document.' });
        }
        const { displayFilename } = validateUpload({ buffer: req.file.buffer, mimeType: req.file.mimetype, filename: req.file.originalname });
        if (await refuseIfProfileNeeded(getDb(), ctx.scope.companyId, res)) return;
        const storage = getStorage();
        const key = storage.newKey('pdf');
        await storage.putObject({ key, buffer: req.file.buffer, contentType: 'application/pdf' });
        await createTenderDocument(ctx.scope, ctx.tender.id, {
          filename: displayFilename, storagePath: key, mimeType: 'application/pdf', sizeBytes: req.file.buffer.length,
          contentHash: sha256(req.file.buffer), uploadedBy: req.bidpilotUserId,
        });
        await updateProcessingStatus(ctx.scope, ctx.tender.id, 'UPLOADED');
        res.status(201).json({ tenderId: ctx.tender.id, processingStatus: 'UPLOADED' });
        setImmediate(() => {
          processExtraction(ctx.scope, ctx.tender.id, req.file.buffer).catch((err) => {
            log.error(`bidpilot: unhandled extraction failure for tender=${ctx.tender.id}:`, err);
          });
        });
      } catch (err) {
        handleError(res, err);
      }
    });
  });

  // ── Corrigenda ──────────────────────────────────────────────────────────
  // Upload an amendment to an existing tender; it is checked against the
  // tender's key facts in the background (GET the list to see the result).
  // Not a new tender, so it doesn't use the plan allowance; the AI call
  // counts against the company's daily analysis cap like any other.
  router.post('/tenders/:id/corrigenda', (req, res) => {
    upload.single('file')(req, res, async (multerErr) => {
      if (multerErr) return res.status(413).json({ error: 'Upload rejected (file too large or malformed).' });
      try {
        const ctx = await checklistScope(req, res, req.body?.companyId);
        if (!ctx) return;
        if (!req.file) return res.status(400).json({ error: 'No file uploaded (expected multipart field "file").' });
        const { displayFilename } = validateUpload({ buffer: req.file.buffer, mimeType: req.file.mimetype, filename: req.file.originalname });
        try {
          await assertAnalysisBudget(getDb(), ctx.scope.companyId, 1);
        } catch (err) {
          if (err instanceof AnalysisBudgetError) return res.status(429).json({ error: err.message });
          throw err;
        }
        const storage = getStorage();
        const storageKey = storage.newKey('pdf');
        await storage.putObject({ key: storageKey, buffer: req.file.buffer, contentType: 'application/pdf' });
        const row = await createCorrigendum(ctx.scope, ctx.tender.id, { filename: displayFilename, storageKey, createdBy: req.bidpilotUserId });
        res.status(201).json({ id: row.id, status: row.status });
        processCorrigendum(ctx.scope, ctx.tender, row.id, req.file.buffer).catch((err) => log.error('corrigendum processing crashed:', err));
      } catch (err) {
        handleError(res, err);
      }
    });
  });

  router.get('/tenders/:id/corrigenda', async (req, res) => {
    try {
      const ctx = await checklistScope(req, res, req.query.companyId);
      if (!ctx) return;
      const rows = await listCorrigenda(ctx.scope, ctx.tender.id);
      return res.json({ corrigenda: rows.map(publicCorrigendum) });
    } catch (err) {
      handleError(res, err);
    }
  });

  router.post('/tenders/:id/corrigenda/:cid/apply', async (req, res) => {
    try {
      const ctx = await checklistScope(req, res, req.body?.companyId);
      if (!ctx) return;
      if (!UUID_RE.test(req.params.cid)) return res.status(404).json({ error: 'Not found.' });
      const corr = await getCorrigendum(ctx.scope, ctx.tender.id, req.params.cid);
      if (!corr || corr.status !== 'COMPLETED') return res.status(404).json({ error: 'Not found.' });
      const wanted = Array.isArray(req.body?.fields) ? req.body.fields : [];
      const values = {};
      const evidence = {};
      const skipped = [];
      for (const field of wanted) {
        if (!APPLICABLE_FIELDS.includes(field)) continue;
        const change = (corr.changes || []).find((c) => c.field === field);
        if (!change) continue;
        let value = change.after;
        if (field === 'submissionDeadline' || field === 'openingDate') {
          value = parseTenderDate(change.after);
          if (!value) { skipped.push(`${CORRIGENDUM_FIELDS[field]}: "${change.after}" is not a date we can read`); continue; }
        }
        values[field] = value;
        evidence[field] = {
          sourcePage: null,
          evidenceText: `From the corrigendum ${corr.filename}, page ${change.sourcePage}: ${change.evidenceText}`,
          rawValue: change.after,
        };
      }
      if (Object.keys(values).length === 0) {
        return res.status(400).json({ error: skipped[0] ?? 'Choose at least one change to apply.', skipped });
      }
      await applyCorrigendum(ctx.scope, ctx.tender, corr, values, evidence, req.bidpilotUserId);
      return res.json({ applied: Object.keys(values), skipped });
    } catch (err) {
      handleError(res, err);
    }
  });

  return router;
}

function publicCorrigendum(c) {
  return {
    id: c.id, filename: c.filename, status: c.status, error: c.error, pageCount: c.pageCount,
    summary: c.summary, changes: c.changes ?? [], appliedAt: c.appliedAt, createdAt: c.createdAt,
  };
}

/** The tender's current key facts, as the corrigendum check compares them. */
function corrigendumFacts(tender) {
  const ev = tender.overviewEvidence || {};
  const when = (d, field) => (d
    ? d.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' })
    : ev[field]?.rawValue ?? null);
  return {
    submissionDeadline: when(tender.submissionDeadline, 'submissionDeadline'),
    openingDate: when(tender.openingDate, 'openingDate'),
    emd: tender.emd ?? null,
    estimatedValue: tender.estimatedValue ?? null,
    tenderFee: tender.tenderFee ?? null,
    contractDuration: tender.contractDuration ?? null,
  };
}

async function processCorrigendum(scope, tender, id, buffer) {
  const start = Date.now();
  try {
    const result = await extractStructured(buffer);
    const pages = result.spanPages.map((p) => ({ pageNumber: p.page, rawText: spansToText([p]) }));
    if (!pages.some((p) => p.rawText && p.rawText.trim())) {
      await finishCorrigendum(scope, id, { status: 'FAILED', pageCount: pages.length, error: 'No readable text was found in this PDF.' });
      return;
    }
    const facts = corrigendumFacts(tender);
    const raw = await withAnalysisSlot(() => askForChanges({ facts, pages }));
    await recordChunkUsage(scope.db, { companyId: scope.companyId, tenderId: tender.id, metadata: { kind: 'corrigendum', corrigendumId: id } });
    if (!raw) {
      await finishCorrigendum(scope, id, { status: 'FAILED', pageCount: pages.length, error: 'The check could not read this corrigendum. Please try again.' });
      return;
    }
    const { summary, changes, dropped } = validateCorrigendumResult(raw, { pages, facts });
    await finishCorrigendum(scope, id, { status: 'COMPLETED', pageCount: pages.length, summary, changes });
    log.info(`metric bidpilot_corrigendum company=${scope.companyId} tender=${tender.id} changes=${changes.length} dropped=${dropped} ms=${Date.now() - start}`);
  } catch (err) {
    await finishCorrigendum(scope, id, { status: 'FAILED', error: safeErrorMessage(err) }).catch(() => {});
    log.info(`metric bidpilot_error company=${scope.companyId} tender=${tender.id} kind=corrigendum ms=${Date.now() - start}`);
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Validates PATCH /tenders/:id. Returns { changes } or { error }. */
async function parseTrackingChanges(db, scope, body) {
  const changes = {};
  if ('status' in body) {
    if (!tenderStatus.enumValues.includes(body.status)) return { error: 'Unknown stage.' };
    changes.status = body.status;
  }
  if ('internalDeadline' in body) {
    if (body.internalDeadline === null || body.internalDeadline === '') changes.internalDeadline = null;
    else {
      const d = new Date(body.internalDeadline);
      if (typeof body.internalDeadline !== 'string' || Number.isNaN(d.getTime())) return { error: 'The internal deadline is not a date.' };
      changes.internalDeadline = d;
    }
  }
  if ('notes' in body) {
    if (body.notes !== null && typeof body.notes !== 'string') return { error: 'Notes must be text.' };
    const notes = (body.notes ?? '').trim();
    if (notes.length > NOTES_MAX) return { error: `Notes can be up to ${NOTES_MAX} characters.` };
    changes.notes = notes || null;
  }
  if ('portalUrl' in body) {
    const url = typeof body.portalUrl === 'string' ? body.portalUrl.trim() : '';
    if (url) {
      let u;
      try { u = new URL(url); } catch { return { error: 'The portal link is not a web address.' }; }
      if (!['http:', 'https:'].includes(u.protocol) || url.length > 600) return { error: 'The portal link is not a web address.' };
    }
    changes.portalUrl = url || null;
  }
  if ('portalRef' in body) {
    const ref = typeof body.portalRef === 'string' ? body.portalRef.trim() : '';
    if (ref.length > 120) return { error: 'The tender ID is too long.' };
    changes.portalRef = ref || null;
  }
  if ('clientId' in body) {
    if (body.clientId === null || body.clientId === '') changes.clientId = null;
    else {
      if (typeof body.clientId !== 'string' || !UUID_RE.test(body.clientId)) return { error: 'Unknown client.' };
      const client = await getClient(scope, body.clientId);
      if (!client) return { error: 'Unknown client.' };
      changes.clientId = client.id;
    }
  }
  if (Object.keys(changes).length === 0) return { error: 'Nothing to change.' };
  return { changes };
}

/** The company profile is optional for the first FREE_TENDERS_WITHOUT_PROFILE
 *  tenders and required after that (see profileGate.js). Sends 409
 *  profile_incomplete, which the app answers with its "complete your profile"
 *  dialog, and returns true when the action must wait. */
async function refuseIfProfileNeeded(db, companyId, res, tenderId = null) {
  const missing = await profileNeededFor(db, companyId, tenderId);
  if (!missing) return false;
  res.status(409).json({
    error: PROFILE_REQUIRED_MESSAGE,
    code: 'profile_incomplete',
    missing,
    freeTenders: FREE_TENDERS_WITHOUT_PROFILE,
  });
  return true;
}

async function handleUpload(req, res) {
  const companyId = req.body?.companyId;
  if (!companyId) {
    return res.status(400).json({ error: 'companyId is required.' });
  }
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded (expected multipart field "file").' });
  }

  const db = getDb();
  // requireCompanyAccess is the enforcement point: it throws unless
  // req.bidpilotUserId is actually a member of companyId — a caller cannot
  // upload into a company by simply naming its id (per instruction: "Do not
  // allow a user to specify another company ID and thereby upload into
  // another tenant").
  const scope = await requireCompanyAccess(db, { userId: req.bidpilotUserId, companyId });
  if (await refuseIfProfileNeeded(db, companyId, res)) return;

  const uploadStart = Date.now();
  const { tender, duplicate } = await ingestUpload(scope, {
    buffer: req.file.buffer,
    mimeType: req.file.mimetype,
    filename: req.file.originalname,
    uploadedBy: req.bidpilotUserId,
  });
  log.info(
    `metric bidpilot_upload company=${companyId} tender=${tender.id} ` +
      `bytes=${req.file.buffer.length} duplicate=${duplicate} ms=${Date.now() - uploadStart}`,
  );

  res.status(duplicate ? 200 : 201).json({
    tenderId: tender.id,
    status: tender.status,
    processingStatus: tender.processingStatus,
    duplicate,
  });

  if (!duplicate) {
    // Off the request path, same idiom as server.js's processWebhook —
    // acknowledge first, do the real work after. See pipeline.js's header for
    // why this is fire-and-forget rather than a durable queue at this stage.
    setImmediate(() => {
      processExtraction(scope, tender.id, req.file.buffer).catch((err) => {
        log.error(`bidpilot: unhandled extraction failure for tender=${tender.id}:`, err);
      });
    });
  }
}

function handleError(res, err) {
  if (err instanceof ValidationError) {
    return res.status(400).json({ error: err.message });
  }
  if (err instanceof TenantAccessError) {
    // Deliberately generic — never confirms/denies that a companyId exists,
    // only that this caller can't act on it.
    return res.status(403).json({ error: 'Not authorized for this company.' });
  }
  log.error('bidpilot route error:', err);
  return res.status(500).json({ error: 'Internal server error.' });
}
