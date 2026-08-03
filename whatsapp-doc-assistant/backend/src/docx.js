// Structured document model → DOCX (Phase 3).
// -----------------------------------------------------------------------------
// Renders the intermediate model (headings, paragraphs, lists, tables, page
// breaks) into an editable Word file with real runs — bold/italic/size/font
// preserved per run, headings by level, basic alignment, and genuine DOCX
// tables. This replaces the old "one plain paragraph per text block" approach.
//
// `buildDocx(model)` is the primary entry; `textToDocx(text)` is kept as a thin
// back-compat wrapper (used by the local CLI and as a text fallback).

import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  Table,
  TableRow,
  TableCell,
  WidthType,
  PageBreak,
} from 'docx';
import { fontFamily } from './extract/spans.js';

const HEADING = { 1: HeadingLevel.HEADING_1, 2: HeadingLevel.HEADING_2, 3: HeadingLevel.HEADING_3 };
const ALIGN = {
  left: AlignmentType.LEFT,
  center: AlignmentType.CENTER,
  right: AlignmentType.RIGHT,
  justify: AlignmentType.JUSTIFIED,
};

/** Convert model runs → docx TextRun[], preserving bold/italic/size/font. */
function toRuns(runs) {
  const out = [];
  for (const r of runs || []) {
    if (!r.text) continue;
    const family = fontFamily(r.fontName);
    out.push(
      new TextRun({
        text: r.text,
        bold: Boolean(r.bold),
        italics: Boolean(r.italic),
        ...(r.fontSize ? { size: Math.round(r.fontSize * 2) } : {}), // half-points
        ...(family && !/^(sans-serif|serif|monospace)$/i.test(family) ? { font: family } : {}),
      }),
    );
  }
  return out.length ? out : [new TextRun('')];
}

function renderTable(t) {
  const colCount = t.rows.reduce((m, r) => Math.max(m, r.length), 0);
  const rows = t.rows.map(
    (row, ri) =>
      new TableRow({
        children: Array.from({ length: colCount }, (_, ci) => {
          const text = row[ci] ?? '';
          return new TableCell({
            children: [
              new Paragraph({
                children: [new TextRun({ text: String(text), bold: ri === 0 && t.headerBold })],
              }),
            ],
          });
        }),
      }),
  );
  return new Table({ rows, width: { size: 100, type: WidthType.PERCENTAGE } });
}

function renderBlock(block) {
  switch (block.type) {
    case 'pagebreak':
      return new Paragraph({ children: [new PageBreak()] });
    case 'heading':
      return new Paragraph({
        heading: HEADING[block.level] || HeadingLevel.HEADING_3,
        alignment: ALIGN[block.align],
        children: toRuns(block.runs),
      });
    case 'listitem':
      return new Paragraph({
        indent: { left: 360 },
        children: toRuns(block.runs),
      });
    case 'table':
      return renderTable(block.table);
    case 'paragraph':
    default:
      return new Paragraph({ alignment: ALIGN[block.align], children: toRuns(block.runs) });
  }
}

/** Build an editable .docx Buffer from the intermediate document model. */
export async function buildDocx(model, { title } = {}) {
  const children = [];
  if (title) children.push(new Paragraph({ text: title, heading: HeadingLevel.TITLE }));
  for (const block of model.blocks || []) children.push(renderBlock(block));
  if (children.length === 0) children.push(new Paragraph({ children: [new TextRun('')] }));
  const doc = new Document({ sections: [{ children }] });
  return Packer.toBuffer(doc);
}

/** Back-compat: plain text → simple DOCX (paragraph per blank-line block). */
export async function textToDocx(text, title = 'Converted document') {
  const blocks = String(text || '')
    .replace(/\r\n/g, '\n')
    .split(/\n\s*\n/)
    .map((b) => b.replace(/\n/g, ' ').trim())
    .filter(Boolean)
    .map((t) => ({ type: 'paragraph', runs: [{ text: t }] }));
  return buildDocx({ blocks }, { title });
}
