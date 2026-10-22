// Letterhead details on a company or client profile (Oct 2026): optional,
// never part of a complete profile (profileCompleteness.js doesn't list
// them), and used only to fill annexure drafts (annexureDocx.js). Checked
// here so a typo'd PAN or email is caught when it is typed, not when a
// draft is printed.

export const LETTERHEAD_FIELDS = [
  'registeredAddress', 'pan', 'signatoryName', 'signatoryDesignation', 'contactPhone', 'contactEmail',
];

const MAX = {
  registeredAddress: 400, pan: 10, signatoryName: 120, signatoryDesignation: 120, contactPhone: 20, contactEmail: 160,
};

/**
 * Tidies the letterhead fields in a profile PATCH (others pass through).
 * @returns {{ ok: true, fields: object } | { ok: false, error: string }}
 */
export function checkLetterhead(fields) {
  const out = { ...fields };
  for (const key of LETTERHEAD_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(out, key)) continue;
    const raw = out[key];
    if (raw !== null && typeof raw !== 'string') return { ok: false, error: 'Letterhead details must be text.' };
    let v = raw === null ? null : raw.trim().replace(key === 'registeredAddress' ? /[ \t]+/g : /\s+/g, ' ') || null;
    if (v && v.length > MAX[key]) return { ok: false, error: `Keep that under ${MAX[key]} characters.` };
    if (v && key === 'pan') {
      v = v.toUpperCase();
      if (!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(v)) return { ok: false, error: 'A PAN is 10 characters, like ABCDE1234F.' };
    }
    if (v && key === 'contactEmail' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return { ok: false, error: 'That email address doesn’t look right.' };
    if (v && key === 'contactPhone' && !/^\+?[0-9][0-9 -]{6,18}$/.test(v)) return { ok: false, error: 'Write the phone number with digits only (a leading + is fine).' };
    out[key] = v;
  }
  return { ok: true, fields: out };
}
