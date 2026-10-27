// End-to-end and data-integrity checks for the NEET PG QBank page.
// Run from neetpg-qbank/:  python3 build.py && node tests/e2e.mjs
// Needs Playwright with Chromium (preinstalled in Claude Code cloud sessions).
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

let failed = 0;
const check = (ok, name, detail = "") => { console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  (" + detail + ")" : ""}`); if (!ok) failed++; };

// ---- data checks (no browser) ----
const read = f => JSON.parse(fs.readFileSync(path.join(root, "data", f), "utf8"));
const tax = read("taxonomy.json"), man = read("manifest.json"), pyq = read("pyq.json");
const subs = new Set(tax.flatMap(s => s.topics.flatMap(t => t.subs.map(st => `${s.id}|${t.name}|${st}`))));
const qs = man.files.flatMap(f => read(f.file).map((q, i) => ({ ...q, id: `${f.key}-${i}` })));
check(qs.length === 156, "156 starter questions", String(qs.length));
check(qs.every(q => subs.has(`${q.s}|${q.t}|${q.st}`)), "every question maps to a subtopic");
check(qs.every(q => q.o.length === 4 && q.a >= 0 && q.a < 4), "every question has 4 options and a valid key");
check(man.files.every(f => f.gen && /Claude/.test(f.gen)), "seed files declare AI generation");
const hot = Object.entries(pyq.subjects).flatMap(([sid, s]) => s.hot.map(h => ({ sid, ...h })));
check(hot.every(h => subs.has(`${h.sid}|${h.t}|${h.st}`)), "every priority topic maps to a subtopic");
check(hot.every(h => Array.isArray(h.src)), "every priority topic has a source list (empty = unattributed)");
const known = new Set(pyq.meta.sources.map(s => s.id));
check(hot.every(h => h.src.every(x => known.has(x))), "every cited source id exists in the source list");
check(qs.filter(q => q.img).every(q => q.media && q.media.license && q.media.url), "every image has a licence record");

// ---- browser checks ----
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const page = `<!doctype html><html><head><meta charset=utf8><meta name=viewport content="width=device-width,initial-scale=1"></head><body>${html}</body></html>`;
const server = http.createServer((req, res) => {
  if (req.url.startsWith("/index.html") || req.url === "/") { res.writeHead(200, { "content-type": "text/html" }); res.end(page); }
  else { res.writeHead(404); res.end(); }
});
await new Promise(r => server.listen(0, r));
const U = `http://localhost:${server.address().port}/index.html`;
const browser = await chromium.launch();
const p = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = []; let fetched = 0;
p.on("pageerror", e => errors.push(e.message));
await p.route(/\/(data|img)\//, r => { fetched++; r.abort(); });   // the iOS viewer blocks sibling files
try {
  await p.goto(U + "#home"); await p.waitForTimeout(1200);
  const stats = (await p.textContent(".stats")).replace(/\s+/g, " ");
  check(/Questions\s*156/.test(stats), "page loads 156 questions with sibling files blocked", stats.trim());
  check(fetched === 0, "page makes no sibling-file requests", String(fetched));

  await p.goto(U + "#t-pa-1-1"); await p.waitForTimeout(300);
  await p.click("[data-f=all]"); await p.waitForTimeout(200);
  const meta = await p.textContent(".qmeta");
  check(/AI-GENERATED/.test(meta) && /UNREVIEWED/.test(meta), "question shows AI-GENERATED and UNREVIEWED", meta.replace(/\s+/g, " ").trim());
  await p.locator(".opt").first().click(); await p.waitForTimeout(300);
  const body = await p.textContent("#view");
  check(!/PYQ CONCEPT|2-PASS/.test(body), "no unsupported PYQ or verification labels on the question");
  check(/SUGGESTED REFERENCE · NOT VERIFIED/.test(body), "reference is labelled as an unverified suggestion");
  await p.click("[data-act=review]"); await p.waitForTimeout(200);
  check(/REVIEWED BY YOU/.test(await p.textContent(".qmeta")), "marking reviewed updates the badge");

  await p.goto(U + "#test"); await p.waitForTimeout(300);
  await p.check("#trev"); await p.click("#custom"); await p.waitForTimeout(300);
  check((await p.evaluate(() => location.hash)) === "#practice" && /1 \/ 1/.test(await p.textContent("#view")), "'Reviewed by me only' filter finds exactly the reviewed question");

  await p.goto(U + "#pyq"); await p.waitForTimeout(300);
  const pyqText = await p.textContent("#view");
  check(!/Repeatedly tested/.test(pyqText), "PYQ page makes no 'repeatedly tested' claim");
  const items = await p.locator("ul.hot li").count();
  const unattr = await p.locator("ul.hot li .tag", { hasText: "UNATTRIBUTED" }).count();
  check(items === hot.length && unattr === hot.filter(h => !h.src.length).length, "every topic shows its source or UNATTRIBUTED", `${items} topics, ${unattr} unattributed`);

  await p.goto(U + "#plan"); await p.waitForTimeout(200);
  check((await p.inputValue("#phours")) === "3.5", "planner defaults to 3.5 h/day");

  await p.goto(U + "#t-ra-3-0"); await p.waitForTimeout(300); await p.click("[data-f=all]"); await p.waitForTimeout(200);
  for (let i = 0; i < 4 && !(await p.$(".qimg")); i++) { await p.click("#next"); await p.waitForTimeout(150); }
  const credit = await p.textContent(".credit").catch(() => "");
  check(/CC0|CC BY|Public domain/.test(credit) && /not an exam image/.test(credit), "image shows licence and 'not an exam image'", credit.slice(0, 80));

  check(errors.length === 0, "no page errors", errors.join(" | "));
} finally {
  await browser.close(); server.close();
}
console.log(failed ? `\n${failed} check(s) failed` : "\nAll checks passed");
process.exit(failed ? 1 : 0);
