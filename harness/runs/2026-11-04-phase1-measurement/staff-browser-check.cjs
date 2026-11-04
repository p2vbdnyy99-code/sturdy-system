// Stage B browser check: a team account's visits are not counted, signed in
// or (on the same browser) signed out; an ordinary visitor's are.
// Server started with BIDPILOT_ADMIN_EMAILS=founder@example.test.
// node staff-browser-check.cjs <origin> <databaseUrl>
const { chromium } = require('playwright');
const { Client } = require('/home/user/sturdy-system/tendertez-work/whatsapp-doc-assistant/backend/node_modules/pg');

const [origin = 'http://localhost:8790', dbUrl] = process.argv.slice(2);
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
let pass = 0, fail = 0;
const check = (ok, what) => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${what}`); };

(async () => {
  const db = new Client({ connectionString: dbUrl }); await db.connect();
  const views = async () => (await db.query('select count(*)::int n from page_views')).rows[0].n;
  const browser = await chromium.launch({ args: ['--no-proxy-server'] });

  // The team member signs up and in.
  const team = await browser.newContext({ userAgent: UA });
  const reg = await team.request.post(`${origin}/bidpilot/register`, { data: { email: 'founder@example.test', password: 'harness-pass-123456', name: 'Founder' } });
  check(reg.ok() || reg.status() === 409, `team account registered (${reg.status()})`);
  const p = await team.newPage();
  await p.goto(`${origin}/login`, { waitUntil: 'networkidle' });
  await p.fill('input[type=email]', 'founder@example.test');
  await p.fill('input[type=password]', 'harness-pass-123456');
  await p.locator('form button[type=submit]').click();
  await p.waitForURL(/\/dashboard|\/onboarding/, { timeout: 15000 });
  await p.waitForTimeout(1500);
  const marker = (await team.cookies()).find((c) => c.name === 'bidpilot_staff');
  check(marker && marker.value === '1' && marker.httpOnly && marker.sameSite === 'Lax', `staff marker set on sign-in (${JSON.stringify(marker && { v: marker.value, httpOnly: marker.httpOnly, sameSite: marker.sameSite })})`);

  const before = await views();
  for (const path of ['/', '/pricing', '/guides/emd-exemption', '/dashboard']) {
    await p.goto(`${origin}${path}`, { waitUntil: 'networkidle' });
  }
  await p.waitForTimeout(800);
  check(await views() === before, `signed-in team visits not counted (${before} → ${await views()})`);

  // Sign out via the API (CSRF from the cookie, as the app does), then browse.
  const csrf = (await team.cookies()).find((c) => c.name === 'bidpilot_csrf')?.value;
  const out = await team.request.post(`${origin}/bidpilot/logout`, { headers: { 'X-CSRF-Token': csrf || '' } });
  check(out.ok(), `signed out (${out.status()})`);
  check(!(await team.cookies()).some((c) => c.name === 'bidpilot_session' && c.value), 'session cookie gone');
  check((await team.cookies()).some((c) => c.name === 'bidpilot_staff'), 'staff marker kept after sign-out');
  for (const path of ['/', '/features', '/government-tenders/state/maharashtra']) {
    await p.goto(`${origin}${path}`, { waitUntil: 'networkidle' });
  }
  await p.waitForTimeout(800);
  check(await views() === before, `signed-out team browser not counted (${before} → ${await views()})`);

  // An ordinary visitor in another browser is counted.
  const visitor = await browser.newContext({ userAgent: UA });
  const v = await visitor.newPage();
  for (const path of ['/', '/pricing']) await v.goto(`${origin}${path}`, { waitUntil: 'networkidle' });
  await v.waitForTimeout(800);
  check(await views() === before + 2, `ordinary visitor counted (${before} → ${await views()})`);
  check(!(await visitor.cookies()).some((c) => c.name === 'bidpilot_staff'), 'ordinary visitor has no staff marker');

  await browser.close(); await db.end();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
