// The company profile is optional for a company's first few tenders and
// required after that. The server decides (backend/src/bidpilot/profileGate.js,
// whose number profile-fields-sync.test.js checks against this one); the app
// uses this to open the "complete your profile" dialog before an upload
// rather than after it fails, and to word the reminder. Pure, so it runs
// under `node --test` (profileGate.test.ts).
export const FREE_TENDERS_WITHOUT_PROFILE = 3;

/** Tenders the company can still add without a profile; null once complete. */
export function freeTendersLeft(profileComplete: boolean, tenderCount: number): number | null {
  if (profileComplete) return null;
  return Math.max(0, FREE_TENDERS_WITHOUT_PROFILE - tenderCount);
}

const tenders = (n: number) => (n === 1 ? 'tender' : 'tenders');

/** The dashboard's reminder, or null when the profile is complete. */
export function profileReminder(left: number | null): { tone: 'info' | 'warning'; text: string; action: string } | null {
  if (left === null) return null;
  if (left > 0) {
    return {
      tone: 'info',
      text: `Add your company profile so each tender can be checked against your details. You can add ${left} more ${tenders(left)} without it.`,
      action: 'Fill it in now',
    };
  }
  return {
    tone: 'warning',
    text: `You've added ${FREE_TENDERS_WITHOUT_PROFILE} tenders without a company profile. To add more, complete it first.`,
    action: 'Complete the profile',
  };
}
