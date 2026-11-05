// Delayed state (last success 5 hours ago): an info notice, not a warning, and no "right now".
// node delayed-check.cjs [origin]   (390 and 1366 px; screenshots go to SHOTS or next to this file)
const { chromium } = require('playwright');
const origin = process.argv[2] || 'http://localhost:8790';
const SHOTS = process.env.SHOTS || __dirname;
let pass = 0, fail = 0;
const check = (ok, what) => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} [delayed] ${what}`); };
(async () => {
  const facets = await (await fetch(`${origin}/bidpilot/public/tenders/facets`)).json();
  const status = facets.freshness?.sources?.state?.status;
  check(status === 'delayed', `server: the state list is delayed (${status})`);
  const b = await chromium.launch({ args: ['--no-proxy-server'] });
  for (const width of [390, 1366]) {
    const p = await b.newPage({ viewport: { width, height: 844 } });
    await p.goto(`${origin}/government-tenders/state/maharashtra`, { waitUntil: 'networkidle' });
    const cls = await p.locator('.tb-stale').getAttribute('class');
    const text = await p.locator('.tb-stale').innerText();
    const intro = await p.locator('.tb-intro-count').innerText();
    const ok = /notice-info/.test(cls) && /^Last updated .* IST\. The next update is late/.test(text) && /in our last update/.test(intro);
    check(ok, `${width}px: ${cls} | ${text} | ${intro}`);
    check(!/right now/i.test(await p.locator('main').innerText()), `${width}px: never says "right now"`);
    await p.screenshot({ path: `${SHOTS}/landing-delayed-${width}.png` });
    await p.close();
  }
  await b.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
