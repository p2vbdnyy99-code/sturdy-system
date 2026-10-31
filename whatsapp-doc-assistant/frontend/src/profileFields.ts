// The company-profile fields, in page order, as the user sees them. Every one
// is mandatory (backend/src/bidpilot/profileCompleteness.js decides what
// counts as answered; backend test profile-fields-sync.test.js checks this
// list has exactly the same keys). Fields with a `noneLabel` can be answered
// with an explicit "None" instead of a value.

export type ProfileFieldKey =
  | 'industry' | 'businessType' | 'gstin' | 'registrationDetails'
  | 'yearsInBusiness' | 'annualTurnover' | 'netWorth' | 'employeeCount'
  | 'geography' | 'certifications' | 'licenses' | 'equipment' | 'oemRelationships' | 'experience'
  | 'otherQualifications';

export type ProfileField = {
  key: ProfileFieldKey;
  label: string;
  hint?: string;
  kind: 'text' | 'number' | 'amount' | 'list' | 'experience';
  /** Shown next to a checkbox that answers the field with "None". */
  noneLabel?: string;
};

export const PROFILE_FIELDS: ProfileField[] = [
  { key: 'industry', label: 'Industry', hint: 'e.g. civil construction, electrical, IT services', kind: 'text' },
  { key: 'businessType', label: 'Business type', hint: 'e.g. proprietorship, partnership, private limited', kind: 'text' },
  { key: 'gstin', label: 'GSTIN', kind: 'text', noneLabel: 'Not GST-registered' },
  { key: 'registrationDetails', label: 'Registration details', hint: 'e.g. contractor class, MSME/Udyam number', kind: 'text' },
  { key: 'yearsInBusiness', label: 'Years in business', kind: 'number' },
  { key: 'employeeCount', label: 'Employee count', kind: 'number' },
  { key: 'annualTurnover', label: 'Annual turnover', hint: 'in ₹, latest financial year', kind: 'amount' },
  { key: 'netWorth', label: 'Net worth', hint: 'in ₹', kind: 'amount' },
  { key: 'geography', label: 'States you work in', hint: 'comma-separated', kind: 'list', noneLabel: 'None' },
  { key: 'certifications', label: 'Certifications', hint: 'e.g. ISO 9001, comma-separated', kind: 'list', noneLabel: 'None' },
  { key: 'licenses', label: 'Licences', hint: 'comma-separated', kind: 'list', noneLabel: 'None' },
  { key: 'equipment', label: 'Equipment', hint: 'comma-separated', kind: 'list', noneLabel: 'None' },
  { key: 'oemRelationships', label: 'OEM relationships', hint: 'manufacturers you are authorised by, comma-separated', kind: 'list', noneLabel: 'None' },
  { key: 'otherQualifications', label: 'Other qualifications', kind: 'text', noneLabel: 'None' },
  { key: 'experience', label: 'Past project experience', hint: 'similar works you have completed', kind: 'experience', noneLabel: 'None yet' },
];

export const PROFILE_FIELD_LABELS: Record<ProfileFieldKey, string> = Object.fromEntries(
  PROFILE_FIELDS.map((f) => [f.key, f.label]),
) as Record<ProfileFieldKey, string>;

/** "Industry, GSTIN and 3 more" for a list of missing keys. */
export function describeMissing(keys: string[]): string {
  const labels = keys.map((k) => PROFILE_FIELD_LABELS[k as ProfileFieldKey] ?? k);
  if (labels.length <= 3) return labels.join(', ');
  return `${labels.slice(0, 2).join(', ')} and ${labels.length - 2} more`;
}

/** Optional letterhead details (backend letterhead.js): never needed for a
 *  complete profile; annexure drafts fill their blanks from them. */
export type LetterheadKey = 'registeredAddress' | 'pan' | 'signatoryName' | 'signatoryDesignation' | 'contactPhone' | 'contactEmail';

export const LETTERHEAD_FIELDS: Array<{ key: LetterheadKey; label: string; hint?: string; multiline?: boolean; maxLength: number }> = [
  { key: 'registeredAddress', label: 'Registered address', multiline: true, maxLength: 400 },
  { key: 'pan', label: 'PAN', hint: 'e.g. ABCDE1234F', maxLength: 10 },
  { key: 'signatoryName', label: 'Authorised signatory', hint: 'the person who signs bids', maxLength: 120 },
  { key: 'signatoryDesignation', label: 'Signatory\u2019s designation', hint: 'e.g. Proprietor, Director', maxLength: 120 },
  { key: 'contactPhone', label: 'Phone', maxLength: 20 },
  { key: 'contactEmail', label: 'Email', maxLength: 160 },
];
