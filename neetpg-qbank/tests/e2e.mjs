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

// learning modules and evidence
const mods = read("modules.json").modules, ev = read("evidence.json");
const prio = JSON.parse(fs.readFileSync(path.join(root, "pipeline/registry/priorities.json"), "utf8"));
const modQs = mods.flatMap(m => m.mcqs.map(q => ({ ...q, s: m.s, t: m.t, st: m.st })));
const TOTAL = qs.length + modQs.length;
check(mods.every(m => subs.has(`${m.s}|${m.t}|${m.st}`)), "every module maps to a subtopic");
check(modQs.every(q => q.o.length === 4 && q.a >= 0 && q.a < 4 && q.w?.length === 4), "every module question has 4 options, a key and 4 option reasons");
const evC = new Map(ev.concepts.map(c => [c.id, c]));
check(mods.every(m => m.why.concepts.every(c => evC.has(c))), "every module cites concepts that exist in the evidence");
check(mods.filter(m => m.why.category === "B").every(m => m.why.concepts.some(c => evC.get(c).distinct_sessions >= 2)), "category B modules really recur in 2+ sessions");
const aIds = new Set(prio.A.map(a => a.id));
check(mods.filter(m => m.why.category === "A").every(m => m.why.groups?.length && m.why.groups.every(g => aIds.has(g))), "category A modules name an existing A group");
check(mods.filter(m => m.why.category === "OBSERVED_ONCE").every(m => m.why.concepts.every(c => evC.get(c).distinct_sessions === 1)), "'reported once' modules really have one session");
check(!ev.trend.run, "evidence makes no trend claim");

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
  check(new RegExp(`Questions\\s*${TOTAL}`).test(stats), `page loads ${TOTAL} questions (156 starter + ${modQs.length} module) with sibling files blocked`, stats.trim());
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

  // modules
  await p.goto(U + "#modules"); await p.waitForTimeout(300);
  check((await p.locator(".modcard").count()) === mods.length, "modules page lists every module", String(await p.locator(".modcard").count()));
  const cm = mods.find(m => m.id === "courvoisier");
  await p.goto(U + "#m-courvoisier"); await p.waitForTimeout(300);
  check((await p.locator(".fstep").count()) === cm.flow.steps.length && (await p.locator(".fopt").count()) === cm.flow.steps.reduce((n, s) => n + (s.d?.length || 0), 0), "flowchart renders every step and branch");
  const mtext = await p.textContent("#view");
  check(/SUGGESTED · NOT VERIFIED/.test(mtext) && /AI-WRITTEN · UNREVIEWED/.test(mtext) && /B · Recurred/.test(mtext), "module shows its evidence category and unverified labels");
  await p.click("#mdone"); await p.waitForTimeout(200);
  check(/next revision/.test(await p.textContent("#view")), "marking a module studied schedules the next revision");

  // practice a module question: guess toggle, timing, wrong answer, miss classification, spaced review
  await p.click("#mq"); await p.waitForTimeout(300);
  check(/AI-GENERATED/.test(await p.textContent(".qmeta")), "module question is labelled AI-GENERATED");
  await p.check("#guess"); await p.waitForTimeout(150);
  const qid = await p.evaluate(() => S.sess.ids[S.sess.i]);
  const wrongBtn = p.locator(`.opt:not([data-oi="0"])`).first();
  await wrongBtn.click(); await p.waitForTimeout(300);
  check(await p.$("[data-errpick]") !== null, "a wrong answer offers the miss classification");
  await p.click('[data-err="confused"]'); await p.waitForTimeout(200);
  check((await p.getAttribute('[data-err="confused"]', "aria-pressed")) === "true", "choosing a reason marks it");
  const sr = await p.evaluate(id => { const q = S.Q.get(id); return prog(q.s).sr[id]; }, qid);
  check(sr && sr[0] === 0 && Math.abs(sr[1] - Date.now() - 864e5) < 60e3, "wrong answer is scheduled for review in 1 day", JSON.stringify(sr));
  await p.waitForTimeout(1500);   // attempt log flush

  await p.reload(); await p.waitForTimeout(1200);
  await p.goto(U + "#analytics"); await p.waitForTimeout(800);
  const an = (await p.textContent("#view")).replace(/\s+/g, " ");
  check(/Confused it with something similar\s*1(?!\d)/.test(an) && /Guessing\s*1\s*0%/.test(an), "analytics reads the saved log after reload (error type and guess)", an.slice(an.indexOf("Guessing"), an.indexOf("Guessing") + 40));

  // evidence and review
  await p.goto(U + "#evidence"); await p.waitForTimeout(300);
  const et = await p.textContent("#view");
  check(/Not run\./.test(et) && /RECONSTRUCTED FROM MEMORY/.test(et) && /RECOMMENDATION/.test(et) && /HYPOTHESIS/.test(et), "evidence page separates the kinds of statement and shows no trend");
  check(!/most repeated topics over 10 years[^,]/i.test(et.replace("no basis for \"most repeated topics over 10 years\"", "")), "evidence page makes no 10-year repeat claim");
  await p.goto(U + "#review"); await p.waitForTimeout(300);
  check((await p.locator("#rvlist .qcard").count()) > 0 && /Verification details/.test(await p.textContent("#rvlist")), "review queue lists questions with verification details");
  await p.goto(U + "#review-sources"); await p.waitForTimeout(300);
  check((await p.locator("details.panel").count()) === ev.sources.length, "source registry lists every source", String(await p.locator("details.panel").count()));

  // adaptive planner
  await p.goto(U + "#plan"); await p.waitForTimeout(200);
  const d = new Date(Date.now() + 200 * 864e5).toISOString().slice(0, 10);
  await p.fill("#pexam", d); await p.click("#pmake"); await p.waitForTimeout(600);
  const pt = await p.textContent("#view");
  check((await p.locator("#planx table tr").count()) === 8 && /Staying on track/.test(pt) && /1, 3, 7, 21 and 60 days/.test(pt), "plan shows next 7 days, catch-up status and the review schedule");

  check(errors.length === 0, "no page errors", errors.join(" | "));
} finally {
  await browser.close(); server.close();
}
console.log(failed ? `\n${failed} check(s) failed` : "\nAll checks passed");
process.exit(failed ? 1 : 0);
