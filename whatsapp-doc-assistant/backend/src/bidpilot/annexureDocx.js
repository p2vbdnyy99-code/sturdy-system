// The Word file for a drafted annexure: the tender's own wording (stored as
// paragraphs with placeholders, analysis/annexures.js) with the bidder's
// details filled in from the profile as it is now. A detail the profile
// doesn't have, and every blank only the bidder can fill (a date, the tender
// number), is printed as "[to fill: …]" in yellow, so nothing is guessed.

import { Document, Packer, Paragraph, TextRun, HeadingLevel } from 'docx';
import { DRAFT_FIELDS } from './analysis/annexures.js';

export const FIELD_LABELS = {
  companyName: 'Bidder name',
  registeredAddress: 'Registered address',
  pan: 'PAN',
  gstin: 'GSTIN',
  signatoryName: 'Signatory name',
  signatoryDesignation: 'Designation',
  contactPhone: 'Phone',
  contactEmail: 'Email',
  registrationDetails: 'Registration details',
  businessType: 'Type of firm',
  yearsInBusiness: 'Years in business',
  annualTurnover: 'Annual turnover',
  netWorth: 'Net worth',
  employeeCount: 'Number of employees',
};

const PLACEHOLDER = /\{\{(field|blank):([^}]*)\}\}/g;

function rupees(v) {
  const n = Number(v);
  return Number.isFinite(n) ? `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}` : String(v);
}

/** The values a draft can use, from a company or client profile. Empty ones are left out. */
export function draftValues(profile, bidderName) {
  const out = {};
  const put = (k, v) => { if (v !== null && v !== undefined && String(v).trim()) out[k] = String(v).trim(); };
  put('companyName', bidderName);
  if (profile) {
    for (const k of ['registeredAddress', 'pan', 'gstin', 'signatoryName', 'signatoryDesignation', 'contactPhone',
      'contactEmail', 'registrationDetails', 'businessType']) put(k, profile[k]);
    if (profile.yearsInBusiness != null) put('yearsInBusiness', profile.yearsInBusiness);
    if (profile.employeeCount != null) put('employeeCount', profile.employeeCount);
    if (profile.annualTurnover != null) put('annualTurnover', rupees(profile.annualTurnover));
    if (profile.netWorth != null) put('netWorth', rupees(profile.netWorth));
  }
  return out;
}

/** The fields a draft uses, and which of them the profile can't fill yet. */
export function draftCoverage(blocks, values) {
  const used = new Set();
  let blanks = 0;
  for (const b of blocks) {
    for (const m of b.text.matchAll(PLACEHOLDER)) {
      if (m[1] === 'field' && Object.prototype.hasOwnProperty.call(DRAFT_FIELDS, m[2])) used.add(m[2]);
      else blanks += 1;
    }
  }
  const missing = [...used].filter((k) => !values[k]);
  return { fieldsUsed: [...used], missing, missingLabels: missing.map((k) => FIELD_LABELS[k]), blanks };
}

function runsFor(text, values) {
  const runs = [];
  let last = 0;
  for (const m of text.matchAll(PLACEHOLDER)) {
    if (m.index > last) runs.push(new TextRun(text.slice(last, m.index)));
    const [, kind, name] = m;
    if (kind === 'field' && values[name]) runs.push(new TextRun({ text: values[name], bold: true }));
    else {
      const label = kind === 'field' ? FIELD_LABELS[name] ?? 'To fill' : name;
      runs.push(new TextRun({ text: `[to fill: ${label}]`, highlight: 'yellow' }));
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) runs.push(new TextRun(text.slice(last)));
  return runs;
}

/**
 * @param {{ title: string, tenderTitle: string, pages: number[], blocks: Array<{text: string}>,
 *   values: Record<string,string>, bidderName: string, today?: string }} draft
 * @returns {Promise<Buffer>}
 */
export async function buildAnnexureDocx({ title, tenderTitle, pages, blocks, values, bidderName, today }) {
  const pageText = pages.length > 1 ? `pages ${pages[0]}–${pages[pages.length - 1]}` : `page ${pages[0]}`;
  const date = today ?? new Date().toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'long', year: 'numeric' });
  const doc = new Document({
    creator: 'TenderTez',
    title,
    description: `Draft of ${title} from ${tenderTitle}`,
    sections: [{
      children: [
        new Paragraph({
          children: [new TextRun({
            text: `Draft by TenderTez from “${tenderTitle}”, ${pageText}, filled from ${bidderName}’s profile on ${date}. `
              + 'Yellow text is still to fill. Check every line against the tender, print on your letterhead and sign.',
            italics: true,
            size: 18,
            color: '5A6577',
          })],
          spacing: { after: 240 },
        }),
        new Paragraph({ text: title, heading: HeadingLevel.HEADING_2, spacing: { after: 200 } }),
        ...blocks.map((b) => new Paragraph({ children: runsFor(b.text, values), spacing: { after: 160 } })),
      ],
    }],
  });
  return Packer.toBuffer(doc);
}
