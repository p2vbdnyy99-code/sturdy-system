// Character-budget-based chunking of tender_pages for AI analysis.
// -----------------------------------------------------------------------------
// NOT "N pages per chunk" — a dense clause-heavy page and a mostly-blank
// cover page are wildly different workloads, and a fixed page count either
// wastes budget or overflows it. Groups CONSECUTIVE pages until adding the
// next one would exceed the character budget.
//
// Page identity is never separated from the text: each chunk's `text` field
// embeds an explicit `[PAGE N]` marker before every page's content, so a
// model extracting a fact from the MIDDLE of a multi-page chunk can still
// cite the exact page it came from — not just the chunk's overall range.
// `pages` also carries the plain page-number list for anything that only
// needs the range (e.g. logging).

/**
 * @param {Array<{pageNumber: number, rawText: string}>} pages
 * @param {{maxChars?: number}} opts
 * @returns {Array<{pages: number[], text: string}>}
 */
export function chunkPages(pages, { maxChars = 40_000 } = {}) {
  const sorted = [...pages].sort((a, b) => a.pageNumber - b.pageNumber);
  const chunks = [];
  let current = { pages: [], parts: [], chars: 0 };

  const flush = () => {
    if (current.pages.length) {
      chunks.push({ pages: current.pages, text: current.parts.join('\n\n') });
    }
    current = { pages: [], parts: [], chars: 0 };
  };

  for (const page of sorted) {
    const text = String(page.rawText || '').trim();
    const marker = `[PAGE ${page.pageNumber}]\n${text}`;

    // A single page bigger than the whole budget still gets its own chunk
    // (never silently dropped) rather than being split mid-text, which would
    // break a clause in half with no clean re-join point.
    if (current.pages.length && current.chars + marker.length > maxChars) {
      flush();
    }
    current.pages.push(page.pageNumber);
    current.parts.push(marker);
    current.chars += marker.length;
  }
  flush();

  return chunks;
}
