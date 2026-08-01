// Local test harness — exercise the document pipeline without WhatsApp.
// -----------------------------------------------------------------------------
// Runs a real PDF through the same extraction, OCR, AI, and .docx code the bot
// uses, printing results to the terminal. This is the fastest way to see the
// core logic working before wiring up the WhatsApp Cloud API.
//
// Usage:
//   node scripts/try.mjs <file.pdf> extract
//   node scripts/try.mjs <file.pdf> summarize
//   node scripts/try.mjs <file.pdf> ask "your question"
//   node scripts/try.mjs <file.pdf> tables
//   node scripts/try.mjs <file.pdf> translate "Hindi"
//   node scripts/try.mjs <file.pdf> eli
//   node scripts/try.mjs <file.pdf> word            (writes <name>.docx)
//
// `extract` and `word` need no API key. The AI actions need the selected
// provider's key (OPENAI_API_KEY or ANTHROPIC_API_KEY — see AI_PROVIDER).

import fs from 'node:fs/promises';
import path from 'node:path';
import { extractText } from '../src/pdf.js';
import { textToDocx } from '../src/docx.js';
import * as ai from '../src/ai/index.js';

const [, , file, action = 'summarize', arg] = process.argv;

function die(msg) {
  console.error(`\n✖ ${msg}\n`);
  process.exit(1);
}

if (!file) {
  die('Usage: node scripts/try.mjs <file.pdf> <extract|summarize|ask|tables|translate|eli|word> [arg]');
}

const buffer = await fs.readFile(file).catch(() => die(`Cannot read file: ${file}`));

console.log(`\n📄 ${path.basename(file)} (${buffer.length} bytes)\n`);
const { text, pages, ocrUsed, ocrUnavailable } = await extractText(buffer);
console.log(`   pages: ${pages} · chars: ${text.length}` +
  (ocrUsed ? ' · OCR used ✅' : '') +
  (ocrUnavailable ? ' · scanned but OCR unavailable (install poppler-utils) ⚠️' : ''));
console.log('─'.repeat(60));

switch (action) {
  case 'extract':
    console.log(text.slice(0, 4000));
    break;
  case 'summarize':
    console.log(await ai.summarize(text, path.basename(file)));
    break;
  case 'ask':
    if (!arg) die('Provide a question: ... ask "what is this about?"');
    console.log(await ai.answer(text, arg));
    break;
  case 'tables':
    console.log(await ai.extractTables(text));
    break;
  case 'translate':
    if (!arg) die('Provide a language: ... translate "Hindi"');
    console.log(await ai.translate(text, arg));
    break;
  case 'eli':
    console.log(await ai.explainSimply(text, path.basename(file)));
    break;
  case 'word': {
    const out = file.replace(/\.[^.]+$/, '') + '.docx';
    await fs.writeFile(out, await textToDocx(text, path.basename(file, path.extname(file))));
    console.log(`✅ Wrote ${out}`);
    break;
  }
  default:
    die(`Unknown action: ${action}`);
}
console.log();
