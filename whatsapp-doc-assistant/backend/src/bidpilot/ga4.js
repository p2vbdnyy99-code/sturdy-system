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
// Off unless BIDPILOT_GA4_MEASUREMENT_ID (G-...) and BIDPILOT_GA4_API_SECRET
// are both set. Sending never delays or fails a page: it runs after the
// response, gives up after a few seconds, and never throws. The API secret is
// part of the request URL, so the URL is never logged.

import { PUBLIC_PAGES } from '../seo.js';
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
  const page = PUBLIC_PAGES[path];
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

/** The settings are usable: a G- measurement ID and a non-empty API secret. */
export function ga4Enabled({ measurementId, apiSecret } = {}) {
  return MEASUREMENT_ID.test(String(measurementId || '')) && String(apiSecret || '').length > 0;
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
  const url = `${endpoint}?measurement_id=${encodeURIComponent(measurementId)}&api_secret=${encodeURIComponent(apiSecret)}`;
  let lastLog = 0;
  const warn = (reason) => {
    const now = Date.now();
    if (now - lastLog < LOG_EVERY_MS) return;
    lastLog = now;
    logger.warn(`ga4: a page view was not sent (${reason})`);
  };

  return async function forward(visit) {
    try {
      const body = buildPageView(visit, baseUrl);
      if (!body) return false;
      const res = await fetchImpl(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) { warn(`HTTP ${res.status}`); return false; }
      return true;
    } catch (err) {
      // Only the error's name or code: a message could quote the URL, which holds the secret.
      warn(err?.cause?.code || err?.name || 'error');
      return false;
    }
  };
}
