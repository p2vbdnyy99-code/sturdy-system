// Google Analytics 4, fed by the server (the GA4 Measurement Protocol).
// -----------------------------------------------------------------------------
// The browser never loads a Google script and gets no cookie: the site's own
// visit counter (visits.js) already knows the page, where the visitor came
// from, the utm_source and phone or computer, and this module sends those to
// Google Analytics as a page_view. So the Content-Security-Policy stays
// 'self'-only and the privacy policy's "no scripts from other companies" holds.
//
// What is sent, and only for the public pages in seo.js's PUBLIC_PAGES (never a
// signed-in page, never a tender):
//   - client_id: made from the counter's anonymous visitor id, which changes
//     every day, so Google sees a new "user" each day and can't follow anyone;
//   - session_id: the India day, so one visitor's pages on one day are a session;
//   - page_location and page_title of the public page, page_referrer as the
//     referring site's address only (https://linkedin.com/), and the utm_source;
//   - device.category: mobile or desktop.
// No IP address, no browser description, no account and no cookie is sent.
// Without an IP, Google can't tell the visitor's country or city.
//
// Conversion events (Nov 2026, conversions.js): sign_up, upload,
// analysis_complete and plan_click, with at most one small parameter (the
// sign-in method, where the upload came from, whether it was a re-analysis,
// the plan name). Never an account, company or tender id, a file name or
// anything from a tender. An event tied to a request uses that visitor's
// daily id, so Google joins it to the same day's page views and source; a
// background event (analysis_complete) gets a random id and is only counted.
//
// Off unless BIDPILOT_GA4_MEASUREMENT_ID (G-...) and BIDPILOT_GA4_API_SECRET
// are both set. Sending never delays or fails a page: it runs after the
// response, gives up after a few seconds, and never throws. The API secret is
// part of the request URL, so the URL is never logged.

import crypto from 'node:crypto';
import { PUBLIC_PAGES } from '../seo.js';
import { isLandingPath } from '../landingPages.js';
import { log } from '../logger.js';

export const GA4_ENDPOINT = 'https://www.google-analytics.com/mp/collect';
const MEASUREMENT_ID = /^G-[A-Z0-9]{4,20}$/;
const LOG_EVERY_MS = 10 * 60_000;

/** The India day's midnight as Unix seconds, e.g. '2026-10-15' -> 1760466600. */
function dayStartSeconds(day) {
  return Math.floor(Date.parse(`${day}T00:00:00+05:30`) / 1000);
}

/** Measurement Protocol body for one page view, or null for a page that isn't public. */
export function buildPageView({ path, source, campaign, device, visitorId, day }, baseUrl) {
  const page = PUBLIC_PAGES[path] ?? (isLandingPath(path) ? { title: 'Government tenders | TenderTez' } : null);
  if (!page || !/^[0-9a-f]{16}$/.test(String(visitorId)) || !/^\d{4}-\d{2}-\d{2}$/.test(String(day))) return null;
  const dayStart = dayStartSeconds(day);
  const location = `${baseUrl}${path}${campaign ? `?utm_source=${encodeURIComponent(campaign)}` : ''}`;
  const params = {
    page_location: location,
    page_title: page.title,
    session_id: String(dayStart),
    engagement_time_msec: 100,
    visit_source: source || 'direct',
  };
  if (source && source !== 'direct') params.page_referrer = `https://${source}/`;
  if (campaign) params.visit_campaign = campaign;
  return {
    client_id: `${parseInt(visitorId.slice(0, 8), 16)}.${dayStart}`,
    events: [{ name: 'page_view', params }],
    device: { category: device === 'mobile' ? 'mobile' : 'desktop' },
  };
}

// Each event and the one parameter it may carry, with its allowed values.
const EVENTS = {
  sign_up: { method: ['password', 'google', 'phone'] },
  upload: { from: ['dashboard', 'tracked_tender'] },
  analysis_complete: { reanalysis: ['yes', 'no'] },
  plan_click: { plan: ['starter', 'growth', 'pro', 'contact'] },
};
export const CONVERSION_EVENTS = Object.keys(EVENTS);

/**
 * Measurement Protocol body for one conversion event, or null for an unknown
 * event. Parameters outside the event's list are dropped. With the visitor's
 * daily id and day, Google joins the event to that visitor's page views.
 */
export function buildEvent({ name, params = {}, visitorId = null, day = null }, now = Date.now()) {
  const allowed = EVENTS[name];
  if (!allowed) return null;
  const clean = {};
  for (const [key, values] of Object.entries(allowed)) {
    if (values.includes(params[key])) clean[key] = params[key];
  }
  const linked = /^[0-9a-f]{16}$/.test(String(visitorId)) && /^\d{4}-\d{2}-\d{2}$/.test(String(day));
  const start = linked ? dayStartSeconds(day) : Math.floor(now / 1000);
  const clientId = linked ? `${parseInt(visitorId.slice(0, 8), 16)}.${start}` : `${crypto.randomInt(2 ** 31)}.${start}`;
  return {
    client_id: clientId,
    events: [{ name, params: { ...clean, session_id: String(start), engagement_time_msec: 100 } }],
  };
}

/** The settings are usable: a G- measurement ID and a non-empty API secret. */
export function ga4Enabled({ measurementId, apiSecret } = {}) {
  return MEASUREMENT_ID.test(String(measurementId || '')) && String(apiSecret || '').length > 0;
}

/** `(body, what) => Promise<boolean>` posting one Measurement Protocol body. */
function createPoster({ measurementId, apiSecret, endpoint, fetchImpl, timeoutMs, logger }) {
  const url = `${endpoint}?measurement_id=${encodeURIComponent(measurementId)}&api_secret=${encodeURIComponent(apiSecret)}`;
  let lastLog = 0;
  const warn = (what, reason) => {
    const now = Date.now();
    if (now - lastLog < LOG_EVERY_MS) return;
    lastLog = now;
    logger.warn(`ga4: ${what} was not sent (${reason})`);
  };
  return async (body, what) => {
    try {
      if (!body) return false;
      const res = await fetchImpl(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) { warn(what, `HTTP ${res.status}`); return false; }
      return true;
    } catch (err) {
      // Only the error's name or code: a message could quote the URL, which holds the secret.
      warn(what, err?.cause?.code || err?.name || 'error');
      return false;
    }
  };
}

/**
 * A function that sends one counted visit to GA4, or null when GA4 is off.
 * The function's promise always resolves (true when Google answered 2xx).
 */
export function createGa4Forwarder({
  measurementId, apiSecret, baseUrl, endpoint = GA4_ENDPOINT,
  fetchImpl = globalThis.fetch, timeoutMs = 3000, logger = log,
} = {}) {
  if (!ga4Enabled({ measurementId, apiSecret })) return null;
  const post = createPoster({ measurementId, apiSecret, endpoint, fetchImpl, timeoutMs, logger });
  return async function forward(visit) {
    try {
      return await post(buildPageView(visit, baseUrl), 'a page view');
    } catch {
      return false;
    }
  };
}

/**
 * A function that sends one conversion event ({ name, params, visitorId,
 * day }) to GA4, or null when GA4 is off. Its promise always resolves.
 */
export function createGa4EventSender({
  measurementId, apiSecret, endpoint = GA4_ENDPOINT,
  fetchImpl = globalThis.fetch, timeoutMs = 3000, logger = log,
} = {}) {
  if (!ga4Enabled({ measurementId, apiSecret })) return null;
  const post = createPoster({ measurementId, apiSecret, endpoint, fetchImpl, timeoutMs, logger });
  return async function send(event) {
    try {
      return await post(buildEvent(event), 'an event');
    } catch {
      return false;
    }
  };
}
