import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FREE_TENDERS_WITHOUT_PROFILE, freeTendersLeft, profileReminder } from './profileGate.ts';

test('three free tenders, counted down, and none needed once complete', () => {
  assert.equal(FREE_TENDERS_WITHOUT_PROFILE, 3);
  assert.equal(freeTendersLeft(false, 0), 3);
  assert.equal(freeTendersLeft(false, 1), 2);
  assert.equal(freeTendersLeft(false, 2), 1);
  assert.equal(freeTendersLeft(false, 3), 0);
  assert.equal(freeTendersLeft(false, 7), 0);
  assert.equal(freeTendersLeft(true, 7), null);
});

test('reminder wording for 3 left, 1 left, none left and complete', () => {
  assert.match(profileReminder(3)!.text, /add 3 more tenders without it/);
  assert.match(profileReminder(1)!.text, /add 1 more tender without it/);
  const none = profileReminder(0)!;
  assert.equal(none.tone, 'warning');
  assert.match(none.text, /added 3 tenders without a company profile/);
  assert.equal(profileReminder(null), null);
});
