// The sample analysis is in the page from the start (backend samplePage.js),
// so the page's first render is the loaded page and nothing moves when the
// app starts: the server renders it with this context set
// (prerender.tsx renderSample), and puts the same data in a JSON block that
// the browser reads here. A JSON block is data, not a script, so the strict
// CSP allows it.
import { createContext } from 'react';
import type { SampleAnalysis } from '../api/sample';

export const SAMPLE_DATA_ID = 'sample-analysis-data';

/** The data for the server render. */
export const SampleDataContext = createContext<SampleAnalysis | null>(null);

/** The data the server put in this page, or null (opened from another page,
 *  or the block is missing): the page then fetches it. */
export function embeddedSample(): SampleAnalysis | null {
  if (typeof document === 'undefined') return null;
  const text = document.getElementById(SAMPLE_DATA_ID)?.textContent;
  if (!text) return null;
  try {
    return JSON.parse(text) as SampleAnalysis;
  } catch {
    return null;
  }
}
