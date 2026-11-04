// The public sample analysis (/sample-analysis): TenderTez's real output for
// one public tender, so a visitor can see what an analysis looks like before
// creating an account. The data in src/sample/ was produced once by the
// standard pipeline and is shown as produced; this module only arranges it
// the way the app does (key facts, dates, the checklist ordering and
// de-duplication from repo/checklist.js, points to check, BOQ).
//
// Page numbers link to the tender PDF on the publisher's own website with
// #page=N, so every point can be checked against the original.

import fs from 'node:fs';
import express from 'express';
import { CATEGORY_ORDER, labelFor, requirementKey } from './bidpilot/repo/checklist.js';
import { publicPageHead } from './seo.js';
import { jsonDataBlock } from './dataBlock.js';

export const SAMPLE_PATH = '/sample-analysis';

const DATA = JSON.parse(fs.readFileSync(new URL('./sample/aiims-bbsr-pump-motors.json', import.meta.url), 'utf8'));

const OVERVIEW_LABELS = [
  ['organization', 'Organisation'], ['tenderNumber', 'Tender number'], ['location', 'Location'],
  ['estimatedValue', 'Estimated value'], ['emd', 'EMD'], ['tenderFee', 'Tender fee'],
  ['contractDuration', 'Completion period'], ['submissionDeadline', 'Bid submission deadline'],
  ['openingDate', 'Technical bid opening'],
];

export const CATEGORY_LABELS = {
  DOCUMENT: 'Documents', FINANCIAL: 'Financial', EXPERIENCE: 'Experience', CERTIFICATION: 'Certifications',
  LICENSE: 'Licences', LEGAL: 'Legal', TECHNICAL: 'Technical', MANPOWER: 'Manpower', EQUIPMENT: 'Equipment',
  OEM: 'OEM', GEOGRAPHIC: 'Location', SPECIAL_CONDITION: 'Special conditions', OTHER: 'Other',
};

/** The sample arranged for the page. Nothing is added or reworded. */
export function sampleView(data = DATA) {
  const a = data.aggregated;
  const keyFacts = OVERVIEW_LABELS
    .filter(([key]) => a.overview[key])
    .map(([key, label]) => ({ key, label, value: a.overview[key].value, page: a.overview[key].sourcePage, quote: a.overview[key].evidenceText }));

  // The checklist exactly as repo/checklist.js builds it: one line per
  // requirement, duplicates dropped, documents first.
  const seen = new Set();
  const lines = [];
  for (const r of a.requirements) {
    const key = requirementKey(r);
    if (seen.has(key)) continue;
    seen.add(key);
    lines.push({
      label: labelFor(r), detail: r.title ? r.description : null, category: r.category,
      mandatory: r.mandatory, page: r.sourcePage, quote: r.evidenceText,
    });
  }
  const checklist = CATEGORY_ORDER
    .map((category) => ({ category, label: CATEGORY_LABELS[category] ?? category, items: lines.filter((l) => l.category === category) }))
    .filter((g) => g.items.length);

  return {
    about: data.about,
    sourceUrl: data.source,
    pageCount: data.pageCount,
    analysedAt: data.analysedAt,
    failedSections: data.failedChunks,
    keyFacts,
    dates: a.dates.map((d) => ({ label: d.label, text: d.rawText, page: d.sourcePage, quote: d.evidenceText })),
    pointsToCheck: a.redFlags.map((f) => ({ text: f.description, page: f.sourcePage, quote: f.evidenceText })),
    checklist,
    checklistCount: lines.length,
    boq: a.boq.map((b) => ({
      item: b.itemNumber, description: b.description, quantity: b.quantity, unit: b.unit,
      specification: b.technicalSpecification, remarks: b.remarks, page: b.sourcePage,
    })),
  };
}

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// The id of the JSON block the app reads (frontend pages/sampleData.ts).
export const SAMPLE_DATA_ID = 'sample-analysis-data';


/** Server HTML for /sample-analysis. `renderApp(data)` is the app's own page
 *  rendered with the data (src/prerender.js sample), so the HTML is what the
 *  app shows and nothing moves when it starts; without it (the server bundle
 *  not loaded yet) the page's text in plain HTML. Either way the data is in
 *  the page, so the app's first render is the loaded page, not a loading
 *  message that the content later pushes down. */
export function renderSampleHtml(indexHtml, baseUrl, page, renderApp = () => null) {
  const v = sampleView();
  const data = JSON.parse(JSON.stringify(v)); // exactly what the app reads
  const app = renderApp(data);
  const body = app ?? plainSampleBody(v);
  const head = publicPageHead(page, `${baseUrl}${SAMPLE_PATH}`, baseUrl);
  const html = indexHtml
    .replace(/<title>[^<]*<\/title>/, head)
    .replace('<div id="root"></div>', `<div id="root">${body}</div>${jsonDataBlock(SAMPLE_DATA_ID, data)}`);
  return { html, rendered: app !== null };
}

function plainSampleBody(v) {
  const pageLink = (n) => (n ? ` (<a href="${esc(`${v.sourceUrl}#page=${n}`)}" rel="noopener" target="_blank">page ${n}</a>)` : '');
  return '<main><h1>Sample analysis: a real AIIMS Bhubaneswar tender</h1>'
    + `<p>This is TenderTez&rsquo;s analysis of a public tender: ${esc(v.about.tender)} (${v.pageCount} pages, `
    + `<a href="${esc(v.sourceUrl)}" rel="noopener" target="_blank">original PDF</a>). It is shown as produced, with the page each point came from. The tender closed on 30 May 2026.</p>`
    + `<h2>Key facts</h2><ul>${v.keyFacts.map((f) => `<li>${esc(f.label)}: ${esc(f.value)}${pageLink(f.page)}</li>`).join('')}</ul>`
    + `<h2>Points worth a second look</h2><ul>${v.pointsToCheck.map((p) => `<li>${esc(p.text)}${pageLink(p.page)}</li>`).join('')}</ul>`
    + `<h2>Submission checklist (${v.checklistCount} items)</h2>`
    + v.checklist.map((g) => `<h3>${esc(g.label)}</h3><ul>${g.items.map((i) => `<li>${esc(i.label)}${pageLink(i.page)}</li>`).join('')}</ul>`).join('')
    + '<p><a href="/register">Try TenderTez on your own tender: the first 5 are free</a>.</p></main>';
}

/** GET /public/sample-analysis: the page's data for the app. */
export function createSampleRouter() {
  const router = express.Router();
  const view = sampleView();
  router.get('/public/sample-analysis', (_req, res) => {
    res.set('Cache-Control', 'public, max-age=3600');
    res.json(view);
  });
  return router;
}
