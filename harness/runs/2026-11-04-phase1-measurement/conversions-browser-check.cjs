// Stage C end-to-end check against the local server, with GA4 pointed at a
// local capture server (ga4-capture.mjs writes each body to a .jsonl file).
// A visitor: pricing → "Choose Starter" → sign up → upload → analysis.
// Then a team account doing the same: no conversion events.
// node conversions-browser-check.cjs <origin> <capturedJsonl> <pdfPath> <databaseUrl>
const fs = require('fs');
const { chromium } = require('playwright');
const { Client } = require('/home/user/sturdy-system/tendertez-work/whatsapp-doc-assistant/backend/node_modules/pg');

const [origin, captured, pdfPath, dbUrl] = process.argv.slice(2);
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
let pass = 0, fail = 0;
const check = (ok, what) => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${what}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const events = () => fs.readFileSync(captured, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l).body)
  .flatMap((b) => b.events.map((e) => ({ client: b.client_id, name: e.name, params: e.params })));

async function signUp(page, email) {
  await page.goto(`${origin}/register`, { waitUntil: 'networkidle' });
  await page.fill('input[type=email]', email);
  await page.fill('input[type=password]', 'harness-pass-123456');
  await page.locator('form button[type=submit]').click();
  await page.waitForURL(/\/dashboard/, { timeout: 20000 });
  await sleep(1500);
}

// A visitor clicks a plan, then signs up. A team member signs up first (their
// browser is marked from then on), then clicks a plan.
async function journey(browser, email, { team = false, marked = false } = {}) {
  const ctx = await browser.newContext({ userAgent: UA });
  // A team member's browser, signed in as an account that isn't in the team list.
  if (marked) await ctx.addCookies([{ name: 'bidpilot_staff', value: '1', url: origin, httpOnly: true, sameSite: 'Lax' }]);
  const page = await ctx.newPage();
  if (team) {
    // The account may exist from an earlier run: make sure it does, then sign in.
    await ctx.request.post(`${origin}/bidpilot/register`, { data: { email, password: 'harness-pass-123456' } });
    await page.goto(`${origin}/login`, { waitUntil: 'networkidle' });
    await page.fill('input[type=email]', email);
    await page.fill('input[type=password]', 'harness-pass-123456');
    await page.locator('form button[type=submit]').click();
    await page.waitForURL(/\/dashboard/, { timeout: 20000 });
    await sleep(1500);
  }
  await page.goto(`${origin}/pricing`, { waitUntil: 'networkidle' });
  const starter = page.locator('a.pricing-plan-cta', { hasText: 'Choose Starter' });
  const href = await starter.getAttribute('href');
  await starter.evaluate((a) => a.addEventListener('click', (e) => e.preventDefault(), { once: true })); // don't leave for the mail app
  await starter.click();
  await sleep(800);
  if (!team) await signUp(page, email);
  const me = await (await ctx.request.get(`${origin}/bidpilot/me`)).json();
  const companyId = me.companies[0].companyId;
  const csrf = (await ctx.cookies()).find((c) => c.name === 'bidpilot_csrf').value;
  const up = await ctx.request.post(`${origin}/bidpilot/tenders/upload`, {
    headers: { 'X-CSRF-Token': csrf },
    multipart: { companyId, autoAnalyze: 'trial', file: { name: 'tender.pdf', mimeType: 'application/pdf', buffer: fs.readFileSync(pdfPath) } },
  });
  const { tenderId } = await up.json();
  let status = '';
  for (let i = 0; i < 60 && status !== 'COMPLETED'; i++) {
    await sleep(1000);
    status = (await (await ctx.request.get(`${origin}/bidpilot/tenders/${tenderId}?companyId=${companyId}`)).json()).analysisStatus;
  }
  await sleep(800);
  await ctx.close();
  return { href, upStatus: up.status(), status };
}

(async () => {
  const db = new Client({ connectionString: dbUrl }); await db.connect();
  const browser = await chromium.launch({ args: ['--no-proxy-server'] });

  fs.writeFileSync(captured, '');
  const since = new Date();
  const v = await journey(browser, `visitor${Date.now()}@example.test`);
  check(/^mailto:.*Subscribe%20to%20the%20Starter%20plan/.test(v.href), `the Starter button still opens the email (${v.href})`);
  check(v.upStatus === 201 && v.status === 'COMPLETED', `visitor's tender uploaded and analysed (${v.upStatus}, ${v.status})`);
  const ev = events();
  const conv = ev.filter((e) => e.name !== 'page_view');
  check(JSON.stringify(conv.map((e) => e.name)) === JSON.stringify(['plan_click', 'sign_up', 'upload', 'analysis_complete']),
    `the four events, once each, in order (${conv.map((e) => e.name).join(', ')})`);
  const byName = Object.fromEntries(conv.map((e) => [e.name, e]));
  check(byName.plan_click?.params.plan === 'starter', 'plan_click carries the plan');
  check(byName.sign_up?.params.method === 'password', 'sign_up carries the method');
  check(byName.upload?.params.from === 'dashboard', 'upload carries where it came from');
  check(byName.analysis_complete?.params.reanalysis === 'no', 'analysis_complete says first analysis');
  const pricingView = ev.find((e) => e.name === 'page_view' && /\/pricing$/.test(e.params.page_location));
  check(pricingView && byName.plan_click?.client === pricingView.client && byName.sign_up?.client === pricingView.client && byName.upload?.client === pricingView.client,
    'plan_click, sign_up and upload join the visitor\'s page views (same client id)');
  check(!JSON.stringify(conv).match(/@|tender\.pdf|[0-9a-f]{8}-[0-9a-f]{4}-/), 'no email, file name or record id in any event');
  const planRows = (await db.query("select count(*)::int n from page_views where path = '/plan-click/starter' and created_at >= $1", [since])).rows[0].n;
  check(planRows === 1, `plan click counted in the site's own numbers (${planRows})`);

  fs.writeFileSync(captured, '');
  const teamSince = new Date();
  const t = await journey(browser, 'founder@example.test', { team: true });
  check(t.status === 'COMPLETED', `team account's tender analysed (${t.status})`);
  const teamConv = events().filter((e) => e.name !== 'page_view');
  check(teamConv.length === 0, `no conversion events for the team (${teamConv.map((e) => e.name).join(', ') || 'none'})`);
  const teamRows = (await db.query('select count(*)::int n from page_views where created_at >= $1', [teamSince])).rows[0].n;
  check(teamRows === 1, `the team member's only counted page is the login page before signing in (${teamRows})`);

  // Review fix M1: a non-team account on a marked browser, all the way to a
  // finished (automatic) analysis: nothing at all reaches GA4.
  fs.writeFileSync(captured, '');
  const markedSince = new Date();
  const m = await journey(browser, `tester${Date.now()}@example.test`, { marked: true });
  check(m.upStatus === 201 && m.status === 'COMPLETED', `marked browser, non-team account: tender uploaded and analysed (${m.upStatus}, ${m.status})`);
  const markedAll = events();
  check(markedAll.length === 0, `marked browser: no page view and no sign_up, upload, analysis_complete or plan_click (${markedAll.map((e) => e.name).join(', ') || 'none'})`);
  const markedRows = (await db.query('select count(*)::int n from page_views where created_at >= $1', [markedSince])).rows[0].n;
  check(markedRows === 0, `marked browser: no visit counted (${markedRows})`);

  await browser.close(); await db.end();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
