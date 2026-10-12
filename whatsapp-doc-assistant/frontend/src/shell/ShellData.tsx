// Data the app shell shares with the page inside it: the company's tenders in
// deadline order (for the queue panel and the dashboard's "next deadline") and
// the dashboard summary (counts and the plan allowance). Fetched once per
// shell, so the panel and the page don't each ask for the same thing.
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { ApiError } from '../api/client';
import { getDashboardSummary, type DashboardSummary } from '../api/dashboard';
import { listTenders, type TenderListItem } from '../api/tenders';
import { useSession } from '../auth/SessionProvider';
import { freeTendersLeft } from './profileGate';

/** The API's page-size cap (repo/tenders.js). */
export const QUEUE_LIMIT = 100;

export type ShellData = {
  tenders: TenderListItem[];
  total: number;
  summary: DashboardSummary | null;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  /** The company profile: optional for the first tenders, then required
   *  (shell/profileGate.ts). `requireProfile()` returns true, and opens the
   *  "complete your profile" dialog, when an upload must wait for it. */
  profile: {
    complete: boolean;
    freeLeft: number | null;
    dialogOpen: boolean;
    openDialog: () => void;
    closeDialog: () => void;
    requireProfile: () => boolean;
  };
};

const ShellDataContext = createContext<ShellData | null>(null);

export function ShellDataProvider({ companyId, children }: { companyId: string; children: ReactNode }) {
  const [tenders, setTenders] = useState<TenderListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const { me } = useSession();
  const complete = Boolean(me?.companies.find((c) => c.companyId === companyId)?.profileComplete);
  const freeLeft = freeTendersLeft(complete, total);

  const reload = useCallback(async () => {
    setError(null);
    try {
      const [list, sum] = await Promise.all([
        listTenders({ companyId, limit: QUEUE_LIMIT, sortBy: 'deadline', sortOrder: 'asc' }),
        getDashboardSummary(companyId),
      ]);
      setTenders(list.tenders);
      setTotal(list.total);
      setSummary(sum);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load your tenders.');
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => { reload(); }, [reload]);

  return (
    <ShellDataContext.Provider value={{
      tenders, total, summary, loading, error, reload,
      profile: {
        complete,
        freeLeft,
        dialogOpen,
        openDialog: () => setDialogOpen(true),
        closeDialog: () => setDialogOpen(false),
        requireProfile: () => {
          if (freeLeft !== 0 || loading) return false;
          setDialogOpen(true);
          return true;
        },
      },
    }}>
      {children}
    </ShellDataContext.Provider>
  );
}

export function useShellData(): ShellData {
  const value = useContext(ShellDataContext);
  if (!value) throw new Error('useShellData must be used inside AppShell');
  return value;
}
