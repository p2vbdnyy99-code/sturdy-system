// Which company-profile fields are still unanswered.
// -----------------------------------------------------------------------------
// The founder made every profile field mandatory (Oct 2026): the eligibility
// check compares tender conditions with the profile, so gaps there mean
// "unclear" verdicts. A company can't upload or analyse a tender until this
// returns an empty list (routes/tenders.js), and the app sends the user to the
// profile page first (frontend CompanyGate).
//
// "Answered" means:
//   - text fields: non-blank;
//   - number fields: a number of 0 or more;
//   - list fields, other qualifications and GSTIN: a value, or the company
//     has explicitly answered "None" (stored in none_fields). A firm with no
//     OEM tie-ups must be able to say so; forcing an entry would put made-up
//     data into the eligibility check.

export const TEXT_FIELDS = ['industry', 'businessType', 'registrationDetails'];
export const NUMBER_FIELDS = ['yearsInBusiness', 'annualTurnover', 'netWorth', 'employeeCount'];
export const LIST_FIELDS = ['geography', 'certifications', 'licenses', 'equipment', 'oemRelationships', 'experience'];
/** Fields that may be answered "None". */
export const NONE_ALLOWED = ['gstin', 'otherQualifications', ...LIST_FIELDS];
/** Every required field, in the order the profile page shows them. */
export const REQUIRED_FIELDS = [
  'industry', 'businessType', 'gstin', 'registrationDetails',
  'yearsInBusiness', 'annualTurnover', 'netWorth', 'employeeCount',
  'geography', 'certifications', 'licenses', 'equipment', 'oemRelationships', 'experience',
  'otherQualifications',
];

const hasText = (v) => typeof v === 'string' && v.trim() !== '';
const hasNumber = (v) => v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v)) && Number(v) >= 0;
const hasItems = (v) => Array.isArray(v) && v.some((item) => (typeof item === 'string' ? item.trim() !== ''
  : item && typeof item === 'object' && Object.values(item).some((x) => hasText(String(x ?? '')))));

/** Keep only fields that may be "None", without duplicates. */
export function cleanNoneFields(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((k) => NONE_ALLOWED.includes(k)))];
}

/** The required fields this profile hasn't answered, in page order. */
export function missingProfileFields(profile) {
  if (!profile) return [...REQUIRED_FIELDS];
  const none = new Set(cleanNoneFields(profile.noneFields));
  return REQUIRED_FIELDS.filter((key) => {
    const v = profile[key];
    if (NUMBER_FIELDS.includes(key)) return !hasNumber(v);
    if (LIST_FIELDS.includes(key)) return !hasItems(v) && !none.has(key);
    if (hasText(v)) return false;
    return !none.has(key);
  });
}
