// /insights card layout check (local harness on 8790, signed in as the harness founder account).
// node insights-layout-check.cjs <origin> <before|after> <mixed|unavailable>
//   mixed:       central fresh, state delayed, GeM stale (set in the local database by the caller)
//   unavailable: all three lists unavailable (failing for over 7 days)
// before: records every card's size and screenshot in ./before.
// after:  checks the Tender feed card's layout and compares every other card with ./before.
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const [origin = 'http://localhost:8790', mode = 'after', state = 'mixed'] = process.argv.slice(2);
const OUT = path.join(__dirname, mode);
fs.mkdirSync(OUT, { recursive: true });
let pass = 0, fail = 0;
const check = (ok, what) => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} [${mode} ${state}] ${what}`); };
const EXPECT = {
  mixed: { 'Central government tenders': /^Fresh$/, 'State tenders': /^Delayed$/, 'GeM bids': /^Stale$/ },
  unavailable: { 'Central government tenders': /^Unavailable \(failing for over 7 days\)$/, 'State tenders': /^Unavailable \(failing for over 7 days\)$/, 'GeM bids': /^Unavailable \(failing for over 7 days\)$/ },
}[state];
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

(async () => {
  const browser = await chromium.launch({ args: ['--no-proxy-server'] });
  for (const width of [390, 1366]) {
    const ctx = await browser.newContext({ viewport: { width, height: 900 }, isMobile: width < 800, hasTouch: width < 800 });
    await ctx.request.post(`${origin}/bidpilot/register`, { data: { email: 'founder@example.test', password: 'harness-pass-123456' } });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(`${origin}/login`, { waitUntil: 'networkidle' });
    await page.fill('input[type=email]', 'founder@example.test');
    await page.fill('input[type=password]', 'harness-pass-123456');
    await page.locator('form button[type=submit]').click();
    await page.waitForURL(/\/dashboard/);
    await page.goto(`${origin}/insights`, { waitUntil: 'networkidle' });
    await page.waitForSelector('section.ins-card');
    await page.waitForTimeout(800);
    const cards = page.locator('section.ins-card');
    const n = await cards.count();
    const sizes = {};
    for (let i = 0; i < n; i++) {
      const card = cards.nth(i);
      const title = (await card.locator('h2').first().innerText()).trim();
      await card.scrollIntoViewIfNeeded();
      const box = await card.boundingBox();
      sizes[title] = { width: Math.round(box.width), height: Math.round(box.height) };
      // Layout signature: every element's place and size inside the card, and the card's text.
      // (Pixels shift by sub-pixel anti-aliasing when a card moves up or down the page.)
      sizes[title].layout = await card.evaluate((el) => {
        const o = el.getBoundingClientRect();
        const r = (n) => Math.round(n * 2) / 2;
        return [...el.querySelectorAll('*')].map((e) => { const b = e.getBoundingClientRect(); return `${e.tagName}:${r(b.left - o.left)},${r(b.top - o.top)},${r(b.width)}x${r(b.height)}`; }).join(' ');
      });
      sizes[title].text = (await card.innerText()).replace(/\s+/g, ' ');
      const file = path.join(OUT, `${state}-${width}-${slug(title)}.png`);
      await card.screenshot({ path: file, animations: 'disabled' });
      // The card's content without its frame: a grid neighbour can stretch the frame, not this.
      await card.locator(':scope > :not(header)').first().screenshot({ path: file.replace(/\.png$/, '-content.png'), animations: 'disabled' });
    }
    await page.screenshot({ path: path.join(OUT, `${state}-${width}-full.png`), fullPage: true });
    fs.writeFileSync(path.join(OUT, `${state}-${width}-sizes.json`), JSON.stringify(sizes, null, 2));

    if (mode === 'after') {
      // The Tender feed card: one row per list, status readable on at most two lines.
      const feed = page.locator('section.ins-card:has(h2:text-is("Tender feed"))');
      const rows = await feed.locator('li').evaluateAll((lis) => lis.map((li) => {
        const status = li.querySelector('[class*="status"]');
        const lh = parseFloat(getComputedStyle(status).lineHeight) || 16;
        const r = status.getBoundingClientRect();
        return { list: li.querySelector('strong').textContent.trim(), status: status.textContent.trim(), statusLines: Math.round(r.height / lh), statusWidth: Math.round(r.width), rowHeight: Math.round(li.getBoundingClientRect().height), text: li.innerText };
      }));
      check(rows.length === 3, `${width}px: three lists in the Tender feed card`);
      for (const r of rows) {
        check(EXPECT[r.list]?.test(r.status), `${width}px ${r.list}: status "${r.status}"`);
        check(r.statusLines <= 2 && r.statusWidth >= 60, `${width}px ${r.list}: status on ${r.statusLines} line(s), ${r.statusWidth}px wide`);
        check(r.rowHeight <= 110, `${width}px ${r.list}: row ${r.rowHeight}px tall`);
        check(/Last success: /.test(r.text), `${width}px ${r.list}: last success shown`);
        if (state === 'unavailable') check(/Last failure: .* · CPPP answered 404/.test(r.text), `${width}px ${r.list}: last failure and error shown`);
      }
      check(sizes['Tender feed'].height <= 500, `${width}px: Tender feed card ${sizes['Tender feed'].height}px tall`);
      const overflow = await feed.evaluate((el) => [el.scrollWidth, el.clientWidth]);
      check(overflow[0] <= overflow[1], `${width}px: no overflow inside the card (${overflow.join('/')})`);
      const sw = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
      check(sw[0] <= sw[1], `${width}px: no horizontal page scroll (${sw.join('/')})`);
      // Every other card: same size and same pixels as before the fix.
      const before = JSON.parse(fs.readFileSync(path.join(__dirname, 'before', `${state}-${width}-sizes.json`), 'utf8'));
      for (const title of Object.keys(sizes)) {
        if (title === 'Tender feed') continue;
        const pick = (x) => ({ width: x.width, height: x.height });
        const same = JSON.stringify(pick(before[title])) === JSON.stringify(pick(sizes[title]));
        // Relative times ("3 min ago") tick on between runs; compare them as "N ago".
        const norm = (t) => t.replace(/\b\d+ ?(s|sec|min|m|h|hr|d|days?) ago\b/g, 'N ago');
        const sameLayout = before[title].layout === sizes[title].layout && norm(before[title].text) === norm(sizes[title].text);
        const a = fs.readFileSync(path.join(__dirname, 'before', `${state}-${width}-${slug(title)}.png`));
        const b = fs.readFileSync(path.join(OUT, `${state}-${width}-${slug(title)}.png`));
        const label = `${width}px "${title}": ${same ? 'same size' : `size ${JSON.stringify(pick(before[title]))} -> ${JSON.stringify(pick(sizes[title]))}`}, ${sameLayout ? 'same layout and text' : 'layout or text differs'}, ${a.equals(b) ? 'identical pixels' : 'pixels differ (sub-pixel position)'}`;
        const ca = fs.readFileSync(path.join(__dirname, 'before', `${state}-${width}-${slug(title)}-content.png`));
        const cb = fs.readFileSync(path.join(OUT, `${state}-${width}-${slug(title)}-content.png`));
        if (title === 'Latest activity') console.log(`NOTE [${mode} ${state}] ${label}`);
        else if (!same && before[title].width === sizes[title].width && sizes[title].height < before[title].height) {
          // Same grid row as the Tender feed card on desktop: it was stretched to the broken card's height.
          check(ca.equals(cb) || sameLayout, `${label}; shares a row with the Tender feed card (content ${ca.equals(cb) ? 'pixel-identical' : 'same layout'})`);
        } else check(same && sameLayout, label);
      }
      // The activity list is back to its own layout (pre-v55: a block list, rows separated by their own borders).
      const act = await page.locator('section.ins-card:has(h2:text-is("Latest activity")) ul').evaluate((ul) => {
        const s = getComputedStyle(ul); const li = ul.querySelector('li'); const ls = li && getComputedStyle(li);
        return { display: s.display, rowGap: s.rowGap, liColumns: ls ? ls.gridTemplateColumns.split(' ').length : 0 };
      }).catch(() => null);
      check(act && act.display === 'block' && act.liColumns === 3, `${width}px: Latest activity keeps its three-column rows, list not spaced by the feed card's rule (${JSON.stringify(act)})`);
    }
    check(errors.length === 0, `${width}px: no page errors ${JSON.stringify(errors)}`);
    await ctx.close();
  }
  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
