// The one source of truth for "who is logged in, and which company are they
// acting as." Company selection is per M5's approved contract: every API
// call carries an explicit companyId (see api/*.ts) — this provider decides
// WHICH one, the backend independently re-verifies WHETHER that's allowed
// (requireCompanyAccess) on every request. Selection lives in memory only —
// no localStorage, no "active company" concept on the server — so a reload
// re-resolves it the same way (1 company: auto-select; >1: ask again).
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { me as fetchMe, type Me } from '../api/auth';
import { ApiError, SESSION_EXPIRED_EVENT } from '../api/client';

type SessionStatus = 'loading' | 'unauthenticated' | 'authenticated';

type SessionContextValue = {
  status: SessionStatus;
  me: Me | null;
  selectedCompanyId: string | null;
  selectCompany: (companyId: string) => void;
  /** Re-fetch /me — call after creating a company or any action that changes
   *  the user's membership list. */
  refresh: () => Promise<void>;
  /** Local-only: clears session state after a successful POST /logout call
   *  elsewhere (this provider doesn't call the auth API itself — pages do,
   *  via api/auth.ts — it just reflects the result). */
  clear: () => void;
};

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<SessionStatus>('loading');
  const [me, setMe] = useState<Me | null>(null);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const result = await fetchMe();
      setMe(result);
      setStatus('authenticated');
      // Auto-select only the unambiguous case; 0 and >1 are left for the
      // caller (route guards / an onboarding or company-selector page) to
      // handle — this provider doesn't redirect or render UI itself.
      setSelectedCompanyId(result.companies.length === 1 ? result.companies[0].companyId : null);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setMe(null);
        setSelectedCompanyId(null);
        setStatus('unauthenticated');
      } else {
        // A non-auth failure (network error, 500) shouldn't be reported as
        // "not logged in" — but there's no richer error state in scope for
        // M5b, so it still lands on the login screen with the option to
        // retry via a normal reload. Logged so it's visible in dev tools.
        console.error('SessionProvider: /me failed', err);
        setStatus('unauthenticated');
      }
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const onExpired = () => {
      setMe(null);
      setSelectedCompanyId(null);
      setStatus('unauthenticated');
    };
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired);
  }, []);

  const clear = useCallback(() => {
    setMe(null);
    setSelectedCompanyId(null);
    setStatus('unauthenticated');
  }, []);

  const value = useMemo<SessionContextValue>(
    () => ({ status, me, selectedCompanyId, selectCompany: setSelectedCompanyId, refresh: load, clear }),
    [status, me, selectedCompanyId, load, clear],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used within a SessionProvider');
  return ctx;
}
