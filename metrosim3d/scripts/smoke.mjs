// End-to-end smoke test against a running `vite preview` (default http://localhost:4173).
// Drives the real UI with mouse and multi-touch input, then checks the game state.
// Usage: node scripts/smoke.mjs [url] [screenshotDir]
import { createRequire } from 'node:module';
const { chromium, devices } = createRequire(import.meta.url)('playwright');

const url = process.argv[2] ?? 'http://localhost:4173/';
const shots = process.argv[3] ?? '.';
const fail = (m) => {
  console.error('FAIL:', m);
  process.exitCode = 1;
};
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });

// ---------- Desktop / mouse ----------
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(url);
  await page.waitForFunction(() => window.__game, null, { timeout: 30000 });
  // Fixed seed so the terrain under the test's screen points is the same every run.
  await page.evaluate(() => window.__game.newCity('large', 'New City', 777));
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${shots}/1-start.png` });
  const st = () => page.evaluate(() => {
    const s = window.__game.getState();
    return { pop: s.stats.population, roads: s.stats.roadTiles, zoned: s.stats.zonedRes + s.stats.zonedCom + s.stats.zonedInd, buildings: s.stats.buildings, hint: s.hint, canUndo: s.canUndo, name: s.cityName };
  });
  // Find an on-screen horizontal stretch where the game itself says a road is buildable and the
  // land above and below can be zoned (river, coast and hills are random per seed).
  const run = await page.evaluate(() => {
    const g = window.__game;
    const tile = (x, y) => {
      const p = g.view.pick(x, y);
      return p ? { x: Math.floor(p.x / 8), y: Math.floor(p.z / 8) } : null;
    };
    const roadOk = (a, b) => {
      // Mirror of sim/tools road rules, read through the World API.
      const w = g.world;
      const dx = Math.sign(b.x - a.x), dy = Math.sign(b.y - a.y);
      const pts = [];
      if (Math.abs(b.x - a.x) >= Math.abs(b.y - a.y)) {
        for (let x = a.x; x !== b.x + dx || pts.length === 0; x += dx || 1) { pts.push([x, a.y]); if (!dx) break; }
        for (let y = a.y + dy; dy && y !== b.y + dy; y += dy) pts.push([b.x, y]);
      } else {
        for (let y = a.y; y !== b.y + dy || pts.length === 0; y += dy || 1) { pts.push([a.x, y]); if (!dy) break; }
        for (let x = a.x + dx; dx && x !== b.x + dx; x += dx) pts.push([x, b.y]);
      }
      return pts.every(([x, y]) => {
        if (w.isWater(x, y)) return false;
        const c = w.tileCorners(x, y);
        return Math.max(...c) - Math.min(...c) <= 3;
      });
    };
    for (let y = 380; y <= 560; y += 20) {
      for (let x0 = 250; x0 <= 700; x0 += 25) {
        const x1 = x0 + 320;
        const a = tile(x0, y), b = tile(x1, y), up = tile(x0, y - 40), dn = tile(x1, y + 40);
        if (!a || !b || !up || !dn) continue;
        if (roadOk(a, b) && roadOk(up, tile(x1, y - 40)) && roadOk(tile(x0, y + 40), dn)) return { y, x0, x1 };
      }
    }
    return { y: 0, x0: 0, x1: 0 };
  });
  console.log('land run:', run);
  if (run.x1 - run.x0 < 150) fail('no land under the camera');
  const RY = run.y, RX0 = run.x0 + 10, RX1 = run.x1 - 10;
  await page.getByRole('button', { name: 'Road' }).click();
  await page.mouse.move(RX0, RY);
  await page.mouse.down();
  await page.mouse.move((RX0 + RX1) / 2, RY, { steps: 8 });
  const during = await st();
  await page.mouse.move(RX1, RY, { steps: 8 });
  await page.mouse.up();
  let s = await st();
  console.log('after road drag:', s, 'hint during drag:', during.hint);
  if (s.roads < 5) fail(`road not built (hint: ${JSON.stringify(during.hint)})`);
  // Zone residential above and below the road.
  await page.getByRole('button', { name: 'Homes' }).click();
  await page.mouse.move(RX0, RY - 40);
  await page.mouse.down();
  await page.mouse.move(RX1, RY - 12, { steps: 10 });
  await page.mouse.up();
  await page.getByRole('button', { name: 'Shops' }).click();
  await page.mouse.move(RX0, RY + 12);
  await page.mouse.down();
  await page.mouse.move(RX1, RY + 40, { steps: 6 });
  await page.mouse.up();
  s = await st();
  console.log('after zoning:', s);
  if (s.zoned < 10) fail('zoning failed');
  // Place an office tower.
  await page.getByRole('button', { name: 'Buildings' }).click();
  await page.getByRole('button', { name: /Office tower/ }).click();
  await page.mouse.move((RX0 + RX1) / 2, RY - 90);
  await page.mouse.down();
  await page.mouse.up();
  // Run time fast.
  await page.getByRole('button', { name: 'Fast speed' }).click();
  await page.waitForTimeout(9000);
  s = await st();
  console.log('after growth:', s);
  if (s.buildings < 5) fail('no buildings grew');
  if (s.pop <= 0) fail('population did not grow');
  await page.getByRole('button', { name: 'Pause' }).click();
  await page.screenshot({ path: `${shots}/2-city.png` });
  // Zoom in for a closer screenshot.
  for (let i = 0; i < 4; i++) await page.getByRole('button', { name: 'Zoom in' }).click();
  await page.getByRole('button', { name: 'Tilt down' }).click();
  await page.getByRole('button', { name: 'Tilt down' }).click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${shots}/3-close.png` });
  // Undo restores the previous state.
  const beforeUndo = await st();
  await page.getByRole('button', { name: 'Undo' }).click();
  const afterUndo = await st();
  console.log('undo:', beforeUndo.buildings, '->', afterUndo.buildings);
  // Mode switch keeps the city; Realistic shows funds.
  const cityBefore = await st();
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('group', { name: 'Game mode' }).getByRole('button', { name: 'Realistic' }).click();
  const modeNow = await page.evaluate(() => window.__game.getState().mode);
  if (modeNow !== 'realistic') fail('mode switch did not apply');
  await page.getByRole('group', { name: 'Game mode' }).getByRole('button', { name: 'Creative' }).click();
  const cityAfter = await st();
  if (cityAfter.buildings !== cityBefore.buildings || cityAfter.roads !== cityBefore.roads) fail('mode switch changed the city');
  await page.getByRole('button', { name: 'Close' }).click();
  // Terrain: raise with the mouse, check the ground moved, undo restores it.
  await page.getByRole('button', { name: 'Terrain' }).click();
  await page.getByRole('button', { name: 'Raise' }).click();
  const probe = { x: 640, y: 300 };
  const hBefore = await page.evaluate(({ x, y }) => { const g = window.__game; const p = g.view.pick(x, y); return p ? { h: g.world.heightAt(p.x, p.z), p } : null; }, probe);
  await page.mouse.move(probe.x, probe.y);
  await page.mouse.down();
  await page.waitForTimeout(1500);
  await page.mouse.up();
  const hAfter = await page.evaluate(({ p }) => window.__game.world.heightAt(p.x, p.z), hBefore);
  console.log('terrain raise:', hBefore?.h.toFixed(2), '->', hAfter.toFixed(2));
  if (!hBefore || !(hAfter > hBefore.h + 0.5)) fail('terrain brush did not raise the ground');
  await page.getByRole('button', { name: 'Undo' }).click();
  const hUndo = await page.evaluate(({ p }) => window.__game.world.heightAt(p.x, p.z), hBefore);
  if (Math.abs(hUndo - hBefore.h) > 1e-3) fail('undo did not restore the terrain');
  await page.screenshot({ path: `${shots}/4b-terrain.png` });
  // Save, reload, load.
  await page.getByRole('button', { name: 'Save and load' }).click();
  await page.getByLabel('City name').fill('Smoke Town');
  await page.getByRole('button', { name: 'Save city' }).click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${shots}/4-saves.png` });
  const saved = await st();
  await page.reload();
  await page.waitForFunction(() => window.__game);
  const fresh = await st();
  if (fresh.roads !== 0) fail('fresh page should start empty');
  await page.getByRole('button', { name: 'Save and load' }).click();
  await page.locator('li', { hasText: 'Smoke Town' }).first().getByRole('button', { name: 'Load' }).click();
  await page.waitForTimeout(800);
  const loaded = await st();
  console.log('saved:', saved, 'loaded:', loaded);
  if (loaded.roads !== saved.roads || loaded.buildings !== saved.buildings || loaded.name !== 'Smoke Town') fail('load did not restore the city');
  if (errors.length) fail('console errors: ' + errors.join(' | '));
  await ctx.close();
}

// ---------- iPad / multi-touch ----------
{
  const ctx = await browser.newContext({ ...devices['iPad (gen 7) landscape'] });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(url);
  await page.waitForFunction(() => window.__game, null, { timeout: 30000 });
  await page.evaluate(() => window.__game.newCity('large', 'New City', 777));
  await page.waitForTimeout(1000);
  const cdp = await ctx.newCDPSession(page);
  const touch = (type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map(([x, y], i) => ({ x, y, id: i })) });
  const cam = () => page.evaluate(() => ({ ...window.__game.view.rig.state }));
  // One-finger road drag.
  await page.getByRole('button', { name: 'Road' }).tap();
  await touch('touchStart', [[400, 400]]);
  for (let i = 1; i <= 10; i++) await touch('touchMove', [[400 + i * 25, 400]]);
  await touch('touchEnd', []);
  const roads = await page.evaluate(() => window.__game.getState().stats.roadTiles);
  console.log('touch road tiles:', roads);
  if (roads < 3) fail('one-finger road drag did not build');
  // Two-finger pinch out (zoom in) + twist, must not draw.
  const c0 = await cam();
  await touch('touchStart', [[500, 400], [600, 400]]);
  for (let i = 1; i <= 10; i++) {
    const a = (i / 10) * 0.5;
    const r = 50 + i * 10;
    touch('touchMove', [[550 - Math.cos(a) * r, 400 - Math.sin(a) * r], [550 + Math.cos(a) * r, 400 + Math.sin(a) * r]]);
    await page.waitForTimeout(16);
  }
  await touch('touchEnd', []);
  const c1 = await cam();
  const roads2 = await page.evaluate(() => window.__game.getState().stats.roadTiles);
  console.log('pinch: distance', c0.distance.toFixed(1), '->', c1.distance.toFixed(1), 'yaw', c0.yaw.toFixed(2), '->', c1.yaw.toFixed(2));
  if (!(c1.distance < c0.distance * 0.7)) fail('pinch did not zoom in');
  if (Math.abs(c1.yaw - c0.yaw) < 0.2) fail('twist did not rotate');
  if (roads2 !== roads) fail('two-finger gesture changed the city');
  // One-finger terrain stroke on touch.
  await page.getByRole('button', { name: 'Terrain' }).tap();
  const tp = await page.evaluate(() => { const g = window.__game; const p = g.view.pick(600, 420); return p ? { p, h: g.world.heightAt(p.x, p.z) } : null; });
  await touch('touchStart', [[600, 420]]);
  for (let i = 0; i < 40; i++) { await touch('touchMove', [[600 + (i % 2), 420]]); await page.waitForTimeout(25); }
  await touch('touchEnd', []);
  const th = await page.evaluate(({ p }) => window.__game.world.heightAt(p.x, p.z), tp);
  console.log('touch terrain:', tp.h.toFixed(2), '->', th.toFixed(2));
  if (!(th > tp.h + 0.3)) fail('touch terrain stroke did not raise the ground');
  await page.screenshot({ path: `${shots}/5-ipad.png` });
  if (errors.length) fail('console errors: ' + errors.join(' | '));
  await ctx.close();
}

await browser.close();
console.log(process.exitCode ? 'SMOKE FAILED' : 'SMOKE PASSED');
