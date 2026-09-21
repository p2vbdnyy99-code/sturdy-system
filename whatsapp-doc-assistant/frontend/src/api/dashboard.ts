// Matches src/bidpilot/routes/dashboard.js exactly. Not called by any M5b
// page yet — Dashboard.tsx ships as a placeholder this milestone (see
// BIDPILOT_ARCHITECTURE.md's M5b boundary). M5c wires this up.
import { request } from './client';
import type { ProcessingStatus, AnalysisStatus } from './tenders';

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
};

export function getDashboardSummary(companyId: string) {
  return request<DashboardSummary>('/bidpilot/dashboard/summary', { query: { companyId } });
}
