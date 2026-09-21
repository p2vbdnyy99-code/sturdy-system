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
import { getTender, startAnalysis, listTendersPaginated } from '../repo/tenders.js';
import { listPages } from '../repo/pages.js';
import { listDocumentsForTender } from '../repo/documents.js';
import { listRequirements, listEvidenceForRequirement } from '../repo/requirements.js';
import { listBoq } from '../repo/boq.js';
import { listDates } from '../repo/dates.js';
import { listRedFlags } from '../repo/redFlags.js';
import { listEvents } from '../repo/events.js';
import { ingestUpload, processExtraction } from '../ingestion/pipeline.js';
import { ValidationError } from '../ingestion/validate.js';
import { getStorage } from '../storage/index.js';
import { chunkPages } from '../analysis/chunker.js';
import { assertAnalysisBudget, AnalysisBudgetError } from '../analysis/budget.js';
import { runAnalysis } from '../analysis/pipeline.js';
import { runEligibility, EligibilityError } from '../analysis/eligibilityPipeline.js';
import { config } from '../../config.js';
import { tenderStatus, tenderAnalysisStatus } from '../../db/schema/enums.js';
import { OVERVIEW_FIELDS } from '../analysis/schema.js';

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
      if (sortBy && !['deadline', 'createdAt'].includes(sortBy)) {
        return res.status(400).json({ error: "sortBy must be 'deadline' or 'createdAt'." });
      }
      if (sortOrder && !['asc', 'desc'].includes(sortOrder)) {
        return res.status(400).json({ error: "sortOrder must be 'asc' or 'desc'." });
      }

      const page = Number.parseInt(req.query.page, 10) || 1;
      const limit = Number.parseInt(req.query.limit, 10) || 20;

      const result = await listTendersPaginated(scope, {
        page, limit, status, analysisStatus, search, sortBy, sortOrder,
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

      const [pages, requirements, boq, dates, redFlags, documents, activity] = await Promise.all([
        listPages(scope, tender.id),
        listRequirements(scope, tender.id),
        listBoq(scope, tender.id),
        listDates(scope, tender.id),
        listRedFlags(scope, tender.id),
        listDocumentsForTender(scope, tender.id),
        listEvents(scope, tender.id),
      ]);

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
        processingStatus: tender.processingStatus,
        processingError: tender.processingError,
        analysisStatus: tender.analysisStatus,
        analysisError: tender.analysisError,
        analyzedAt: tender.analyzedAt,
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
      } catch (err) {
        if (err instanceof AnalysisBudgetError) {
          return res.status(err.reason === 'tender_too_large' ? 413 : 429).json({ error: err.message });
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

  return router;
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

  const { tender, duplicate } = await ingestUpload(scope, {
    buffer: req.file.buffer,
    mimeType: req.file.mimetype,
    filename: req.file.originalname,
    uploadedBy: req.bidpilotUserId,
  });

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
