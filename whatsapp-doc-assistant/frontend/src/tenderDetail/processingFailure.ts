// What the tender page says when a PDF wasn't read. Kept apart from the page
// so it can be unit-tested (processingFailure.test.ts).
//
// The server stores either its restart-recovery message (backend
// bidpilot/recovery.js INTERRUPTED_PROCESSING_MESSAGE; the backend's
// recovery test checks this copy matches) or an error from the PDF reader,
// whose text can be technical. The first is shown as it is: the file itself
// may be fine. The second becomes a plain "could not be read".

export const INTERRUPTED_PROCESSING_MESSAGE = 'Processing was interrupted by a server restart.';

export function processingFailureText(stored: string | null): string {
  if (stored === INTERRUPTED_PROCESSING_MESSAGE) {
    return `${INTERRUPTED_PROCESSING_MESSAGE} The PDF itself may be fine: please upload it again from the dashboard.`;
  }
  return 'This PDF could not be read. Please upload it again from the dashboard; the original file from the '
    + 'tender portal works best.';
}
