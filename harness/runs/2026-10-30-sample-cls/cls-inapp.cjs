// Layout shift when /sample-analysis is opened from the home page's link
// (in-app navigation: no server HTML, the page fetches its data).
// node cls-inapp.cjs <origin> <runs> <label>
// Same phone settings as cls-measure.cjs. Shifts within 500 ms of the tap are
// excluded by Chrome (hadRecentInput); everything else counts.
// RTT and KBPS (environment) override the 150 ms / 1600 kb/s network.
const { chromium } = require('playwright');

const [origin, runsArg = '5', label = 'inapp'] = process.argv.slice(2);
const UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36';

(async () => {
  const browser = await chromium.launch({ args: ['--no-proxy-server'] });
  const all = [];
  for (let i = 0; i < Number(runsArg); i++) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, userAgent: UA });
    const page = await ctx.newPage();
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: Number(process.env.RTT || 150), downloadThroughput: (Number(process.env.KBPS || 1600) * 1024) / 8, uploadThroughput: (750 * 1024) / 8 });
    await page.goto(`${origin}/`, { waitUntil: 'networkidle' });
    await page.evaluate(() => {
      window.__after = [];
      new PerformanceObserver((l) => {
        for (const e of l.getEntries()) window.__after.push({ v: e.value, input: e.hadRecentInput, t: Math.round(e.startTime), src: (e.sources || []).map((s) => s.node?.className || s.node?.nodeName) });
      }).observe({ type: 'layout-shift' });
    });
    await page.locator('a[href="/sample-analysis"]').first().tap();
    await page.waitForSelector('.sample-boq', { timeout: 20000 });
    await page.waitForTimeout(1500);
    const shifts = await page.evaluate(() => window.__after);
    const counted = shifts.filter((s) => !s.input);
    const v = counted.reduce((n, s) => n + s.v, 0);
    all.push(v);
    console.log(`${label} run ${i + 1}: counted shift ${v.toFixed(4)} (${counted.length} counted, ${shifts.length - counted.length} after input) ${JSON.stringify(counted.map((s) => [s.v.toFixed(3), s.src.join('|')]))}`);
    await ctx.close();
  }
  await browser.close();
  console.log(`${label}: min ${Math.min(...all).toFixed(4)} max ${Math.max(...all).toFixed(4)}`);
})().catch((e) => { console.error(e); process.exit(1); });
