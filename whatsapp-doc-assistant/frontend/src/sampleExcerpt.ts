// Short excerpts of the public sample analysis (/sample-analysis), shown on
// the home page and in the guides so a visitor sees real output, not a mock.
//
// Every string here is copied exactly from TenderTez's stored, unedited
// analysis of the AIIMS Bhubaneswar NIT (backend/src/sample/
// aiims-bbsr-pump-motors.json), with the page the analysis gave.
// sampleExcerpt.test.ts fails if any value or page differs from that file,
// so these lines can't drift from the sample or be reworded by hand.
// Never add a value here that the stored analysis does not contain.

export type ExcerptLine = { text: string; page: number };
export type ExcerptRequirement = { title: string; description: string; page: number };

export const SAMPLE_EXCERPT = {
  /** Short name for the tender, written by us (not analysis output). */
  tenderShort: 'AIIMS Bhubaneswar: pump motor sets for pump houses and STPs',
  organisation: 'All India Institute of Medical Sciences, Bhubaneswar',
  pageCount: 35,
  /** Bid submission closed on this date; the sample is shown as an example only. */
  closedOn: '30 May 2026',
  facts: {
    estimatedValue: { text: 'Rs. 40,35,586.00', page: 3 },
    emd: { text: '2% of the estimated value', page: 4 },
    contractDuration: { text: '60 days', page: 4 },
    submissionDeadline: { text: '30/05/2026 at 18:00 Hours', page: 4 },
  } satisfies Record<string, ExcerptLine>,
  points: {
    emdExemption: { text: 'EMD exemption is expressly disallowed, and failure to provide the required EMD can lead to rejection.', page: 12 },
    delayPenalty: { text: 'Delay penalty is 2% per month, computed on a per-day basis, capped at 10% of total tender value.', page: 14 },
  } satisfies Record<string, ExcerptLine>,
  requirements: {
    turnover: {
      title: 'Average annual turnover',
      description: 'Average annual financial turnover for the last three years ending 31 March 2025 must exceed 50% of the estimated cost.',
      page: 11,
    },
    similarWork: {
      title: 'Similar-work experience threshold',
      description: 'Bidder must have completed, in the last seven years ending on the tender-submission deadline, either three similar works of at least 40% of estimated cost each, two similar works of at least 60% each, or one similar work of at least 80%. Similar work means supply and installation of various types of pump motor sets.',
      page: 11,
    },
    emdSubmission: {
      title: 'EMD submission',
      description: 'Submit EMD equal to 2% of estimated value by DD, PBG, or FDR; upload the scanned copy and submit original DD with technical-bid documents. Bids without EMD demand drafts will be rejected. EMD exemption is not allowed.',
      page: 11,
    },
  } satisfies Record<string, ExcerptRequirement>,
  /** How many points to check the analysis flagged, and how many checklist lines it produced. */
  pointsCount: 17,
  checklistCount: 64,
} as const;

/** Anchors of the sections on /sample-analysis. */
export const SAMPLE_SECTIONS = {
  keyFacts: '/sample-analysis#key-facts',
  dates: '/sample-analysis#dates',
  points: '/sample-analysis#points',
  checklist: '/sample-analysis#checklist',
} as const;
