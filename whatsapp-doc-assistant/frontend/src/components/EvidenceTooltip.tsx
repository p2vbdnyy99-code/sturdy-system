import { useState } from 'react';

// The product differentiator, made visible: every evidence-bearing value
// shows exactly where it came from. Click-to-toggle rather than hover-only
// (works on touch, and is trivially testable) — a small "p.N" chip next to
// the value expands to the source page + the verbatim/paraphrased quote
// backing it. If there's no evidence to show (shouldn't happen for a
// persisted requirement/date/red-flag per M4's evidence-first enforcement,
// but overview fields can legitimately have neither), it just renders the
// plain value with no chip.
type EvidenceTooltipProps = {
  value: string;
  sourcePage: number | null;
  evidenceText: string | null;
};

export function EvidenceTooltip({ value, sourcePage, evidenceText }: EvidenceTooltipProps) {
  const [open, setOpen] = useState(false);

  if (!sourcePage && !evidenceText) {
    return <span>{value}</span>;
  }

  return (
    <span className="evidence">
      <span>{value}</span>{' '}
      <button
        type="button"
        className="evidence-toggle"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        {sourcePage ? `p.${sourcePage}` : 'source'}
      </button>
      {open && (
        <span className="evidence-popover">
          {sourcePage && <span className="evidence-page">Page {sourcePage}</span>}
          {evidenceText && <span className="evidence-quote">&ldquo;{evidenceText}&rdquo;</span>}
        </span>
      )}
    </span>
  );
}
