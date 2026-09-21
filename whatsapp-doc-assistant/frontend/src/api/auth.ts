// Matches src/bidpilot/routes/auth.js exactly — see that file for the
// authoritative response shapes.
import { request } from './client';

export type UserStatus = 'PENDING_VERIFICATION' | 'ACTIVE' | 'SUSPENDED';

export type CompanyMembership = {
  companyId: string;
  role: 'owner' | 'admin' | 'member';
  name: string;
};

export type Me = {
  userId: string;
  email: string;
  status: UserStatus;
  emailVerified: boolean;
  companies: CompanyMembership[];
};

export type RegisterResult = {
  userId: string;
  email: string;
  status: UserStatus;
  /** Only ever present outside production — see routes/auth.js's
   *  devDeliverVerificationLink(). No email provider is wired up yet. */
  devVerificationUrl?: string;
};

export function register(input: { email: string; password: string; name?: string }) {
  return request<RegisterResult>('/bidpilot/register', { method: 'POST', body: input });
}

export function verifyEmail(token: string) {
  return request<{ verified: true; email: string }>('/bidpilot/verify-email', { query: { token } });
}

export function login(input: { email: string; password: string }) {
  return request<{ userId: string; email: string; status: UserStatus; emailVerified: boolean }>(
    '/bidpilot/login',
    { method: 'POST', body: input },
  );
}

export function logout() {
  return request<{ loggedOut: true }>('/bidpilot/logout', { method: 'POST' });
}

export function me() {
  return request<Me>('/bidpilot/me');
}
