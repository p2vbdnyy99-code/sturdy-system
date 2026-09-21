// Matches src/bidpilot/routes/companies.js exactly.
import { request } from './client';

export type CreateCompanyResult = {
  companyId: string;
  name: string;
  role: 'owner';
};

export function createCompany(input: { name: string; industry?: string; businessType?: string }) {
  return request<CreateCompanyResult>('/bidpilot/companies', { method: 'POST', body: input });
}

// Matches src/db/schema/companyProfile.js's columns. All fields optional —
// the row is created lazily and filled in progressively (see routes/companies.js).
export type CompanyProfile = {
  id: string;
  companyId: string;
  industry: string | null;
  businessType: string | null;
  gstin: string | null;
  registrationDetails: string | null;
  yearsInBusiness: number | null;
  annualTurnover: string | null;
  netWorth: string | null;
  employeeCount: number | null;
  geography: string[];
  certifications: string[];
  licenses: string[];
  equipment: string[];
  oemRelationships: string[];
  experience: Array<{ description?: string; value?: string; year?: string; client?: string }>;
  otherQualifications: string | null;
  createdAt: string;
  updatedAt: string;
};

/** Only the fields a PATCH may set — a subset of CompanyProfile, whitelisted
 *  the same way the backend whitelists them (routes/companies.js). */
export type CompanyProfilePatch = Partial<Omit<CompanyProfile, 'id' | 'companyId' | 'createdAt' | 'updatedAt'>>;

export function getCompanyProfile(companyId: string) {
  return request<CompanyProfile | null>(`/bidpilot/companies/${companyId}/profile`);
}

export function updateCompanyProfile(companyId: string, patch: CompanyProfilePatch) {
  return request<CompanyProfile>(`/bidpilot/companies/${companyId}/profile`, {
    method: 'PATCH',
    body: patch,
  });
}
