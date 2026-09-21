// Milestone 5b — same-origin static serving + SPA fallback in server.js.
// -----------------------------------------------------------------------------
// Exercises the REAL, fully-wired app (server.js's own `export { app }`),
// not a reconstructed copy — the whole point is to prove the actual route
// ordering (static -> SPA fallback -> /bidpilot exclusion -> JSON 404) works
// as deployed. This exists specifically because Express 5 (path-to-regexp 8)
// silently rejects the Express-4-era `app.get('*', ...)` catch-all pattern —
// verified against the actual installed version (5.2.1 / path-to-regexp
// 8.4.2) before writing server.js's fallback, not assumed. See
// BIDPILOT_ARCHITECTURE.md's Milestone 5b entry.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { app } from '../server.js';

const FRONTEND_DIST_INDEX = fileURLToPath(new URL('../../frontend/dist/index.html', import.meta.url));
const SKIP_REASON = fs.existsSync(FRONTEND_DIST_INDEX)
  ? false
  : 'frontend/dist is not built — run `npm run build` first (see backend/package.json)';

test('same-origin static serving + SPA fallback (server.js)', { skip: SKIP_REASON }, async (t) => {
  let server;
  let baseUrl;

  t.before(async () => {
    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  function req(path) {
    return new Promise((resolve, reject) => {
      http.get(`${baseUrl}${path}`, (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve({
          status: res.statusCode,
          contentType: res.headers['content-type'] || '',
          body: Buffer.concat(chunks).toString('utf8'),
          headers: res.headers,
        }));
      }).on('error', reject);
    });
  }

  const indexHtml = fs.readFileSync(FRONTEND_DIST_INDEX, 'utf8');

  await t.test('a frontend route (no file extension) serves the SPA index.html', async () => {
    const res = await req('/dashboard');
    assert.equal(res.status, 200);
    assert.match(res.contentType, /text\/html/);
    assert.equal(res.body, indexHtml);
  });

  await t.test('a nested frontend route also serves the SPA (client-side routing)', async () => {
    const res = await req('/tenders/some-id');
    assert.equal(res.status, 200);
    assert.match(res.contentType, /text\/html/);
  });

  await t.test('an unmatched /bidpilot/* path is NEVER served the SPA — falls through to the API 404/503', async () => {
    const res = await req('/bidpilot/this-route-does-not-exist');
    assert.notEqual(res.status, 200);
    assert.doesNotMatch(res.contentType, /text\/html/, 'must not silently return HTML for a bad API path');
    assert.doesNotMatch(res.body, /<div id="root">/, 'must not be the SPA shell');
  });

  await t.test('/health is unaffected by the SPA fallback', async () => {
    const res = await req('/health');
    assert.equal(res.status, 200);
    assert.deepEqual(JSON.parse(res.body), { ok: true });
  });

  await t.test('/privacy is unaffected by the SPA fallback', async () => {
    const res = await req('/privacy');
    assert.equal(res.status, 200);
    assert.match(res.contentType, /text\/html/);
    assert.match(res.body, /Privacy Policy/);
  });

  await t.test('a missing hashed asset (has a file extension) 404s honestly instead of returning the SPA shell', async () => {
    const res = await req('/assets/definitely-not-a-real-bundle-hash.js');
    assert.equal(res.status, 404);
    assert.doesNotMatch(res.body, /<div id="root">/);
  });

  await t.test('a real built asset is served by express.static with its own content type', async () => {
    const assetsMatch = indexHtml.match(/src="(\/assets\/[^"]+\.js)"/);
    assert.ok(assetsMatch, 'expected the built index.html to reference a hashed JS bundle');
    const res = await req(assetsMatch[1]);
    assert.equal(res.status, 200);
    assert.match(res.contentType, /javascript/);
  });

  await t.test('the CSP header is present and strict on an HTML response', async () => {
    const res = await req('/dashboard');
    const csp = res.headers['content-security-policy'];
    assert.ok(csp, 'expected a Content-Security-Policy header');
    assert.match(csp, /default-src 'self'/);
    assert.doesNotMatch(csp, /unsafe-inline/, 'no unsafe-inline — the frontend uses plain CSS classes, not inline styles');
  });
});
