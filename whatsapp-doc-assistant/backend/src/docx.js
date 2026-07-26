// PDF-text → Word (.docx) conversion.
// -----------------------------------------------------------------------------
// Turns extracted plain text into a readable Word document. This is a text-layer
// conversion (paragraphs and headings), not a pixel-perfect layout clone — good
// enough to edit the content in Word, which is what most people actually want.

import { Document, Packer, Paragraph, HeadingLevel, TextRun } from 'docx';

/**
 * Build a .docx from plain text and return it as a Buffer.
 * @param {string} text     Extracted document text.
 * @param {string} title    Document title (usually the original filename).
 */
export async function textToDocx(text, title = 'Converted document') {
  const blocks = splitIntoBlocks(text);

  const children = [
    new Paragraph({ text: title, heading: HeadingLevel.TITLE }),
    ...blocks.map((block) =>
      looksLikeHeading(block)
        ? new Paragraph({ text: block.trim(), heading: HeadingLevel.HEADING_2 })
        : new Paragraph({ children: [new TextRun(block)] }),
    ),
  ];

  const doc = new Document({ sections: [{ children }] });
  return Packer.toBuffer(doc);
}

/** Split text on blank lines into paragraph-sized blocks, dropping empties. */
function splitIntoBlocks(text) {
  return String(text || '')
    .replace(/\r\n/g, '\n')
    .split(/\n\s*\n/)
    .map((b) => b.replace(/\n/g, ' ').trim())
    .filter(Boolean);
}

/** Heuristic: short, title-cased, punctuation-free lines read as headings. */
function looksLikeHeading(block) {
  const trimmed = block.trim();
  return (
    trimmed.length > 0 &&
    trimmed.length <= 80 &&
    !/[.!?,;:]$/.test(trimmed) &&
    trimmed.split(/\s+/).length <= 10
  );
}
