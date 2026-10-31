// Produces the public sample analysis (src/sample/aiims-bbsr-pump-motors.json):
// TenderTez's standard analysis of one public tender. It needs the
// production AI provider, so it runs inside the Fly machine (see
// OPERATIONS.md, "Sample analysis"). It writes nothing to the database: the
// same extraction, chunking, AI call, validation and aggregation as the app,
// in memory, printed as one JSON line after "SAMPLE_JSON ". One run costs
// one tender's analysis (3 AI calls for this 35-page tender).
//
//   node scripts/sample-analysis-run.mjs
import crypto from 'node:crypto';
import { extractStructured } from '../src/pdf.js';
import { spansToText } from '../src/extract/spans.js';
import { config } from '../src/config.js';
import { chunkPages } from '../src/bidpilot/analysis/chunker.js';
import { extractChunk } from '../src/bidpilot/analysis/extract.js';
import { validateChunkResult } from '../src/bidpilot/analysis/schema.js';
import { aggregateResults } from '../src/bidpilot/analysis/aggregate.js';

const URL_ = 'https://aiimsbhubaneswar.nic.in/wp-content/uploads/2026/05/NIT11.pdf';
const SHA = '37610702beedddbac0d1d6bb4c18dda9541e28147040e4bfcac7c13ca964c91e';

const res = await fetch(URL_, { headers: { 'user-agent': 'TenderTez sample (tendertez.in)' } });
const buffer = Buffer.from(await res.arrayBuffer());
const sha = crypto.createHash('sha256').update(buffer).digest('hex');
if (sha !== SHA) { console.log(JSON.stringify({ error: 'pdf changed', status: res.status, sha })); process.exit(1); }

const started = Date.now();
const extracted = await extractStructured(buffer);
const pages = extracted.spanPages.map((p) => ({ pageNumber: p.page, rawText: spansToText([p]), ocrUsed: Boolean(p.ocr) }));
const chunks = chunkPages(pages, { maxChars: config.bidpilot.analysis.chunkChars });
const results = [];
let failures = 0;
for (const chunk of chunks) {
  let raw = await extractChunk(chunk);
  if (raw === null) raw = await extractChunk(chunk);
  if (raw === null) { failures += 1; continue; }
  results.push(validateChunkResult(raw, { validPages: new Set(chunk.pages) }));
}
const aggregated = aggregateResults(results);
console.log('SAMPLE_JSON ' + JSON.stringify({
  source: URL_, sha256: sha, pageCount: pages.length, ocrUsed: extracted.ocrUsed,
  chunks: chunks.length, failedChunks: failures, ms: Date.now() - started,
  analysedAt: new Date().toISOString(), aggregated,
}));
