import { ATTENTION_LABELS, type AttentionState } from '../dashboard/attentionState';

const ATTENTION_CLASS: Record<AttentionState, string> = {
  PROCESSING: 'badge badge-neutral',
  PROCESSING_FAILED: 'badge badge-danger',
  ANALYSIS_REQUIRED: 'badge badge-warning',
  ANALYSIS_IN_PROGRESS: 'badge badge-neutral',
  ANALYSIS_FAILED: 'badge badge-danger',
  DEADLINE_APPROACHING: 'badge badge-warning',
  READY: 'badge badge-success',
};

export function AttentionBadge({ state }: { state: AttentionState }) {
  return <span className={ATTENTION_CLASS[state]}>{ATTENTION_LABELS[state]}</span>;
}
