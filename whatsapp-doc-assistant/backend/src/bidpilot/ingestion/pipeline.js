// The tender ingestion vertical slice:
//   PDF upload -> validate -> dedupe check -> durable Tender + TenderDocument
//   -> (async) PROCESSING -> EXTRACTING -> tender_pages -> COMPLETED/FAILED
// -----------------------------------------------------------------------------
// Split into two functions deliberately:
//   ingestUpload()     — the synchronous part. Runs inside the HTTP request;
//                        the client gets tender id + status=UPLOADED back
//                        immediately, mirroring server.js's existing "ack
//                        immediately, do the real work off the request path"
//                        pattern for the WhatsApp webhook.
//   processExtraction() — the async part, kicked off via setImmediate right
//                        after the response is sent (same idiom as
//                        server.js's processWebhook). NOT a durable queue —
//                        see BIDPILOT_ARCHITECTURE.md "Queue/scaling decision"
//                        for exactly when that stops being good enough.
//
// Reuses the existing extraction engine (pdf.js/extractStructured) completely
// unmodified — this file only maps its output onto tender_pages rows.

import { extractStructured } from '../../pdf.js';
import { spansToText } from '../../extract/spans.js';
import { log } from '../../logger.js';
import { getStorage } from '../storage/index.js';
import { sha256 } from './hash.js';
import { validateUpload } from './validate.js';
import { withUploadLock } from './uploadLock.js';
import { createTender, updateProcessingStatus } from '../repo/tenders.js';
import { createTenderDocument, findDuplicateTender } from '../repo/documents.js';
import { insertPages } from '../repo/pages.js';

// Cap error text stored/returned so a pathological error message (which could
// theoretically embed document content via a library's error string) never
// grows unbounded, and never carries a stack trace.
const MAX_ERROR_CHARS = 500;
function safeErrorMessage(err) {
  const msg = String(err?.message || err || 'Unknown error').slice(0, MAX_ERROR_CHARS);
  return msg;
}

/**
 * The synchronous half. Validates, hashes, checks for a duplicate, stores the
 * file, and creates the Tender + TenderDocument rows. Returns
 * `{ tender, document, duplicate }` — `document` is undefined when
 * `duplicate` is true (nothing new was written).
 */
export async function ingestUpload(scope, { buffer, mimeType, filename, uploadedBy }) {
  const { displayFilename } = validateUpload({ buffer, mimeType, filename });
  const contentHash = sha256(buffer);

  // Serialized per (company, content) so two truly concurrent uploads of the
  // same file can't both miss each other's not-yet-committed rows — see
  // uploadLock.js's header. A sequential retry doesn't even need this (the
  // first attempt's rows are already committed by the time it arrives); this
  // closes the narrower race where both requests are in flight at once.
  return withUploadLock(`${scope.companyId}:${contentHash}`, async () => {
    const existing = await findDuplicateTender(scope, contentHash);
    if (existing) {
      log.info(
        `metric bidpilot_ingest company=${scope.companyId} tender=${existing.id} outcome=duplicate`,
      );
      return { tender: existing, document: undefined, duplicate: true };
    }

    const storage = getStorage();
    const key = storage.newKey('pdf');
    await storage.putObject({ key, buffer, contentType: 'application/pdf' });

    // Tender + its document are created atomically — if the document insert
    // failed after the tender committed, the tender would be an orphan stuck
    // at UPLOADED forever (nothing ever triggers processing for it). A
    // transaction failing here instead leaves an orphaned blob in storage,
    // which is the better failure mode: invisible to users, cheap to garbage
    // collect later, versus a phantom business record.
    const { tender, document } = await scope.db.transaction(async (tx) => {
      const txScope = scope.withDb(tx);
      const t = await createTender(txScope, { title: displayFilename, createdBy: uploadedBy });
      const d = await createTenderDocument(txScope, t.id, {
        filename: displayFilename,
        storagePath: key,
        mimeType: 'application/pdf',
        sizeBytes: buffer.length,
        contentHash,
        uploadedBy,
      });
      return { tender: t, document: d };
    });

    log.info(
      `metric bidpilot_ingest company=${scope.companyId} tender=${tender.id} ` +
        `bytes=${buffer.length} outcome=created`,
    );
    return { tender, document, duplicate: false };
  });
}

/**
 * The async half. Takes the SAME buffer already validated/stored by
 * ingestUpload — re-reading it back from storage is unnecessary (this all
 * runs in-process via setImmediate) and would require a generic "read bytes"
 * method on the storage interface that the S3 backend otherwise has no
 * reason to expose (see storage/index.js — keep the interface small).
 */
export async function processExtraction(scope, tenderId, buffer) {
  const start = Date.now();
  try {
    await updateProcessingStatus(scope, tenderId, 'PROCESSING');
    await updateProcessingStatus(scope, tenderId, 'EXTRACTING');

    const result = await extractStructured(buffer);

    const pages = result.spanPages.map((p) => ({
      pageNumber: p.page,
      rawText: spansToText([p]),
      ocrUsed: Boolean(p.ocr),
    }));
    await insertPages(scope, tenderId, pages);

    await updateProcessingStatus(scope, tenderId, 'COMPLETED');
    log.info(
      `metric bidpilot_ingest company=${scope.companyId} tender=${tenderId} ` +
        `pages=${pages.length} ocr=${result.ocrUsed} ms=${Date.now() - start} status=COMPLETED`,
    );
  } catch (err) {
    const message = safeErrorMessage(err);
    await updateProcessingStatus(scope, tenderId, 'FAILED', message).catch((persistErr) => {
      // If even the FAILED-status write fails (e.g. DB blip), the tender is
      // stuck in EXTRACTING — logged loudly since nothing else will catch this.
      log.error(
        `bidpilot: could not persist FAILED status for tender=${tenderId}:`,
        persistErr,
      );
    });
    log.info(
      `metric bidpilot_error company=${scope.companyId} tender=${tenderId} ` +
        `kind=${err?.name || 'Error'} ms=${Date.now() - start}`,
    );
  }
}
