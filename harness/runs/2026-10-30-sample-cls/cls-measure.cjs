// Repeatable layout-shift measurement for one page at a phone viewport.
// node cls-measure.cjs <url> <runs> <label>
// Viewport 390x844, DPR 3, touch, mobile UA; CPU 4x slower (CDP); network
// emulated as a slow 4G link (150 ms RTT, 1.6 Mb/s down, 750 kb/s up); a
// fresh context per run (empty cache). CLS = the largest session window
// (gap 1 s, cap 5 s), as Chrome defines it; total = the sum of all shifts.
const { chromium } = require('playwright');
const fs = require('fs');

const [url, runsArg = '5', label = 'run'] = process.argv.slice(2);
const RUNS = Number(runsArg);
const UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36';

const observer = () => {
  window.__shifts = [];
  window.__lcp = null;
  window.__boqAt = null;
  new MutationObserver((_, mo) => {
    if (document.querySelector('.sample-boq')) { window.__boqAt = Math.round(performance.now()); mo.disconnect(); }
  }).observe(document, { childList: true, subtree: true });
  const describe = (n) => {
    if (!n) return '(removed node)';
    if (n.nodeType !== 1) return `#text "${(n.textContent || '').trim().slice(0, 40)}" in ${describe(n.parentElement)}`;
    const cls = n.className && typeof n.className === 'string' ? '.' + n.className.trim().split(/\s+/).join('.') : '';
    const text = (n.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 50);
    return `${n.tagName.toLowerCase()}${n.id ? '#' + n.id : ''}${cls} "${text}"`;
  };
  new PerformanceObserver((list) => {
    for (const e of list.getEntries()) {
      if (e.hadRecentInput) continue;
      window.__shifts.push({
        t: Math.round(e.startTime), value: e.value,
        sources: (e.sources || []).map((s) => ({
          node: describe(s.node),
          prev: [s.previousRect.x, s.previousRect.y, s.previousRect.width, s.previousRect.height].map(Math.round),
          curr: [s.currentRect.x, s.currentRect.y, s.currentRect.width, s.currentRect.height].map(Math.round),
        })),
      });
    }
  }).observe({ type: 'layout-shift', buffered: true });
  new PerformanceObserver((list) => {
    const es = list.getEntries(); const e = es[es.length - 1];
    window.__lcp = { t: Math.round(e.startTime), node: describe(e.element), size: e.size };
  }).observe({ type: 'largest-contentful-paint', buffered: true });
};

function sessionCls(shifts) {
  let best = 0, cur = 0, start = -Infinity, last = -Infinity;
  for (const s of shifts) {
    if (s.t - last > 1000 || s.t - start > 5000) { cur = 0; start = s.t; }
    cur += s.value; last = s.t; best = Math.max(best, cur);
  }
  return best;
}

(async () => {
  const browser = await chromium.launch({ args: ['--no-proxy-server'] });
  const results = [];
  for (let i = 0; i < RUNS; i++) {
    const ctx = await browser.newContext({
      viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, userAgent: UA,
    });
    const page = await ctx.newPage();
    const console_ = [];
    page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console_.push(m.text()); });
    page.on('pageerror', (e) => console_.push(String(e)));
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8,
    });
    await page.addInitScript(observer);
    const t0 = Date.now();
    await page.goto(url, { waitUntil: 'load' });
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2500);
    const r = await page.evaluate(() => ({
      shifts: window.__shifts, lcp: window.__lcp,
      fcp: Math.round(performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? -1),
      scrollW: document.documentElement.scrollWidth, clientW: document.documentElement.clientWidth,
      loading: document.body.innerText.includes('Loading the sample'),
      h1: document.querySelector('h1')?.textContent,
      boqAt: window.__boqAt,
      jsonRequests: performance.getEntriesByType('resource').filter((e) => e.name.includes('/public/sample-analysis')).length,
    }));
    r.cls = sessionCls(r.shifts);
    r.total = r.shifts.reduce((n, s) => n + s.value, 0);
    r.wallMs = Date.now() - t0;
    r.console = console_;
    results.push(r);
    console.log(`${label} run ${i + 1}: CLS ${r.cls.toFixed(4)} (total ${r.total.toFixed(4)}, ${r.shifts.length} shifts) FCP ${r.fcp} ms LCP ${r.lcp?.t} ms [${r.lcp?.node}] full content in DOM ${r.boqAt} ms, sample JSON requests ${r.jsonRequests}, scroll ${r.scrollW}/${r.clientW} h1 "${r.h1}" console ${console_.length}`);
    await ctx.close();
  }
  await browser.close();
  fs.writeFileSync(`${__dirname}/cls-${label}.json`, JSON.stringify(results, null, 2));
  const cls = results.map((r) => r.cls);
  console.log(`${label}: CLS min ${Math.min(...cls).toFixed(4)} max ${Math.max(...cls).toFixed(4)} median ${cls.sort((a, b) => a - b)[Math.floor(cls.length / 2)].toFixed(4)}`);
})().catch((e) => { console.error(e); process.exit(1); });
