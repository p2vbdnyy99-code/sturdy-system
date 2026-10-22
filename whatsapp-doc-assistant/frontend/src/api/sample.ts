// The public sample analysis (backend src/samplePage.js): TenderTez's output
// for one public tender, shown as produced.
import { request } from './client';

type Cited = { page: number | null; quote: string | null };

export type SampleAnalysis = {
  about: { tender: string; publishedBy: string; note: string };
  sourceUrl: string;
  pageCount: number;
  analysedAt: string;
  failedSections: number;
  keyFacts: Array<Cited & { key: string; label: string; value: string }>;
  dates: Array<Cited & { label: string; text: string }>;
  pointsToCheck: Array<Cited & { text: string }>;
  checklist: Array<{
    category: string;
    label: string;
    items: Array<Cited & { label: string; detail: string | null; category: string; mandatory: boolean }>;
  }>;
  checklistCount: number;
  boq: Array<{
    item: string | null; description: string; quantity: string | null; unit: string | null;
    specification: string | null; remarks: string | null; page: number | null;
  }>;
};

export function getSampleAnalysis() {
  return request<SampleAnalysis>('/bidpilot/public/sample-analysis');
}
