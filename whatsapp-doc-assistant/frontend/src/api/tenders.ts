// Matches src/bidpilot/routes/tenders.js exactly. Not used by any M5b page
// yet (M5b ships no tender list/detail UI) — this is the typed client M5c/
// M5d build against, per the approved API-client-first design.
import { request } from './client';

// Single source for both the TS union type and the runtime array a <select>
// needs — matches src/db/schema/enums.js's tenderStatus.enumValues exactly.
export const TENDER_STATUSES = [
  'NEW', 'REVIEWING', 'INTERESTED', 'PREPARING_BID',
  'SUBMITTED', 'AWARDED', 'NOT_AWARDED', 'CLOSED',
] as const;
export type TenderStatus = (typeof TENDER_STATUSES)[number];

export const ANALYSIS_STATUSES = ['NOT_STARTED', 'ANALYZING', 'COMPLETED', 'FAILED'] as const;
export type AnalysisStatus = (typeof ANALYSIS_STATUSES)[number];

export type ProcessingStatus = 'UPLOADED' | 'PROCESSING' | 'EXTRACTING' | 'ANALYZING' | 'COMPLETED' | 'FAILED';

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

// Matches routes/tenders.js's handleUpload() exactly — verified against the
// committed route (not assumed) before writing this: field name "file",
// companyId as a form field (not query/JSON), 201 on a new tender / 200 on
// a detected duplicate, and the response body carries `status` (business
// status) and `duplicate`, not just processingStatus.
export type UploadTenderResult = {
  tenderId: string;
  status: TenderStatus;
  processingStatus: ProcessingStatus;
  duplicate: boolean;
};

export function uploadTender(file: File, companyId: string) {
  const form = new FormData();
  form.append('file', file);
  form.append('companyId', companyId);
  return request<UploadTenderResult>('/bidpilot/tenders/upload', { method: 'POST', body: form });
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

// Matches src/db/schema/enums.js's eligibilityStatus.enumValues exactly.
// UNKNOWN is the default until a company-profile check has run — never
// inferred client-side (see eligibilityPipeline.js's server-side-only
// verification: the AI supplies a field NAME and a reason, never a value).
export const ELIGIBILITY_STATUSES = ['MEETS', 'DOES_NOT_APPEAR_TO_MEET', 'UNKNOWN'] as const;
export type EligibilityStatus = (typeof ELIGIBILITY_STATUSES)[number];

// `value` is always server-read from the real company_profiles row; `reason`
// is the only AI-authored part of this — see eligibilityPipeline.js's
// verifyAgainstProfile(). Never trust/display a value from anywhere else.
export type CompanyEvidenceEntry = { field: string; value: string; label: string; reason: string };

export type Requirement = {
  id: string;
  category: string;
  title: string | null;
  description: string;
  mandatory: boolean;
  evidence: RequirementEvidence[];
  companyStatus: EligibilityStatus;
  actionRequired: string | null;
  companyEvidence: CompanyEvidenceEntry[];
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

// Short-lived, self-authorizing signed URL (routes/tenders.js) — fetch on
// click, never cache/persist client-side. Matches the backend's own design
// intent verbatim (see M5 audit's security section).
export function getDocumentUrl(tenderId: string, companyId: string) {
  return request<{ url: string; expiresInSeconds: number }>(
    `/bidpilot/tenders/${tenderId}/document-url`,
    { query: { companyId } },
  );
}

// Milestone 6's eligibility engine — built on the backend since M6 but never
// wired to any UI until Beta Readiness. Cross-checks every requirement
// against the caller's real company_profiles row; the response's per-
// requirement companyStatus/actionRequired/companyEvidence is what
// getTender()'s Requirement.* fields carry from then on (persisted, not a
// one-shot response — see routes/tenders.js's M6 comment).
export function checkEligibility(tenderId: string, companyId: string) {
  return request<{ tenderId: string; evaluated: number; requirements: Array<{
    id: string; companyStatus: EligibilityStatus; actionRequired: string | null; companyEvidence: CompanyEvidenceEntry[];
  }> }>(`/bidpilot/tenders/${tenderId}/eligibility`, { method: 'POST', body: { companyId } });
}
