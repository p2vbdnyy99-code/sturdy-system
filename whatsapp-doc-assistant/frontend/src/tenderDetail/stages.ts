// Bid stages as users see them. The values are tenders.status
// (backend/src/db/schema/enums.js); the backend's STAGE_LABELS
// (repo/tenders.js) words its activity events the same way.
import type { TenderStatus } from '../api/tenders';

export const STAGES: Array<{ value: TenderStatus; label: string }> = [
  { value: 'NEW', label: 'New' },
  { value: 'REVIEWING', label: 'Reviewing' },
  { value: 'INTERESTED', label: 'Interested' },
  { value: 'PREPARING_BID', label: 'Preparing bid' },
  { value: 'SUBMITTED', label: 'Submitted' },
  { value: 'AWARDED', label: 'Won' },
  { value: 'NOT_AWARDED', label: 'Not won' },
  { value: 'CLOSED', label: 'Dropped' },
];

export const STAGE_LABEL = Object.fromEntries(STAGES.map((s) => [s.value, s.label])) as Record<TenderStatus, string>;
