// Message router — the heart of the assistant.
// -----------------------------------------------------------------------------
// Takes a normalized inbound WhatsApp message and drives the conversation:
//   * a PDF arrives → download, extract text (OCR if scanned), show the menu
//   * a menu tap / natural-language text → run the matching action
//   * follow-ups that need input (a question, a target language) → prompt & wait
//
// Everything the user sees is sent from here.

import path from 'node:path';
import * as wa from './whatsapp.js';
import * as ai from './ai/index.js';
import { config, hashSender } from './config.js';
import { log } from './logger.js';
import { extractStructured } from './pdf.js';
import { buildDocModel } from './docmodel.js';
import { buildDocx, textToDocx } from './docx.js';
import { detectTablesAcrossPages, TABLE_CONFIDENCE_MIN } from './extract/tables.js';
import { assessLayout } from './extract/complexity.js';
import { buildXlsx } from './xlsx.js';
import {
  getSession,
  setDocument,
  addQa,
  setPending,
  clearPending,
  firstTouch,
} from './sessions.js';

// Bound any single conversion/extraction in wall-clock time so a pathological
// PDF can't pin the worker. Rejects with a friendly error the router already
// handles. NOTE: this stops US waiting on the promise — it does not cancel
// whatever CPU work is already in flight (rasterization / a Tesseract
// recognize() call has no cancellation hook here), so on timeout the
// underlying work may keep consuming resources until it finishes on its own.
// If that turns out to matter in practice, the real fix is isolating OCR in
// its own worker/process so it can be killed outright, not a bigger timeout.
export function withTimeout(promise, ms, label) {
  let timer;
  const guard = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out`)), ms);
    timer.unref?.();
  });
  return Promise.race([promise, guard]).finally(() => clearTimeout(timer));
}

// Extra headroom for the outer extraction guard, on top of the OCR budget the
// worker thread enforces internally. Covers the digital-extraction work that
// runs before OCR starts, so the inner (terminating) timeout fires first.
const EXTRACTION_TIMEOUT_MARGIN_MS = 30_000;

/** Pseudonymous ` user=<hash>` suffix for a metric line, or '' when no salt is
 *  configured. Lets distinct users be counted in logs without ever recording
 *  the phone number. */
function userTag(from) {
  const h = hashSender(from);
  return h ? ` user=${h}` : '';
}

/** Map any thrown error to the safe, generic message the user sees. Known AI
 *  errors get their specific (still safe) message; everything else — including
 *  an extraction/OCR timeout — gets the generic fallback. Never leaks raw SDK
 *  errors, stack traces, or document content. */
export function friendlyErrorMessage(err) {
  return err instanceof ai.AIError
    ? `⚠️ ${err.userMessage}`
    : '⚠️ Something went wrong on my side. Please try again in a moment.';
}

// ─── Menu definition ─────────────────────────────────────────────────────────

const MENU_ROWS = [
  { id: 'summarize', title: '📝 Summarize', description: 'A concise overview of the document' },
  { id: 'ask', title: '💬 Ask a question', description: 'Chat with the document' },
  { id: 'convert_word', title: '📄 Convert to Word', description: 'Get an editable .docx file' },
  { id: 'extract_tables', title: '📊 Convert to Excel', description: 'Get an .xlsx spreadsheet' },
  { id: 'translate', title: '🌐 Translate', description: 'Into any language you name' },
  { id: 'eli', title: '🧒 Explain simply', description: 'Explain it like I am 10' },
];

function sendMenu(to, lead) {
  return wa.sendList(to, {
    header: 'What next?',
    body: lead || 'What would you like me to do with this document?',
    buttonLabel: 'Choose action',
    rows: MENU_ROWS,
  });
}

const GREETING =
  '👋 Hi! I am your document assistant.\n\n' +
  'Send me a *PDF* and I can summarize it, answer questions about it, run OCR ' +
  'on scans, convert it to Word, extract tables, translate it, and more.';

// Branded onboarding, sent once on a new user's very first message.
const WELCOME =
  '👋 Welcome to *Papyr* — documents, on WhatsApp!\n\n' +
  'Send me a *PDF* and I can:\n' +
  '📝 Summarize it\n' +
  '💬 Answer questions about it\n' +
  '📄 Convert it to Word\n' +
  '📊 Extract tables to Excel\n' +
  '🌐 Translate it\n' +
  '🔍 Read scanned pages (OCR)\n\n' +
  'Just send a PDF to begin — it’s free while in beta. 🚀';

const GREETING_RE = /^(hi|hello|hey|start|menu|help|hii+|yo|hola)\b/i;

/** Best-effort usage ping to the owner's own number, if configured. WhatsApp
 *  only delivers business-initiated messages inside a 24h window, so this is
 *  fire-and-forget — never blocks or fails the user's request. Skips pinging
 *  the owner about the owner's own testing. */
function notifyOwner(text, fromUser) {
  const owner = config.whatsapp.ownerNumber;
  if (!owner || owner === fromUser) return;
  wa.sendText(owner, text).catch(() => {});
}

// ─── Public entrypoint ───────────────────────────────────────────────────────

/**
 * Handle one inbound message. `message` is a raw WhatsApp message object;
 * `contact` carries the sender's profile. Never throws — any failure is caught
 * and reported to the user.
 */
export async function handleMessage(message, contact) {
  const from = message.from;
  const name = contact?.profile?.name;
  wa.markRead(message.id);

  // First-ever contact from this sender → branded welcome + owner ping.
  const isNew = firstTouch(from);
  if (isNew) {
    await wa.sendText(from, WELCOME).catch(() => {});
    log.info('metric event=new_user');
    notifyOwner('🎉 A new person just started using Papyr.', from);
  }

  try {
    switch (message.type) {
      case 'document':
        return await handleDocument(from, message.document, name);
      case 'interactive':
        return await handleInteractive(from, message.interactive);
      case 'text': {
        // A brand-new user who just said "hi" already got the welcome above;
        // don't immediately follow it with the near-identical greeting.
        const body = message.text?.body || '';
        if (isNew && !getSession(from) && GREETING_RE.test(body.trim())) return undefined;
        return await handleText(from, body);
      }
      case 'image':
      case 'audio':
      case 'video':
      case 'sticker':
        return await wa.sendText(
          from,
          "I work with PDF documents for now. Send me a PDF and I'll get to work! " +
            '(Images, audio, and other file types are on the roadmap.)',
        );
      default:
        return await wa.sendText(from, GREETING);
    }
  } catch (err) {
    // Diagnostic enough to spot e.g. an OCR timeout in logs (err.message says
    // so — see the withTimeout label below) — never the document's own text.
    log.error('handleMessage failed:', err);
    // Content-free failure metric: error CLASS only (never the message, which
    // could echo content), so beta can measure a failure rate and rough kind.
    log.info(`metric error kind=${err?.name || 'Error'} type=${message?.type || 'unknown'}`);
    await wa.sendText(from, friendlyErrorMessage(err)).catch(() => {});
  }
}

// ─── Inbound document ────────────────────────────────────────────────────────

async function handleDocument(from, doc, name) {
  const filename = doc?.filename || 'document.pdf';
  const isPdf =
    doc?.mime_type === 'application/pdf' || filename.toLowerCase().endsWith('.pdf');

  if (!isPdf) {
    return wa.sendText(
      from,
      `I can only read PDF files right now, and "${filename}" isn't one. ` +
        'Please send a PDF.',
    );
  }

  await wa.sendText(from, `📥 Got *${filename}*. Reading it now — one moment…`);

  let buffer;
  let mimeType;
  try {
    ({ buffer, mimeType } = await wa.downloadMedia(doc.id, {
      maxBytes: config.server.maxPdfBytes,
    }));
  } catch (err) {
    if (err instanceof wa.MediaTooLargeError) {
      const mb = (config.server.maxPdfBytes / (1024 * 1024)).toFixed(0);
      return wa.sendText(from, `That file is too large. Please send a PDF under ${mb} MB.`);
    }
    throw err;
  }
  log.info(`Received ${filename} (${mimeType}, ${buffer.length} bytes) from ${from}`);

  // Two layers, deliberately staggered. The INNER one (ocr-runner.js) owns the
  // OCR budget and actually terminates the worker thread; this OUTER one is a
  // last-resort net for the non-OCR (digital) work that still runs on this
  // thread. It gets a margin so it can't fire first and reject while leaving
  // the worker orphaned — the terminating timeout must always win.
  const ingestStart = Date.now();
  const { text, spanPages, pageCount, ocrUsed, ocrUnavailable, lowConfidencePages } =
    await withTimeout(
      extractStructured(buffer),
      config.ocr.timeoutMs + EXTRACTION_TIMEOUT_MARGIN_MS,
      'PDF extraction/OCR',
    );
  const ingestMs = Date.now() - ingestStart;

  if (!text || text.trim().length < 10) {
    if (ocrUnavailable) {
      return wa.sendText(
        from,
        'This looks like a scanned PDF, and OCR failed while reading it. Please try again, ' +
          'or send a clearer scan.',
      );
    }
    return wa.sendText(
      from,
      "I couldn't find any readable text in that PDF. It may be empty or corrupted.",
    );
  }

  // Assess layout complexity once, up front (deterministic geometry, no AI,
  // no stored content) so conversions can warn honestly on layouts the
  // converter can't reconstruct faithfully instead of shipping confident
  // nonsense. See extract/complexity.js.
  const layout = assessLayout(spanPages);

  // Keep the extracted text + structured spans in memory for follow-up actions
  // (DOCX/XLSX conversion). We do NOT persist the original document to disk — it
  // is the user's private content and nothing reads the raw bytes back.
  setDocument(from, { text, filename, spanPages, ocrUsed, layout });

  // Content-free usage metric: whether real users hit complex layouts, how
  // often, how big their files are, and how long processing takes — the signals
  // that drive the beta economics/Engine-B decision. Counts and a pseudonymous
  // user tag only (see hashSender) — never document text or the phone number.
  log.info(
    `metric ingest pages=${pageCount} bytes=${buffer.length} ms=${ingestMs} ` +
      `columns=${layout.columnCount} complex=${layout.complex} ` +
      `crossCol=${layout.crossColumnRatio} ocr=${ocrUsed}${userTag(from)}`,
  );

  // Usage ping to the owner (no filename/content — could be personal).
  notifyOwner(
    `📥 Papyr: a ${pageCount}-page ${ocrUsed ? 'scanned' : 'digital'} PDF was received` +
      `${layout.complex ? ' (complex layout)' : ''}.`,
    from,
  );

  const badges = [];
  badges.push(`${pageCount} page${pageCount === 1 ? '' : 's'}`);
  if (ocrUsed) badges.push('OCR ✅');
  const greetName = name ? `, ${name.split(' ')[0]}` : '';

  let note = '';
  if (lowConfidencePages?.length) {
    note =
      `\n\n⚠️ Pages ${lowConfidencePages.join(', ')} were hard to read (low-quality scan) — ` +
      'double-check anything important from those pages.';
  }

  return sendMenu(
    from,
    `✅ Ready${greetName}! I read *${filename}* (${badges.join(' · ')}).${note}\n\n` +
      'Pick an action below, or just tell me what you need in your own words.',
  );
}

// ─── Interactive (button / list) replies ─────────────────────────────────────

async function handleInteractive(from, interactive) {
  const replyId =
    interactive?.list_reply?.id || interactive?.button_reply?.id || '';
  return runAction(from, replyId, {});
}

// ─── Free text ───────────────────────────────────────────────────────────────

async function handleText(from, body) {
  const text = body.trim();
  if (!text) return;

  const session = getSession(from);

  // No active document — greet / guide.
  if (!session) {
    if (/^(hi|hello|hey|start|menu|help)\b/i.test(text)) {
      return wa.sendText(from, GREETING);
    }
    return wa.sendText(
      from,
      'Send me a *PDF* first, then I can summarize it, answer questions, convert ' +
        'it to Word, and more.',
    );
  }

  // Resolve any pending follow-up the last action was waiting on.
  if (session.pending?.type === 'awaiting_question') {
    clearPending(from);
    return runAction(from, 'ask', { question: text });
  }
  if (session.pending?.type === 'awaiting_language') {
    clearPending(from);
    return runAction(from, 'translate', { language: text });
  }

  // Otherwise, interpret the message as an intent over the active document.
  const { intent, question, language } = await ai.classifyIntent(text);
  if (intent === 'unknown') {
    return sendMenu(
      from,
      "I'm not sure what you'd like. Here's what I can do with this document:",
    );
  }
  return runAction(from, intent, { question: question ?? text, language });
}

// ─── Action dispatch ─────────────────────────────────────────────────────────

async function runAction(from, action, opts) {
  const session = getSession(from);
  if (!session) {
    return wa.sendText(from, 'That document expired. Please send the PDF again.');
  }
  const { doc } = session;

  // Content-free usage metric: which action was requested. Answers the beta
  // question "what do people actually do with a document" (the conversion mix)
  // without logging any document content.
  log.info(`metric action=${action}${userTag(from)}`);

  switch (action) {
    case 'menu':
      return sendMenu(from);

    case 'summarize': {
      await wa.sendText(from, '📝 Summarizing…');
      const out = await ai.summarize(doc.text, doc.filename);
      return wa.sendText(from, out);
    }

    case 'eli': {
      await wa.sendText(from, '🧒 Putting it in simple terms…');
      const out = await ai.explainSimply(doc.text, doc.filename);
      return wa.sendText(from, out);
    }

    case 'extract_tables':
      return convertToExcel(from, doc);

    case 'ask': {
      const question = (opts.question || '').trim();
      if (!question) {
        setPending(from, { type: 'awaiting_question' });
        return wa.sendText(from, '💬 Sure — what would you like to know about the document?');
      }
      await wa.sendText(from, '💬 Thinking…');
      const out = await ai.answer(doc.text, question, session.history);
      addQa(from, question, out);
      return wa.sendText(from, out);
    }

    case 'translate': {
      const language = (opts.language || '').trim();
      if (!language) {
        setPending(from, { type: 'awaiting_language' });
        return wa.sendText(from, '🌐 Which language should I translate it into?');
      }
      await wa.sendText(from, `🌐 Translating into ${language}…`);
      const out = await ai.translate(doc.text, language);
      return wa.sendText(from, out);
    }

    case 'convert_word': {
      await wa.sendText(from, '📄 Building your Word document…');
      const title = stripExt(doc.filename);
      // Structured DOCX from spans; if spans are unavailable (e.g. OCR-only
      // scans), fall back to the plain-text builder.
      const wordStart = Date.now();
      const docxBuffer = await withTimeout(
        doc.spanPages && doc.spanPages.length
          ? buildDocx(buildDocModel(doc.spanPages), { title })
          : textToDocx(doc.text, title),
        config.server.conversionTimeoutMs,
        'Word conversion',
      );
      const mediaId = await wa.uploadMedia(
        docxBuffer,
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        `${title}.docx`,
      );
      log.info(
        `metric convert action=word ms=${Date.now() - wordStart} ` +
          `complex=${Boolean(doc.layout?.complex)} columns=${doc.layout?.columnCount ?? '?'}`,
      );
      // Honest warning for layouts we can't reconstruct faithfully (3+ column
      // designer templates): the styling comes through but reading order may
      // scramble, so tell the user rather than let them discover it.
      const caption = doc.layout?.complex
        ? '✅ Here is your editable Word version.\n\n' +
          '⚠️ This PDF uses a complex multi-column layout, so the *reading order* ' +
          'of the text may not be perfectly preserved. The original PDF remains ' +
          'the authoritative version.'
        : '✅ Here is your editable Word version.';
      return wa.sendDocument(from, { mediaId, filename: `${title}.docx`, caption });
    }

    default:
      return sendMenu(from, "I didn't recognize that action. Try one of these:");
  }
}

// Deterministic PDF → Excel. Detects tables from span geometry (no LLM), and —
// per the hard product rule — sends a transparent text fallback rather than a
// fabricated grid when no table clears the confidence threshold.
async function convertToExcel(from, doc) {
  await wa.sendText(from, '📊 Looking for tables…');
  const start = Date.now();

  const NO_TABLE =
    "I couldn't reliably detect a table in this PDF, so I didn't create a " +
    'spreadsheet (I won\'t guess columns and risk getting them wrong). If you ' +
    'expected a table, it may be an image/scan — OCR tables are coming soon.';

  if (!doc.spanPages || !doc.spanPages.length) {
    log.info(`metric convert action=excel tables=0 outcome=no-spans ms=${Date.now() - start}`);
    return wa.sendText(from, NO_TABLE);
  }

  const tables = detectTablesAcrossPages(doc.spanPages)
    .filter((t) => t.confidence >= TABLE_CONFIDENCE_MIN)
    .slice(0, config.server.maxTables);

  if (!tables.length) {
    log.info(`metric convert action=excel tables=0 outcome=no-table ms=${Date.now() - start}`);
    return wa.sendText(from, NO_TABLE);
  }

  const title = stripExt(doc.filename);
  const xlsxBuffer = await withTimeout(
    buildXlsx(tables),
    config.server.conversionTimeoutMs,
    'Excel conversion',
  );
  log.info(`metric convert action=excel tables=${tables.length} outcome=ok ms=${Date.now() - start}`);
  const mediaId = await wa.uploadMedia(
    xlsxBuffer,
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    `${title}.xlsx`,
  );
  const n = tables.length;
  return wa.sendDocument(from, {
    mediaId,
    filename: `${title}.xlsx`,
    caption: `✅ Extracted ${n} table${n === 1 ? '' : 's'} into an Excel file.`,
  });
}

// Derive a safe title from a user-supplied filename: strip the directory and
// extension, remove control/reserved characters, and bound the length. Used for
// the .docx title and the outgoing document filename.
function stripExt(filename) {
  const base = path.basename(String(filename || ''));
  const noExt = base.replace(/\.[^.]+$/, '');
  // Reserved / path chars by code point (<>:"/\|?*), no backslash literal needed.
  const RESERVED = new Set([60, 62, 58, 34, 47, 92, 124, 63, 42]);
  const safe = Array.from(noExt)
    .filter((ch) => ch.codePointAt(0) >= 0x20 && !RESERVED.has(ch.codePointAt(0)))
    .join('')
    .trim()
    .slice(0, 100);
  return safe || 'document';
}
