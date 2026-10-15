// The tender feed's collector: reads the public CPPP latest-tenders page
// politely and stores what it finds in public_tenders.
//   - Off unless BIDPILOT_DISCOVERY_CPPP=on (config.bidpilot.discovery).
//   - One request at a time, every 10 minutes by default (never under 5),
//     identifying itself; doubles the wait after any error, up to 2 hours.
//   - Never solves or bypasses a captcha, never uses proxies, never downloads
//     documents. If the page stops looking like the public list, it backs off.

import { sql } from 'drizzle-orm';
import { publicTenders } from '../../db/schema/index.js';
import { config } from '../../config.js';
import { log } from '../../logger.js';
import { CPPP_LATEST_URL, parseCpppLatest } from './cppp.js';

export const USER_AGENT = 'TenderTezBot/1.0 (+https://tendertez.in; advayaicopilot@gmail.com)';
const MAX_BACKOFF_MS = 2 * 60 * 60 * 1000;

let fetchImpl = (...args) => fetch(...args);
/** Tests replace the network call. */
export function setDiscoveryFetch(fn) { fetchImpl = fn; }

/** Read the page once and store its rows. Returns { stored } or throws. */
export async function collectCpppOnce(db) {
  const res = await fetchImpl(CPPP_LATEST_URL, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'text/html' },
    redirect: 'follow',
    signal: AbortSignal.timeout(20_000),
  });
  if (res.status !== 200) throw new Error(`CPPP answered ${res.status}`);
  const html = await res.text();
  const { rows, tableFound } = parseCpppLatest(html);
  if (!tableFound) throw new Error('CPPP page did not contain the tender list');
  if (rows.length === 0) return { stored: 0 };
  await db.insert(publicTenders)
    .values(rows.map((r) => ({ source: 'cppp', ...r })))
    .onConflictDoUpdate({
      target: [publicTenders.source, publicTenders.sourceKey],
      set: {
        title: sql`excluded.title`,
        reference: sql`excluded.reference`,
        organisation: sql`excluded.organisation`,
        closingAt: sql`excluded.closing_at`,
        openingAt: sql`excluded.opening_at`,
        url: sql`excluded.url`,
        lastSeenAt: sql`now()`,
      },
    });
  return { stored: rows.length };
}

/** Starts the loop when switched on; returns a stop function. */
export function startDiscovery(db) {
  if (!config.bidpilot.discovery.cppp) return () => {};
  const baseMs = config.bidpilot.discovery.intervalMinutes * 60 * 1000;
  let waitMs = baseMs;
  let timer = null;
  let stopped = false;
  const tick = async () => {
    try {
      const { stored } = await collectCpppOnce(db);
      log.info(`metric bidpilot_discovery source=cppp stored=${stored}`);
      waitMs = baseMs;
    } catch (err) {
      waitMs = Math.min(MAX_BACKOFF_MS, waitMs * 2);
      log.info(`bidpilot discovery: cppp read failed (${String(err?.message || err).slice(0, 120)}); next try in ${Math.round(waitMs / 60000)} min`);
    }
    if (!stopped) timer = setTimeout(tick, waitMs);
  };
  timer = setTimeout(tick, 30_000); // after start-up settles
  log.info(`bidpilot discovery: CPPP feed on, every ${config.bidpilot.discovery.intervalMinutes} min`);
  return () => { stopped = true; if (timer) clearTimeout(timer); };
}
