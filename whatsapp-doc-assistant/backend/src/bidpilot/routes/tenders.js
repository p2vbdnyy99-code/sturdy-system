// BidPilot tender ingestion routes — deliberately mounted under /bidpilot in
// server.js, entirely separate from Papyr's WhatsApp /webhook handling. This
// router does not import router.js/whatsapp.js, and nothing there imports this.

import express from 'express';
import multer from 'multer';
import { getDb } from '../../db/client.js';
import { log } from '../../logger.js';
import { requireIdentity } from './auth.js';
import { requireCompanyAccess, TenantAccessError } from '../repo/tenants.js';
import { getTender } from '../repo/tenders.js';
import { listPages } from '../repo/pages.js';
import { listDocumentsForTender } from '../repo/documents.js';
import { ingestUpload, processExtraction } from '../ingestion/pipeline.js';
import { ValidationError } from '../ingestion/validate.js';
import { getStorage } from '../storage/index.js';
import { config } from '../../config.js';

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
  // Scoped to /tenders explicitly (not a bare router.use(requireIdentity()))
  // so mounting this router alongside download.js's router at the same
  // /bidpilot prefix can never accidentally gate the signed-URL download
  // route behind an identity header — a signed URL is meant to be
  // self-authorizing, with no separate identity check at all.
  router.use('/tenders', requireIdentity());

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

  router.get('/tenders/:id', async (req, res) => {
    try {
      const db = getDb();
      const scope = await requireCompanyAccess(db, {
        userId: req.bidpilotUserId,
        companyId: req.query.companyId,
      });
      const tender = await getTender(scope, req.params.id);
      if (!tender) return res.status(404).json({ error: 'Not found.' });
      const pages = await listPages(scope, tender.id);
      return res.json({
        id: tender.id,
        title: tender.title,
        status: tender.status,
        processingStatus: tender.processingStatus,
        processingError: tender.processingError,
        pageCount: pages.length,
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
