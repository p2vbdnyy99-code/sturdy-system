import { test } from 'node:test';
import assert from 'node:assert/strict';
import { INTERRUPTED_PROCESSING_MESSAGE, processingFailureText } from './processingFailure.ts';

test('a read interrupted by a restart says so, not that the PDF is unreadable', () => {
  const text = processingFailureText(INTERRUPTED_PROCESSING_MESSAGE);
  assert.match(text, /^Processing was interrupted by a server restart\./);
  assert.match(text, /PDF itself may be fine/);
  assert.match(text, /upload it again from the dashboard/);
  assert.doesNotMatch(text, /could not be read/);
});

test('any other stored error becomes a plain "could not be read", never the raw text', () => {
  for (const stored of ['Could not read PDF: Invalid XRef stream header', 'Extraction timed out after 120000ms', null]) {
    const text = processingFailureText(stored);
    assert.match(text, /^This PDF could not be read\. Please upload it again from the dashboard/);
    if (stored) assert.ok(!text.includes(stored));
  }
});
