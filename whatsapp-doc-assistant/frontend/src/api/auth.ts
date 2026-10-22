// Matches src/bidpilot/routes/auth.js exactly — see that file for the
// authoritative response shapes.
import { request } from './client';

export type UserStatus = 'PENDING_VERIFICATION' | 'ACTIVE' | 'SUSPENDED';

export type CompanyMembership = {
  companyId: string;
  role: 'owner' | 'admin' | 'member';
  name: string;
  /** False until every mandatory company-profile field is answered. */
  profileComplete: boolean;
};

export type Me = {
  userId: string;
  /** Null for an account created with a phone number. */
  email: string | null;
  phone: string | null;
  name: string | null;
  status: UserStatus;
  emailVerified: boolean;
  companies: CompanyMembership[];
  /** True only for the founder's accounts (backend config adminEmails): shows /insights. */
  isAdmin?: boolean;
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

export type SignInProviders = { google: boolean; phone: boolean };

/** Which sign-in methods to offer; each is on only once it is configured. */
export function getSignInProviders() {
  return request<SignInProviders>('/bidpilot/auth/providers');
}

/** The browser goes here (a full page load, not fetch) to start Google sign-in. */
export const GOOGLE_SIGN_IN_URL = '/bidpilot/auth/google/start';

export function startPhoneSignIn(phone: string) {
  return request<{ sent: true; phone: string; expiresInSeconds: number }>('/bidpilot/auth/phone/start', {
    method: 'POST', body: { phone },
  });
}

export function verifyPhoneSignIn(input: { phone: string; code: string; name?: string }) {
  return request<{ userId: string; phone: string; created: boolean }>('/bidpilot/auth/phone/verify', {
    method: 'POST', body: input,
  });
}

export function logout() {
  return request<{ loggedOut: true }>('/bidpilot/logout', { method: 'POST' });
}

export function me() {
  return request<Me>('/bidpilot/me');
}
