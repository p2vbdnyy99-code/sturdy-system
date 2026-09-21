// Matches src/bidpilot/routes/tenders.js exactly. Not used by any M5b page
// yet (M5b ships no tender list/detail UI) — this is the typed client M5c/
// M5d build against, per the approved API-client-first design.
import { request } from './client';

export type TenderStatus =
  | 'NEW' | 'REVIEWING' | 'INTERESTED' | 'PREPARING_BID'
  | 'SUBMITTED' | 'AWARDED' | 'NOT_AWARDED' | 'CLOSED';

export type ProcessingStatus = 'UPLOADED' | 'PROCESSING' | 'EXTRACTING' | 'ANALYZING' | 'COMPLETED' | 'FAILED';
export type AnalysisStatus = 'NOT_STARTED' | 'ANALYZING' | 'COMPLETED' | 'FAILED';

// GET /tenders returns full tenders rows (no column projection) — see
// repo/tenders.js's listTendersPaginated().
export type TenderListItem = {
  id: string;
  companyId: string;
  title: string | null;
  organization: string | null;
  tenderNumber: string | null;
  location: string | null;
  estimatedValue: string | null;
  emd: string | null;
  tenderFee: string | null;
  contractDuration: string | null;
  submissionDeadline: string | null;
  openingDate: string | null;
  status: TenderStatus;
  processingStatus: ProcessingStatus;
  processingError: string | null;
  analysisStatus: AnalysisStatus;
  analysisError: string | null;
  analyzedAt: string | null;
  source: string;
  createdAt: string;
  updatedAt: string;
};

export type TenderListResult = {
  tenders: TenderListItem[];
  total: number;
  page: number;
  limit: number;
};

export type TenderListQuery = {
  companyId: string;
  page?: number;
  limit?: number;
  status?: TenderStatus;
  analysisStatus?: AnalysisStatus;
  search?: string;
  sortBy?: 'deadline' | 'createdAt';
  sortOrder?: 'asc' | 'desc';
};

export function listTenders(query: TenderListQuery) {
  const { companyId, ...rest } = query;
  return request<TenderListResult>('/bidpilot/tenders', { query: { companyId, ...rest } });
}

// An overview field is null when nothing was extracted; otherwise it always
// carries the evidence that backs it — see repo/analysis.js's evidence-first
// persistence (Milestone 4/5a).
export type OverviewField = { value: string; sourcePage: number | null; evidenceText: string | null } | null;

export type RequirementEvidence = {
  sourcePage: number | null;
  evidenceText: string;
  extractedValue: string | null;
  confidence: string | null;
};

export type Requirement = {
  id: string;
  category: string;
  title: string | null;
  description: string;
  mandatory: boolean;
  evidence: RequirementEvidence[];
};

export type BoqItem = {
  id: string;
  itemNumber: string | null;
  description: string;
  quantity: string | null;
  unit: string | null;
  technicalSpecification: string | null;
  remarks: string | null;
  sourcePage: number | null;
};

export type TenderDate = {
  id: string;
  label: string;
  rawText: string;
  parsedDate: string | null;
  sourcePage: number | null;
  evidenceText: string | null;
};

export type RedFlag = {
  id: string;
  description: string;
  sourcePage: number | null;
  evidenceText: string | null;
};

export type TenderActivityEvent = {
  id: string;
  eventType: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
};

export type TenderDetail = {
  id: string;
  title: string | null;
  source: string;
  status: TenderStatus;
  processingStatus: ProcessingStatus;
  processingError: string | null;
  analysisStatus: AnalysisStatus;
  analysisError: string | null;
  analyzedAt: string | null;
  pageCount: number;
  createdAt: string;
  updatedAt: string;
  overview: {
    organization: OverviewField;
    tenderNumber: OverviewField;
    location: OverviewField;
    estimatedValue: OverviewField;
    emd: OverviewField;
    tenderFee: OverviewField;
    contractDuration: OverviewField;
    submissionDeadline: OverviewField;
    openingDate: OverviewField;
  };
  requirements: Requirement[];
  boq: BoqItem[];
  dates: TenderDate[];
  redFlags: RedFlag[];
  document: { filename: string; mimeType: string | null; sizeBytes: number | null; uploadedAt: string } | null;
  activity: TenderActivityEvent[];
};

export function getTender(tenderId: string, companyId: string) {
  return request<TenderDetail>(`/bidpilot/tenders/${tenderId}`, { query: { companyId } });
}

export function analyzeTender(tenderId: string, companyId: string) {
  return request<{ tenderId: string; analysisStatus: 'ANALYZING' }>(
    `/bidpilot/tenders/${tenderId}/analyze`,
    { method: 'POST', body: { companyId } },
  );
}
