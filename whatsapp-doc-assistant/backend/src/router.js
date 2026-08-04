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
import { config } from './config.js';
import { log } from './logger.js';
import { extractStructured } from './pdf.js';
import { buildDocModel } from './docmodel.js';
import { buildDocx, textToDocx } from './docx.js';
import { detectTablesAcrossPages, TABLE_CONFIDENCE_MIN } from './extract/tables.js';
import { buildXlsx } from './xlsx.js';
import {
  getSession,
  setDocument,
  addQa,
  setPending,
  clearPending,
} from './sessions.js';

// Bound any single conversion in wall-clock time so a pathological PDF can't pin
// the worker. Rejects with a friendly error the router already handles.
function withTimeout(promise, ms, label) {
  let timer;
  const guard = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out`)), ms);
    timer.unref?.();
  });
  return Promise.race([promise, guard]).finally(() => clearTimeout(timer));
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

  try {
    switch (message.type) {
      case 'document':
        return await handleDocument(from, message.document, name);
      case 'interactive':
        return await handleInteractive(from, message.interactive);
      case 'text':
        return await handleText(from, message.text?.body || '');
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
    log.error('handleMessage failed:', err);
    // Surface a short, safe message for known AI problems; stay generic otherwise.
    // Raw SDK errors, stack traces, and API keys never reach the user.
    const friendly =
      err instanceof ai.AIError
        ? `⚠️ ${err.userMessage}`
        : '⚠️ Something went wrong on my side. Please try again in a moment.';
    await wa.sendText(from, friendly).catch(() => {});
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

  const { text, spanPages, pageCount, ocrUsed, ocrUnavailable, lowConfidencePages } =
    await extractStructured(buffer);

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

  // Keep the extracted text + structured spans in memory for follow-up actions
  // (DOCX/XLSX conversion). We do NOT persist the original document to disk — it
  // is the user's private content and nothing reads the raw bytes back.
  setDocument(from, { text, filename, spanPages, ocrUsed });

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
      return wa.sendDocument(from, {
        mediaId,
        filename: `${title}.docx`,
        caption: '✅ Here is your editable Word version.',
      });
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

  const NO_TABLE =
    "I couldn't reliably detect a table in this PDF, so I didn't create a " +
    'spreadsheet (I won\'t guess columns and risk getting them wrong). If you ' +
    'expected a table, it may be an image/scan — OCR tables are coming soon.';

  if (!doc.spanPages || !doc.spanPages.length) {
    return wa.sendText(from, NO_TABLE);
  }

  const tables = detectTablesAcrossPages(doc.spanPages)
    .filter((t) => t.confidence >= TABLE_CONFIDENCE_MIN)
    .slice(0, config.server.maxTables);

  if (!tables.length) {
    return wa.sendText(from, NO_TABLE);
  }

  const title = stripExt(doc.filename);
  const xlsxBuffer = await withTimeout(
    buildXlsx(tables),
    config.server.conversionTimeoutMs,
    'Excel conversion',
  );
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
