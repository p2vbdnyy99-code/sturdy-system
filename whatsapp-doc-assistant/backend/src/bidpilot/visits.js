// Visit counting for the TenderTez website, done by the site itself.
// -----------------------------------------------------------------------------
// The frontend posts { path, referrer, utm } to POST /bidpilot/visit on every
// page it shows. This records one page_views row with:
//   - the page, as a known route (ids replaced, anything else '(other)');
//   - where the visit came from: the referring site's hostname, or 'direct';
//   - utm_source from the landing URL, so links in posts and ads can be told
//     apart (e.g. ?utm_source=linkedin);
//   - phone or desktop, from the browser's description;
//   - an anonymous visitor id: a hash of IP + browser with a random salt that
//     is kept only in memory and replaced every day (India time). The same
//     person gets the same id for one day, then a new one, and the salt is
//     never stored, so the id can't be traced back to an IP address.
// No cookie, no user id, no IP address is stored. Bots and headless browsers
// are not counted. The endpoint always answers 204 and never fails a page.
// Rows older than RETENTION_DAYS are deleted once a day.

import crypto from 'node:crypto';
import express from 'express';
import { lt } from 'drizzle-orm';
import { getDb } from '../db/client.js';
import { pageViews } from '../db/schema/index.js';
import { log } from '../logger.js';
import { isLandingPath } from '../landingPages.js';

export const RETENTION_DAYS = 395; // about 13 months

const ROUTES = [
  [/^\/$/, '/'],
  [/^\/government-tenders$/, '/government-tenders'],
  [/^\/features$/, '/features'],
  [/^\/sample-analysis$/, '/sample-analysis'],
  [/^\/pricing$/, '/pricing'],
  [/^\/faq$/, '/faq'],
  [/^\/about$/, '/about'],
  [/^\/privacy-policy$/, '/privacy-policy'],
  [/^\/register$/, '/register'],
  [/^\/guides$/, '/guides'],
  [/^\/guides\/(tender-eligibility-check|emd-exemption|tender-corrigendum)$/, null],
  [/^\/login$/, '/login'],
  [/^\/verify-email$/, '/verify-email'],
  [/^\/onboarding\/create-company$/, '/onboarding/create-company'],
  [/^\/dashboard$/, '/dashboard'],
  [/^\/tenders\/[^/]+$/, '/tenders/:id'],
  [/^\/company-profile$/, '/company-profile'],
];

const BOT_UA = /bot|crawl|spider|slurp|headless|lighthouse|preview|facebookexternalhit|whatsapp|python|curl|wget|httpclient|monitor/i;

/** A route name for the page, or '(other)'. Query strings never stored. */
export function normalizePath(raw) {
  if (typeof raw !== 'string' || !raw.startsWith('/')) return null;
  const path = raw.split(/[?#]/)[0].replace(/\/+$/, '') || '/';
  // Tender-search landing pages are public lists, counted by their own path.
  if (isLandingPath(path)) return path;
  // A null name keeps the path itself (the guides).
  for (const [re, name] of ROUTES) if (re.test(path)) return name ?? path;
  return '(other)';
}

/** The referring site's hostname without www., or 'direct' for none or our own site. */
export function sourceFrom(referrer, ownHosts) {
  if (typeof referrer !== 'string' || !referrer) return 'direct';
  let host;
  try { host = new URL(referrer).hostname.toLowerCase(); } catch { return 'direct'; }
  if (!host || ownHosts.has(host)) return 'direct';
  return host.replace(/^www\./, '').slice(0, 100);
}

/** utm_source as given, limited to simple characters, or null. */
export function campaignFrom(utm) {
  if (typeof utm !== 'string') return null;
  const clean = utm.toLowerCase().replace(/[^a-z0-9._-]/g, '').slice(0, 40);
  return clean || null;
}

export function deviceFrom(ua) {
  return /mobi|android|iphone|ipad|ipod/i.test(ua || '') ? 'mobile' : 'desktop';
}

export function isBot(ua) {
  return !ua || BOT_UA.test(ua);
}

/** Today's date in India, YYYY-MM-DD. */
export function istDay(now = Date.now()) {
  return new Date(now + 330 * 60_000).toISOString().slice(0, 10);
}

/** Rows for days before this are deleted. */
export function retentionCutoff(day) {
  return new Date(Date.parse(`${day}T00:00:00Z`) - RETENTION_DAYS * 86_400_000).toISOString().slice(0, 10);
}

/** The daily salt, held only in memory. onNewDay runs once when the day changes. */
export function createSaltKeeper({ onNewDay = () => {} } = {}) {
  let current = { day: null, salt: null };
  return (day) => {
    if (current.day !== day) {
      current = { day, salt: crypto.randomBytes(32).toString('hex') };
      onNewDay(day);
    }
    return current.salt;
  };
}

export function visitorIdFor(salt, ip, ua) {
  return crypto.createHash('sha256').update(`${salt}|${ip}|${ua}`).digest('hex').slice(0, 16);
}

/** At most `max` counted visits per IP per minute; extra ones are ignored. */
export function createVisitRateLimit({ max = 60, windowMs = 60_000 } = {}) {
  const windows = new Map();
  return (ip, now = Date.now()) => {
    if (windows.size > 10_000) {
      for (const [key, w] of windows) if (w.resetAt <= now) windows.delete(key);
    }
    const w = windows.get(ip);
    if (!w || w.resetAt <= now) {
      windows.set(ip, { count: 1, resetAt: now + windowMs });
      return true;
    }
    w.count += 1;
    return w.count <= max;
  };
}

/**
 * `forward`, when given, also receives each counted visit (ga4.js sends the
 * public pages to Google Analytics). It runs after the 204 and never blocks
 * or fails the visit row.
 */
export function createVisitsRouter({ ownHosts = [], db: injectedDb, forward = null } = {}) {
  const router = express.Router();
  const hosts = new Set(ownHosts.map((h) => h.toLowerCase()));
  const allow = createVisitRateLimit();
  const dbFor = () => injectedDb || getDb();
  const saltFor = createSaltKeeper({
    onNewDay: (day) => {
      dbFor().delete(pageViews).where(lt(pageViews.day, retentionCutoff(day)))
        .catch((err) => log.warn(`visits: old-row cleanup failed: ${err.message}`));
    },
  });

  router.post('/visit', async (req, res) => {
    res.status(204).end();
    try {
      const ua = String(req.get('user-agent') || '').slice(0, 500);
      if (isBot(ua) || !allow(req.ip)) return;
      const path = normalizePath(req.body?.path);
      if (!path) return;
      const day = istDay();
      const visit = {
        day,
        path,
        source: sourceFrom(req.body?.referrer, hosts),
        campaign: campaignFrom(req.body?.utm),
        device: deviceFrom(ua),
        visitorId: visitorIdFor(saltFor(day), req.ip, ua),
      };
      if (forward) {
        try { Promise.resolve(forward(visit)).catch(() => {}); } catch { /* never fails the visit */ }
      }
      await dbFor().insert(pageViews).values(visit);
    } catch (err) {
      log.warn(`visits: could not record a page view: ${err.message}`);
    }
  });

  return router;
}
