// Matches src/bidpilot/routes/dashboard.js exactly. Not called by any M5b
// page yet — Dashboard.tsx ships as a placeholder this milestone (see
// BIDPILOT_ARCHITECTURE.md's M5b boundary). M5c wires this up.
import { request } from './client';
import type { ProcessingStatus, AnalysisStatus } from './tenders';
import type { Allowance } from '../allowance';

export type DashboardSummary = {
  totalTenders: number;
  processing: number;
  awaitingAnalysis: number;
  analysed: number;
  upcomingDeadlines: { count: number; withinDays: number };
  recentTenders: Array<{
    id: string;
    title: string | null;
    submissionDeadline: string | null;
    processingStatus: ProcessingStatus;
    analysisStatus: AnalysisStatus;
  }>;
  /** Free trial or monthly plan; null when the company has no limit. */
  allowance: Allowance | null;
  /** New tenders for the company's saved searches, not yet seen. */
  newAlerts: number;
};

export function getDashboardSummary(companyId: string) {
  return request<DashboardSummary>('/bidpilot/dashboard/summary', { query: { companyId } });
}

/** EMD and bank guarantees still with buyers (routes/dashboard.js). */
export type HeldSecurity = import('./tenders').Security & { tenderId: string; tenderTitle: string | null; tenderNumber: string | null };
export type SecuritiesOverview = {
  held: { count: number; amount: number; unknownAmounts: number };
  expiringSoon: HeldSecurity[];
  expired: HeldSecurity[];
  items: HeldSecurity[];
};

export function getSecuritiesOverview(companyId: string) {
  return request<SecuritiesOverview>('/bidpilot/dashboard/securities', { query: { companyId } });
}
