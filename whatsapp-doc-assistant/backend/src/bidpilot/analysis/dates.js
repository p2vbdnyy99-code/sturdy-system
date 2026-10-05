// Reading a date as an Indian tender writes it.
// -----------------------------------------------------------------------------
// Indian tenders write day/month/year: "02/05/2026 @1500hrs" is 2 May 2026,
// 3 pm. JavaScript's Date.parse reads "02/05/2026" as 5 February (US order),
// which would show a deadline three months early, so slashed/dashed/dotted
// numeric dates are never handed to it. Times are Indian Standard Time; a
// date without a time is stored as midnight UTC.
// Anything that isn't clearly a calendar date returns null; the caller then
// keeps the text as written.

const IST_OFFSET_MIN = 330;
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/** A time given in the text is IST. A date with no time is stored as
 *  midnight UTC (the app's existing convention for date-only values, which
 *  shows the same calendar day in IST and UTC). */
function toDate(year, month, day, time) {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  // Reject impossible dates (31/02/2026) instead of letting them roll over.
  const check = new Date(Date.UTC(year, month - 1, day));
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return null;
  if (!time) return check;
  const [hour, minute] = time;
  if (hour > 23 || minute > 59) return null;
  return new Date(Date.UTC(year, month - 1, day, hour, minute) - IST_OFFSET_MIN * 60_000);
}

/** "@1500hrs", "15:00", "1500 hrs", "3:00 PM", "11.30 AM", "3 PM" → [hour, minute].
 *  Only clear time formats count, and only up to the next date in the text,
 *  so a second date's year is never mistaken for a time. */
function readTime(rest) {
  const upToNextDate = rest.split(/\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}/)[0];
  const m = upToNextDate.match(/(\d{1,2})[:.](\d{2})\s*(am|pm|a\.m\.|p\.m\.)?/i)
    || upToNextDate.match(/\b(\d{2})(\d{2})\s*(?:hrs?|hours)\b/i)
    || upToNextDate.match(/\b(\d{1,2})()\s*(am|pm|a\.m\.|p\.m\.)/i);
  if (!m) return null;
  let hour = Number(m[1]);
  const minute = Number(m[2] || 0);
  const meridiem = (m[3] || '').toLowerCase().replace(/\./g, '');
  if (meridiem === 'pm' && hour < 12) hour += 12;
  if (meridiem === 'am' && hour === 12) hour = 0;
  return [hour, minute];
}

/** @returns {Date|null} */
export function parseTenderDate(text) {
  if (typeof text !== 'string' || !text.trim()) return null;
  const s = text.trim();

  // ISO (2026-05-02, 2026-05-02T15:00:00+05:30): unambiguous.
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const d = new Date(s.length === 10 ? `${s}T00:00:00Z` : s);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  // Day/month/year with / - or . (first date in the string wins).
  const dmy = s.match(/(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})(?!\d)/);
  if (dmy) {
    const year = dmy[3].length === 2 ? 2000 + Number(dmy[3]) : Number(dmy[3]);
    return toDate(year, Number(dmy[2]), Number(dmy[1]), readTime(s.slice(dmy.index + dmy[0].length)));
  }

  // "2 May 2026", "02nd May, 2026 15:00", "May 2, 2026".
  const dMonY = s.match(/(\d{1,2})(?:st|nd|rd|th)?[\s-]+([A-Za-z]{3,9})[\s,-]+(\d{4})/);
  const monDY = s.match(/([A-Za-z]{3,9})\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})/);
  const named = dMonY ? { day: dMonY[1], mon: dMonY[2], year: dMonY[3], m: dMonY }
    : monDY ? { day: monDY[2], mon: monDY[1], year: monDY[3], m: monDY } : null;
  if (named) {
    const month = MONTHS.indexOf(named.mon.slice(0, 3).toLowerCase()) + 1;
    if (month === 0) return null;
    return toDate(Number(named.year), month, Number(named.day), readTime(s.slice(named.m.index + named.m[0].length)));
  }
  return null;
}
