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
  /** False for a tender tracked from the feed until its PDF is attached. */
  hasDocument: boolean;
} & TenderTracking;

/** The bid tracker's fields (PATCH /tenders/:id). */
export type TenderTracking = {
  internalDeadline: string | null;
  notes: string | null;
  portalUrl: string | null;
  portalRef: string | null;
  clientId: string | null;
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
  /** A client's id, or 'none' for the company's own tenders. */
  clientId?: string;
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
  /** Whether the analysis will start by itself once the PDF has been read. */
  autoAnalyze?: boolean;
};

/** `autoAnalyze` asks the server to start the analysis by itself once the PDF
 *  has been read: the kind of allowance the notice on screen was built from
 *  (dashboard/firstRun.ts allowanceToken). Send it only while that notice
 *  says so (shouldRequestAutoAnalysis); null asks for nothing. */
export function uploadTender(file: File, companyId: string, { autoAnalyze = null }: { autoAnalyze?: string | null } = {}) {
  const form = new FormData();
  form.append('companyId', companyId);
  if (autoAnalyze) form.append('autoAnalyze', autoAnalyze);
  form.append('file', file);
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

export type TenderDetail = TenderTracking & {
  id: string;
  title: string | null;
  source: string;
  status: TenderStatus;
  processingStatus: ProcessingStatus;
  processingError: string | null;
  analysisStatus: AnalysisStatus;
  analysisError: string | null;
  analyzedAt: string | null;
  // How much of the document the currently shown analysis actually read.
  // null for analyses that predate section tracking, or that never ran.
  analysisCoverage: { sections: number; failedSections: number } | null;
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

// ── Bid tracker and submission checklist ──────────────────────────────────

export function updateTracking(
  tenderId: string, companyId: string,
  changes: Partial<TenderTracking & { status: TenderStatus }>,
) {
  return request<TenderTracking & { id: string; status: TenderStatus }>(
    `/bidpilot/tenders/${tenderId}`, { method: 'PATCH', body: { companyId, ...changes } },
  );
}

export type ChecklistItem = {
  key: string;
  label: string;
  detail: string | null;
  category: string;
  mandatory: boolean;
  sourcePage: number | null;
  done: boolean;
  doneAt: string | null;
};
export type ChecklistCustomItem = { id: string; label: string; done: boolean; doneAt: string | null };
export type Checklist = { items: ChecklistItem[]; custom: ChecklistCustomItem[]; total: number; done: number };

export function getChecklist(tenderId: string, companyId: string) {
  return request<Checklist>(`/bidpilot/tenders/${tenderId}/checklist`, { query: { companyId } });
}

export function setChecklistItem(tenderId: string, companyId: string, key: string, done: boolean) {
  return request<Checklist>(`/bidpilot/tenders/${tenderId}/checklist/requirement`, { method: 'PUT', body: { companyId, key, done } });
}

export function addChecklistItem(tenderId: string, companyId: string, label: string) {
  return request<Checklist>(`/bidpilot/tenders/${tenderId}/checklist/custom`, { method: 'POST', body: { companyId, label } });
}

export function setCustomChecklistItem(tenderId: string, companyId: string, itemId: string, done: boolean) {
  return request<Checklist>(`/bidpilot/tenders/${tenderId}/checklist/custom/${itemId}`, { method: 'PATCH', body: { companyId, done } });
}

export function deleteChecklistItem(tenderId: string, companyId: string, itemId: string) {
  return request<Checklist>(`/bidpilot/tenders/${tenderId}/checklist/custom/${itemId}`, { method: 'DELETE', body: { companyId } });
}

/** Same-origin download link; the session cookie authorises it. */
export function checklistXlsxUrl(tenderId: string, companyId: string) {
  return `/bidpilot/tenders/${tenderId}/checklist.xlsx?companyId=${encodeURIComponent(companyId)}`;
}

// ── Corrigenda ─────────────────────────────────────────────────────────────

export type CorrigendumChange = {
  field: string;
  label: string;
  before: string | null;
  after: string;
  sourcePage: number;
  evidenceText: string;
};
export type Corrigendum = {
  id: string;
  filename: string;
  status: 'PROCESSING' | 'COMPLETED' | 'FAILED';
  error: string | null;
  pageCount: number | null;
  summary: string | null;
  changes: CorrigendumChange[];
  appliedAt: string | null;
  createdAt: string;
};

/** Changes that can be written onto the tender; the rest are shown only. */
export const APPLICABLE_CORRIGENDUM_FIELDS = ['submissionDeadline', 'openingDate', 'emd', 'estimatedValue', 'tenderFee', 'contractDuration'];

export function listCorrigenda(tenderId: string, companyId: string) {
  return request<{ corrigenda: Corrigendum[] }>(`/bidpilot/tenders/${tenderId}/corrigenda`, { query: { companyId } });
}

export function uploadCorrigendum(tenderId: string, companyId: string, file: File) {
  const form = new FormData();
  form.append('file', file);
  form.append('companyId', companyId);
  return request<{ id: string; status: string }>(`/bidpilot/tenders/${tenderId}/corrigenda`, { method: 'POST', body: form });
}

export function applyCorrigendum(tenderId: string, companyId: string, corrigendumId: string, fields: string[]) {
  return request<{ applied: string[]; skipped: string[] }>(
    `/bidpilot/tenders/${tenderId}/corrigenda/${corrigendumId}/apply`, { method: 'POST', body: { companyId, fields } },
  );
}

/** Attach the PDF to a tender tracked from the tender feed. */
export function attachTenderDocument(tenderId: string, companyId: string, file: File) {
  const form = new FormData();
  form.append('file', file);
  form.append('companyId', companyId);
  return request<{ tenderId: string; processingStatus: ProcessingStatus }>(`/bidpilot/tenders/${tenderId}/document`, { method: 'POST', body: form });
}

// ── EMD and performance security (routes/tenders.js, repo/securities.js) ──
export type SecurityKind = 'EMD' | 'PERFORMANCE';
export type SecurityMode = 'ONLINE' | 'DD' | 'BG' | 'FDR' | 'EXEMPTED' | 'NOT_REQUIRED';
export type SecurityStatus = 'TO_ARRANGE' | 'SUBMITTED' | 'RETURNED' | 'FORFEITED';

export type Security = {
  id: string;
  kind: SecurityKind;
  mode: SecurityMode;
  amount: number | null;
  reference: string | null;
  bank: string | null;
  issuedOn: string | null;
  validUntil: string | null;
  claimUntil: string | null;
  status: SecurityStatus;
  notes: string | null;
  updatedAt: string;
};

export type SecurityInput = Partial<Omit<Security, 'id' | 'updatedAt'>>;

export function listSecurities(tenderId: string, companyId: string) {
  return request<{ securities: Security[] }>(`/bidpilot/tenders/${tenderId}/securities`, { query: { companyId } });
}

export function createSecurity(tenderId: string, companyId: string, input: SecurityInput) {
  return request<Security>(`/bidpilot/tenders/${tenderId}/securities`, { method: 'POST', body: { companyId, ...input } });
}

export function updateSecurity(tenderId: string, companyId: string, id: string, input: SecurityInput) {
  return request<Security>(`/bidpilot/tenders/${tenderId}/securities/${id}`, { method: 'PATCH', body: { companyId, ...input } });
}

export function deleteSecurity(tenderId: string, companyId: string, id: string) {
  return request<{ deleted: boolean }>(`/bidpilot/tenders/${tenderId}/securities/${id}`, { method: 'DELETE', body: { companyId } });
}

// ── Annexure drafts (routes/tenders.js, analysis/annexures.js) ─────────────
export type AnnexureDraftSummary = {
  draftedAt: string;
  paragraphs: number;
  /** Profile details the draft needs that the profile doesn't have yet. */
  missing: string[];
  /** Blanks only the bidder can fill (a date, the tender number). */
  blanks: number;
  filled: number;
};
export type AnnexureFormat = { key: number; title: string; pages: number[]; draft: AnnexureDraftSummary | null };

export function listAnnexures(tenderId: string, companyId: string) {
  return request<{ bidder: { name: string; isClient: boolean }; formats: AnnexureFormat[] }>(
    `/bidpilot/tenders/${tenderId}/annexures`, { query: { companyId } },
  );
}

export function draftAnnexure(tenderId: string, companyId: string, key: number) {
  return request<AnnexureFormat & { dropped: number }>(`/bidpilot/tenders/${tenderId}/annexures/${key}/draft`, { method: 'POST', body: { companyId } });
}

/** Same-origin download link; the session cookie authorises it. */
export function annexureDocxUrl(tenderId: string, companyId: string, key: number) {
  return `/bidpilot/tenders/${tenderId}/annexures/${key}/docx?companyId=${encodeURIComponent(companyId)}`;
}
