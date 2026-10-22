// Matches the client routes in src/bidpilot/routes/companies.js: a
// consultant's clients, each with its own profile (same shape as the
// company profile).
import { request } from './client';
import type { CompanyProfile, CompanyProfilePatch } from './companies';

export type Client = { id: string; name: string; profileComplete: boolean; missingCount: number };

export function listClients(companyId: string) {
  return request<{ clients: Client[] }>(`/bidpilot/companies/${companyId}/clients`);
}

export function createClient(companyId: string, name: string) {
  return request<Client>(`/bidpilot/companies/${companyId}/clients`, { method: 'POST', body: { name } });
}

export function renameClient(companyId: string, clientId: string, name: string) {
  return request<{ id: string; name: string }>(`/bidpilot/companies/${companyId}/clients/${clientId}`, { method: 'PATCH', body: { name } });
}

export function deleteClient(companyId: string, clientId: string) {
  return request<{ deleted: true }>(`/bidpilot/companies/${companyId}/clients/${clientId}`, { method: 'DELETE' });
}

export function getClientProfile(companyId: string, clientId: string) {
  return request<CompanyProfile | null>(`/bidpilot/companies/${companyId}/clients/${clientId}/profile`);
}

export function updateClientProfile(companyId: string, clientId: string, patch: CompanyProfilePatch) {
  return request<CompanyProfile>(`/bidpilot/companies/${companyId}/clients/${clientId}/profile`, { method: 'PATCH', body: patch });
}
