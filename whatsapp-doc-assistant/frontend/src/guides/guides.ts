// The public guides (/guides). Each guide quotes only what its listed
// sources say; they were read in full on the date below. Re-check a guide
// against its sources before changing it, and change the date when you do.
// backend/src/seo.js holds the same paths, titles and dates (tested).

export const GUIDES_CHECKED = '2026-10-24';

export type GuideMeta = { slug: string; title: string; summary: string };

export const GUIDES: GuideMeta[] = [
  {
    slug: 'tender-eligibility-check',
    title: 'How to check eligibility in a government tender',
    summary: 'Registration, turnover, similar-work experience, exemptions and proof: test your company against each condition before you spend on a bid.',
  },
  {
    slug: 'emd-exemption',
    title: 'EMD exemption for MSEs and startups: who qualifies and how to claim it',
    summary: 'What GFR Rule 170 says, why traders don’t qualify on GeM, and the proof to upload with your bid.',
  },
  {
    slug: 'tender-corrigendum',
    title: 'What a tender corrigendum can change, and how to check it',
    summary: 'Where to find every corrigendum, how to read what it changed, and a real example that changed who was eligible.',
  },
];

export const guidePath = (slug: string) => `/guides/${slug}`;

export function checkedLabel(iso = GUIDES_CHECKED): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}
