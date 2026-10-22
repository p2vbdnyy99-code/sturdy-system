// The tender feed's collector: reads CPPP's public "latest active tenders"
// lists (central, state, GeM; see cppp.js) politely, page by page, and keeps
// what it finds in public_tenders.
//   - Off unless BIDPILOT_DISCOVERY_CPPP=on (config.bidpilot.discovery).
//   - One request at a time, with a pause between requests (3 s by default,
//     never under 2), identifying itself. About 12,700 pages make a full
//     pass of all three lists: roughly 14 hours.
//   - Two kinds of work: a "fresh" pass re-reads the newest pages of the
//     central and state lists every intervalMinutes (they are newest first);
//     between fresh passes a full sweep walks every page of every list in
//     turn. Where each sweep is lives in discovery_state, so a restart
//     carries on instead of starting again.
//   - Any error, or a page that no longer looks like the public list (for
//     example a captcha wall), doubles the pause, up to 30 minutes.
//   - Tenders closed more than keepClosedDays ago are deleted.
//   - Never solves or bypasses a captcha, never uses proxies, never
//     downloads documents, never opens a tender's own page.

import { eq, lt, sql } from 'drizzle-orm';
import { publicTenders, discoveryState } from '../../db/schema/index.js';
import { config } from '../../config.js';
import { log } from '../../logger.js';
import { cpppPageUrl, parseCpppList, parseLastPage } from './cppp.js';

export const USER_AGENT = 'TenderTezBot/1.0 (+https://tendertez.in; advayaicopilot@gmail.com)';
const MAX_BACKOFF_MS = 30 * 60 * 1000;
const FRESH_PAGES = 3;
const FRESH_LISTS = ['central', 'state']; // GeM's list is ordered by closing date, so "newest" isn't on page 1

let fetchImpl = (...args) => fetch(...args);
/** Tests replace the network call. */
export function setDiscoveryFetch(fn) { fetchImpl = fn; }

/** Read one page of a list. Returns { rows, lastPage } or throws. */
export async function fetchListPage(list, page) {
  const res = await fetchImpl(cpppPageUrl(list, page), {
    headers: { 'User-Agent': USER_AGENT, Accept: 'text/html' },
    redirect: 'follow',
    signal: AbortSignal.timeout(30_000),
  });
  if (res.status !== 200) throw new Error(`CPPP answered ${res.status}`);
  const html = await res.text();
  const { rows, tableFound } = parseCpppList(html, list);
  if (!tableFound) throw new Error('CPPP page did not contain the tender list');
  return { rows, lastPage: parseLastPage(html) };
}

/** Insert new rows and refresh known ones. */
export async function storeRows(db, rows) {
  if (rows.length === 0) return 0;
  // A page can repeat a row when the list shifts while it is read.
  const unique = [...new Map(rows.map((r) => [`${r.source}|${r.sourceKey}`, r])).values()];
  await db.insert(publicTenders)
    .values(unique)
    .onConflictDoUpdate({
      target: [publicTenders.source, publicTenders.sourceKey],
      set: {
        kind: sql`excluded.kind`,
        title: sql`excluded.title`,
        reference: sql`excluded.reference`,
        tenderId: sql`excluded.tender_id`,
        organisation: sql`excluded.organisation`,
        department: sql`excluded.department`,
        state: sql`excluded.state`,
        category: sql`excluded.category`,
        closingAt: sql`excluded.closing_at`,
        openingAt: sql`excluded.opening_at`,
        url: sql`excluded.url`,
        lastSeenAt: sql`now()`,
      },
    });
  return unique.length;
}

/** Delete tenders that closed more than `days` days ago. */
export async function pruneClosed(db, days, now = new Date()) {
  const cutoff = new Date(now.getTime() - days * 86400000);
  const gone = await db.delete(publicTenders).where(lt(publicTenders.closingAt, cutoff)).returning({ id: publicTenders.id });
  return gone.length;
}

async function loadState(db, list) {
  const [row] = await db.select().from(discoveryState).where(eq(discoveryState.list, list)).limit(1);
  return row ?? { list, nextPage: 1, totalPages: null, sweepStartedAt: null };
}

async function saveState(db, list, changes) {
  await db.insert(discoveryState)
    .values({ list, ...changes, updatedAt: new Date() })
    .onConflictDoUpdate({ target: discoveryState.list, set: { ...changes, updatedAt: new Date() } });
}

/**
 * The work loop without timers, so tests can drive it step by step.
 * Each step() makes exactly one request (or none, when nothing is switched on).
 */
export function createCrawler(db, {
  lists = config.bidpilot.discovery.lists,
  freshEveryMs = config.bidpilot.discovery.intervalMinutes * 60 * 1000,
  keepClosedDays = config.bidpilot.discovery.keepClosedDays,
  now = () => new Date(),
} = {}) {
  let freshQueue = [];
  let lastFreshAt = null;
  let turn = 0;
  let pagesSinceLog = 0;

  const nextJob = async () => {
    const t = now().getTime();
    if (freshQueue.length === 0 && (lastFreshAt === null || t - lastFreshAt >= freshEveryMs)) {
      lastFreshAt = t;
      freshQueue = FRESH_LISTS.filter((l) => lists.includes(l))
        .flatMap((list) => Array.from({ length: FRESH_PAGES }, (_, i) => ({ list, page: i + 1, fresh: true })));
      const pruned = await pruneClosed(db, keepClosedDays, now());
      if (pruned) log.info(`metric bidpilot_discovery pruned=${pruned}`);
    }
    if (freshQueue.length) return freshQueue.shift();
    if (lists.length === 0) return null;
    const list = lists[turn % lists.length];
    turn += 1;
    const state = await loadState(db, list);
    return { list, page: state.nextPage, fresh: false, state };
  };

  return {
    /** @returns {Promise<{ list, page, stored, fresh } | null>} */
    async step() {
      const job = await nextJob();
      if (!job) return null;
      try {
        const { rows, lastPage } = await fetchListPage(job.list, job.page);
        const stored = await storeRows(db, rows);
        if (!job.fresh) {
          const total = lastPage ?? job.state.totalPages ?? job.page;
          const done = job.page >= total || rows.length === 0;
          await saveState(db, job.list, {
            nextPage: done ? 1 : job.page + 1,
            totalPages: total,
            sweepStartedAt: job.page === 1 ? now() : (job.state.sweepStartedAt ?? now()),
            ...(done ? { lastSweepFinishedAt: now() } : {}),
            lastSuccessAt: now(),
            lastError: null,
          });
          pagesSinceLog += 1;
          if (done || pagesSinceLog >= 200) {
            pagesSinceLog = 0;
            log.info(`metric bidpilot_discovery list=${job.list} page=${job.page}/${total}${done ? ' sweep=done' : ''}`);
          }
        }
        return { list: job.list, page: job.page, stored, fresh: job.fresh };
      } catch (err) {
        // A failed fresh page is simply skipped; a failed sweep page is retried.
        if (!job.fresh) await saveState(db, job.list, { lastError: String(err?.message || err).slice(0, 200) }).catch(() => {});
        throw err;
      }
    },
  };
}

/** Starts the loop when switched on; returns a stop function. */
export function startDiscovery(db) {
  const settings = config.bidpilot.discovery;
  if (!settings.cppp || settings.lists.length === 0) return () => {};
  const baseMs = settings.delaySeconds * 1000;
  const crawler = createCrawler(db);
  let waitMs = baseMs;
  let timer = null;
  let stopped = false;
  const tick = async () => {
    try {
      await crawler.step();
      waitMs = baseMs;
    } catch (err) {
      waitMs = Math.min(MAX_BACKOFF_MS, Math.max(waitMs * 2, 60_000));
      log.info(`bidpilot discovery: cppp read failed (${String(err?.message || err).slice(0, 120)}); next try in ${Math.round(waitMs / 1000)} s`);
    }
    if (!stopped) timer = setTimeout(tick, waitMs);
  };
  timer = setTimeout(tick, 30_000); // after start-up settles
  log.info(`bidpilot discovery: CPPP lists ${settings.lists.join(', ')} on, ${settings.delaySeconds} s between pages, newest pages every ${settings.intervalMinutes} min`);
  return () => { stopped = true; if (timer) clearTimeout(timer); };
}
