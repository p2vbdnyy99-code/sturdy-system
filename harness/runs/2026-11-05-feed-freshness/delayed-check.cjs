// Delayed state (last success 5 hours ago): an info notice, not a warning, and no "right now".
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--no-proxy-server'] });
  const p = await b.newPage({ viewport: { width: 390, height: 844 } });
  await p.goto('http://localhost:8790/government-tenders/state/maharashtra', { waitUntil: 'networkidle' });
  const cls = await p.locator('.tb-stale').getAttribute('class');
  const text = await p.locator('.tb-stale').innerText();
  const intro = await p.locator('.tb-intro-count').innerText();
  const ok = /notice-info/.test(cls) && /^Last updated .* IST\. The next update is late/.test(text) && /in our last update/.test(intro);
  console.log(ok ? 'PASS' : 'FAIL', '[delayed] 390px:', cls, '|', text, '|', intro);
  await p.screenshot({ path: `${__dirname}/landing-delayed-390.png` });
  await b.close(); process.exit(ok ? 0 : 1);
})();
