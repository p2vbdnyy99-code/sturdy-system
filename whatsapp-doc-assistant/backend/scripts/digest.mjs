#!/usr/bin/env node
// Papyr beta digest — turn a pile of Render logs into the three numbers that matter.
// -----------------------------------------------------------------------------
// The app logs content-free `metric …` lines (counts, sizes, timings — never
// document text or phone numbers; see router.js / hashSender). This script reads
// those lines and prints a one-screen summary so you can watch the beta without
// scrolling raw logs. It parses ONLY `metric …` lines and ignores everything
// else, so you can pipe a whole log dump straight in.
//
// Usage:
//   # From a saved log file (download from Render → Logs → ⋯ → Download):
//   node scripts/digest.mjs render.log
//
//   # Or straight off a live tail / clipboard paste:
//   pbpaste | node scripts/digest.mjs
//   some-log-source | node scripts/digest.mjs
//
// It is intentionally dependency-free (Node stdlib only) and read-only.

import fs from 'node:fs';

// ─── Read input: file arg, or stdin ─────────────────────────────────────────
function readInput() {
  const file = process.argv[2];
  if (file && file !== '-') {
    if (!fs.existsSync(file)) {
      console.error(`digest: no such file: ${file}`);
      process.exit(1);
    }
    return fs.readFileSync(file, 'utf8');
  }
  if (process.stdin.isTTY) {
    console.error(
      'digest: no input.\n' +
        '  Pass a log file:   node scripts/digest.mjs render.log\n' +
        '  Or pipe logs in:   cat render.log | node scripts/digest.mjs',
    );
    process.exit(1);
  }
  return fs.readFileSync(0, 'utf8'); // fd 0 = stdin
}

// Pull `key=value` pairs out of one metric line into a plain object.
function fields(rest) {
  const out = {};
  for (const m of rest.matchAll(/(\w+)=(\S+)/g)) out[m[1]] = m[2];
  return out;
}

const num = (v) => (v === undefined ? NaN : Number(v));
const pct = (n, d) => (d ? `${((100 * n) / d).toFixed(0)}%` : '—');
const avg = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : NaN);
const bar = (n, d, width = 24) => {
  if (!d) return '';
  const filled = Math.round((width * n) / d);
  return '█'.repeat(filled) + '·'.repeat(width - filled);
};

// ─── Accumulators ────────────────────────────────────────────────────────────
const users = new Set(); // distinct pseudonymous user tags (needs METRICS_HASH_SALT)
let newUsers = 0;
let firstTs = null;
let lastTs = null;

const ingest = { count: 0, complex: 0, ocr: 0, pages: [], bytes: [], ms: [] };
const actions = new Map(); // action -> count
const convert = { word: 0, excel: { ok: 0, 'no-table': 0, 'no-spans': 0 } };
const errors = { total: 0, byKind: new Map() };

// ─── Parse ───────────────────────────────────────────────────────────────────
for (const raw of readInput().split('\n')) {
  const line = raw.trimEnd();
  const at = line.indexOf('metric ');
  if (at === -1) continue;

  // Timestamp (ISO) is at the head of the log line, if present.
  const ts = line.match(/^\S+/)?.[0];
  if (ts && /^\d{4}-\d{2}-\d{2}T/.test(ts)) {
    if (!firstTs || ts < firstTs) firstTs = ts;
    if (!lastTs || ts > lastTs) lastTs = ts;
  }

  const rest = line.slice(at + 'metric '.length);
  // Category is the leading word. Note `event`/`action` lines glue it to `=value`
  // (`metric action=word`), so match the word only — never split on whitespace.
  const kind = rest.match(/^\w+/)?.[0]; // ingest | action | convert | error | event
  const f = fields(rest);
  if (f.user) users.add(f.user);

  switch (kind) {
    case 'event':
      if (f.event === 'new_user') newUsers += 1;
      break;
    case 'ingest':
      ingest.count += 1;
      if (f.complex === 'true') ingest.complex += 1;
      if (f.ocr === 'true') ingest.ocr += 1;
      if (!Number.isNaN(num(f.pages))) ingest.pages.push(num(f.pages));
      if (!Number.isNaN(num(f.bytes))) ingest.bytes.push(num(f.bytes));
      if (!Number.isNaN(num(f.ms))) ingest.ms.push(num(f.ms));
      break;
    case 'action':
      actions.set(f.action, (actions.get(f.action) || 0) + 1);
      break;
    case 'convert':
      if (f.action === 'word') convert.word += 1;
      else if (f.action === 'excel') {
        const o = f.outcome || 'ok';
        convert.excel[o] = (convert.excel[o] || 0) + 1;
      }
      break;
    case 'error':
      errors.total += 1;
      { const key = `${f.kind || '?'} / ${f.type || '?'}`;
        errors.byKind.set(key, (errors.byKind.get(key) || 0) + 1); }
      break;
    default:
      break;
  }
}

// ─── Render ──────────────────────────────────────────────────────────────────
const L = [];
L.push('');
L.push('  ╭───────────────────────────────────────────────╮');
L.push('  │            Papyr — beta digest                 │');
L.push('  ╰───────────────────────────────────────────────╯');
if (firstTs || lastTs) L.push(`  window:  ${firstTs || '?'}  →  ${lastTs || '?'}`);
L.push('');

L.push('  COHORT');
L.push(`    new users welcomed .... ${newUsers}`);
L.push(
  `    distinct users seen ... ${users.size || '—'}` +
    (users.size ? '' : '   (set METRICS_HASH_SALT to enable)'),
);
L.push('');

L.push('  DOCUMENTS');
if (ingest.count === 0) {
  L.push('    (no PDFs ingested yet)');
} else {
  const mb = (b) => (b / 1024 / 1024).toFixed(1);
  L.push(`    PDFs ingested ......... ${ingest.count}`);
  L.push(
    `    complex layouts ....... ${ingest.complex}  (${pct(ingest.complex, ingest.count)})  ` +
      bar(ingest.complex, ingest.count),
  );
  L.push('        ↑ the Engine-B signal — build it only if this rate stays high');
  L.push(
    `    scanned / OCR ......... ${ingest.ocr}  (${pct(ingest.ocr, ingest.count)})  ` +
      bar(ingest.ocr, ingest.count),
  );
  L.push(`    avg pages ............. ${avg(ingest.pages).toFixed(1)}`);
  L.push(`    avg size .............. ${mb(avg(ingest.bytes))} MB`);
  L.push(`    avg ingest time ....... ${(avg(ingest.ms) / 1000).toFixed(1)} s`);
}
L.push('');

L.push('  ACTIONS  (what people asked for)');
if (actions.size === 0) {
  L.push('    (none yet)');
} else {
  const total = [...actions.values()].reduce((a, b) => a + b, 0);
  for (const [name, n] of [...actions].sort((a, b) => b[1] - a[1])) {
    L.push(`    ${name.padEnd(16)} ${String(n).padStart(4)}  ${bar(n, total, 16)}`);
  }
}
L.push('');

L.push('  CONVERSIONS  (the actual product)');
L.push(`    word .................. ${convert.word}`);
L.push(
  `    excel ................. ok ${convert.excel.ok}  ` +
    `no-table ${convert.excel['no-table']}  no-spans ${convert.excel['no-spans']}`,
);
L.push('');

L.push('  ERRORS');
if (errors.total === 0) {
  L.push('    none  ✅');
} else {
  L.push(`    total ................. ${errors.total}`);
  for (const [k, n] of [...errors.byKind].sort((a, b) => b[1] - a[1])) {
    L.push(`      ${String(n).padStart(4)}  ${k}`);
  }
}
L.push('');

console.log(L.join('\n'));
