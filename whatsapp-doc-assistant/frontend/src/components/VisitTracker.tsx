import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { recordVisit } from '../api/visits';

/** Counts each page shown, including moves within the app (see api/visits.ts). */
export function VisitTracker() {
  const { pathname } = useLocation();
  useEffect(() => {
    recordVisit(pathname);
  }, [pathname]);
  return null;
}
