// The founder's live dashboard (backend src/bidpilot/insights.js,
// GET /bidpilot/insights). Only admin accounts get an answer; others get 404.
import { request } from './client';
import type { Allowance } from '../allowance';

export type InsightsRange = 7 | 30 | 90;

export type PeriodTotals = { visitors: number; views: number; signups: number; uploads: number; analyses: number };

export type Insights = {
  days: InsightsRange;
  generatedAt: string;
  live: { visitors_now: number; views_now: number; visitors_today: number; views_today: number; last_view_at: string | null; minutes: number };
  totals: { current: PeriodTotals & { failed: number; waiting: number }; previous: PeriodTotals };
  series: Array<{ day: string; visitors: number; views: number; signups: number; uploads: number; analyses: number }>;
  funnel: { visitors: number; saw_signup: number; signups: number; uploaded: number; analysed: number };
  paid: { companies: number; monthlyListPrice: number; byPlan: Array<{ plan: string; companies: number }> };
  sources: Array<{ label: string; visitors: number }>;
  campaigns: Array<{ label: string; visitors: number }>;
  pages: Array<{ label: string; visitors: number }>;
  devices: Array<{ label: string; visitors: number }>;
  activity: Array<{ kind: 'signup' | 'upload' | 'analysed' | 'failed'; at: string; company: string }>;
  accounts: Array<{
    id: string; name: string; signedUpAt: string; contact: string | null; internal: boolean;
    uploads: number; analysed: number; failed: number; notAnalysed: number;
    lastActivity: string | null; hasProfile: boolean; allowance: Allowance | null;
  }>;
};

export function getInsights(days: InsightsRange) {
  return request<Insights>('/bidpilot/insights', { query: { days: String(days) } });
}
