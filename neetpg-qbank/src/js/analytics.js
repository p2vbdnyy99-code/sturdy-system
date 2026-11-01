
// ---------- attempt log, adaptive spaced review, analytics ----------
// Schema v2 is additive: progress docs (p-<sid>) keep r/b/x/f/v unchanged and gain sr; every answer is also
// appended to monthly attempt docs att-<yyyymm>-<k>. Nothing from v1 is rewritten or deleted.
const SR_DAYS = [1, 3, 7, 21, 60];          // expanding intervals, same as pipeline/registry/priorities.json
const ERR_TYPES = [
  ["knowledge","Didn't know it"], ["misread","Misread the question"], ["confused","Confused it with something similar"],
  ["recall","Knew it, couldn't recall"], ["time","Rushed / out of time"], ["reasoning","Reasoning slip"], ["guess","Pure guess"]
];
const ERR_LABEL = Object.fromEntries(ERR_TYPES);
const ATT_MAX = 2000;                        // entries per doc, about 180 KB, under the 256 KiB doc limit
S.att = { cur: null, pending: [], all: null, timer: null };

const monthKey = (t=Date.now()) => { const d = new Date(t); return d.getFullYear() + String(d.getMonth()+1).padStart(2,"0"); };
async function lastChunk(ym){
  let k = 0, last = { ym, k: 0, items: [] };
  for (;;){ const d = await Store.getDoc(`att-${ym}-${k}`); if (!d) break; last = { ym, k, items: d.items || [] }; k++; }
  return last;
}
async function loadAttempts(){
  const cur = await lastChunk(monthKey());
  cur.items.push(...S.att.pending.filter(a => monthKey(a.t) === cur.ym)); // answers given while the log was loading
  S.att.cur = cur; S.att.pending = [];
  if (S.att.all) S.att.all = null;
}
function schedule(q, ok, guess){
  const P = prog(q.s); P.sr ||= {};
  const had = P.sr[q.id]?.[0];
  const stage = !ok ? 0 : guess ? Math.min(had ?? 0, 1) : had == null ? 2 : Math.min(had + 1, SR_DAYS.length - 1);
  P.sr[q.id] = [stage, Date.now() + SR_DAYS[stage]*DAY];
}
function logAttempt(q, pick, ok, meta){
  const a = { q: q.id, s: q.s, p: pick, ok: ok?1:0, t: Date.now(), m: meta.mode === "test" ? "t" : "p" };
  if (meta.ms) a.ms = Math.round(meta.ms);
  if (meta.guess) a.g = 1;
  if (meta.marked) a.mk = 1;
  if (S.att.all) S.att.all.push(a);
  if (!S.att.cur){ S.att.pending.push(a); return; }
  pushAttempt(a);
}
function pushAttempt(a){
  const c = S.att.cur;
  if (c.ym !== monthKey(a.t)){ flushAttempts(); S.att.cur = { ym: monthKey(a.t), k: 0, items: [] }; }
  else if (c.items.length >= ATT_MAX){ flushAttempts(); S.att.cur = { ym: c.ym, k: c.k + 1, items: [] }; }
  S.att.cur.items.push(a);
  clearTimeout(S.att.timer); S.att.timer = setTimeout(flushAttempts, 1200);
}
function flushAttempts(){
  clearTimeout(S.att.timer);
  const c = S.att.cur; if (!c) return;
  const data = { v: 2, items: c.items.slice() };
  Store.chain = Store.chain.then(() => Store.setDoc(`att-${c.ym}-${c.k}`, data)).catch(e => {
    if (e && e.code === "quota_exceeded") toast("Storage is full. Export a backup from More.");
  });
}
window.addEventListener("pagehide", flushAttempts);
async function loadAllAttempts(months=12){
  if (S.att.all) return S.att.all;
  const now = new Date(); const yms = [];
  for (let i = months-1; i >= 0; i--) yms.push(monthKey(new Date(now.getFullYear(), now.getMonth()-i, 1)));
  const out = [];
  for (const ym of yms){ for (let k=0;;k++){ const d = await Store.getDoc(`att-${ym}-${k}`); if (!d) break; out.push(...(d.items||[])); } }
  // answers not yet written still live in memory
  const seen = new Set(out.map(a => a.q + a.t));
  for (const a of [...(S.att.cur?.items||[]), ...S.att.pending]) if (!seen.has(a.q + a.t)) out.push(a);
  return (S.att.all = out.sort((x,y) => x.t - y.t));
}
// the most recent attempt at a question, from memory (current month)
function lastAttempt(qid){
  const pools = [S.att.cur?.items || [], S.att.pending, S.att.all || []];
  let best = null;
  for (const pool of pools) for (let i = pool.length-1; i >= 0; i--) if (pool[i].q === qid){ if (!best || pool[i].t > best.t) best = pool[i]; break; }
  return best;
}
function errorPickerHTML(q){
  const a = lastAttempt(q.id); if (!a || a.ok) return "";
  return `<div class="errpick" data-errpick><span class="eyebrow">Why did you miss it? (goes into your error log)</span>
    <div class="row">${ERR_TYPES.map(([k,l]) => `<button class="chip" data-err="${k}" aria-pressed="${a.e===k}">${esc(l)}</button>`).join("")}</div></div>`;
}
function bindErrorPicker(q, el){
  $$("[data-err]", el).forEach(b => b.onclick = () => {
    const a = lastAttempt(q.id); if (!a) return;
    a.e = a.e === b.dataset.err ? undefined : b.dataset.err;
    // the same object may sit in the month chunk and in the loaded history; rewrite the chunk that holds it
    if (S.att.cur?.items.includes(a)) flushAttempts(); else rewriteAttempt(a);
    $$("[data-err]", el).forEach(x => x.setAttribute("aria-pressed", String(x.dataset.err === a.e)));
  });
}
async function rewriteAttempt(a){
  const ym = monthKey(a.t);
  for (let k=0;;k++){
    const name = `att-${ym}-${k}`; const d = await Store.getDoc(name); if (!d) return;
    const hit = (d.items||[]).find(x => x.q === a.q && x.t === a.t);
    if (hit){ hit.e = a.e; if (!a.e) delete hit.e; await Store.setDoc(name, d).catch(()=>{}); return; }
  }
}
// merge attempts from a backup file, skipping ones already stored
async function appendAttempts(list){
  const have = new Set((await loadAllAttempts(36)).map(a => a.q + a.t));
  const fresh = list.filter(a => a && a.q && a.t && !have.has(a.q + a.t)).sort((x,y) => x.t - y.t);
  const curYm = S.att.cur?.ym;
  const byYm = {}; fresh.forEach(a => (byYm[monthKey(a.t)] ||= []).push(a));
  for (const ym in byYm){
    if (ym === curYm){ byYm[ym].forEach(pushAttempt); flushAttempts(); continue; }
    let c = await lastChunk(ym);
    for (const a of byYm[ym]){
      if (c.items.length >= ATT_MAX){ await Store.setDoc(`att-${ym}-${c.k}`, { v:2, items:c.items }); c = { ym, k: c.k+1, items: [] }; }
      c.items.push(a);
    }
    await Store.setDoc(`att-${ym}-${c.k}`, { v:2, items:c.items });
  }
  S.att.all = null;
  return fresh.length;
}

// ---------- analytics page ----------
const median = xs => { if (!xs.length) return null; const s = xs.slice().sort((a,b)=>a-b); const m = s.length>>1; return s.length%2 ? s[m] : (s[m-1]+s[m])/2; };
const secs = ms => ms == null ? "–" : ms < 60e3 ? `${Math.round(ms/1000)} s` : `${(ms/60e3).toFixed(1)} min`;
function accRow(label, list, note=""){
  const n = list.length, c = list.filter(a=>a.ok).length, t = median(list.filter(a=>a.ms).map(a=>a.ms));
  return `<tr><td>${label}${note?`<span class="small muted"> ${note}</span>`:""}</td><td class="n">${fmt(n)}</td><td class="n">${n?pct(c,n)+"%":"–"}</td><td class="n">${secs(t)}</td></tr>`;
}
const SMALL_N = 30;
routes.analytics = async () => {
  const v = $("#view");
  v.innerHTML = `<header class="stack" style="gap:4px"><span class="eyebrow">Progress</span><h1>Analytics</h1><span class="muted small">From your attempt log. The log started with this version of the app; answers from before it count in Progress but have no timing or error type.</span></header><p class="muted">Loading your attempt log…</p>`;
  const all = await loadAllAttempts(12);
  if (!location.hash.startsWith("#analytics")) return;
  const days = 30, since = Date.now() - days*DAY;
  const recent = all.filter(a => a.t >= since);
  const wrong = all.filter(a => !a.ok);
  const errCount = {}; wrong.forEach(a => errCount[a.e || "_"] = (errCount[a.e || "_"]||0) + 1);
  const classified = wrong.length - (errCount._ || 0);
  const smallNote = n => n < SMALL_N ? `<p class="note warn small" style="margin:0">Only ${n} answers so far: differences below can be chance. Treat them as a hint until you have at least ${SMALL_N}.</p>` : "";
  // per-day counts for the last 14 days
  const dayRows = []; for (let i=13;i>=0;i--){ const d0 = dayStart(Date.now()) - i*DAY; const list = all.filter(a => a.t >= d0 && a.t < d0+DAY); dayRows.push({ d0, n: list.length, c: list.filter(a=>a.ok).length }); }
  const maxDay = Math.max(1, ...dayRows.map(d=>d.n));
  const tests = S.hist.slice(-15);
  v.innerHTML = `<header class="stack" style="gap:4px"><span class="eyebrow">Progress</span><h1>Analytics</h1><span class="muted small">From your attempt log (${fmt(all.length)} answers in the last 12 months). The log started with this version of the app; earlier answers count in Progress but have no timing or error type.</span></header>
  ${all.length ? "" : `<section class="panel"><p class="muted" style="margin:0">No answers logged yet. Practise a few questions or take a test, and this page fills in.</p></section>`}
  ${all.length ? `<section class="panel stack"><h2>Timed vs untimed</h2>${smallNote(all.length)}
    <div class="tscroll"><table><tr><th>Mode</th><th class="n">Answers</th><th class="n">Accuracy</th><th class="n">Median time</th></tr>
    ${accRow("Practice (untimed)", all.filter(a=>a.m==="p"))}${accRow("Tests (timed)", all.filter(a=>a.m==="t"), "time includes revisits")}${accRow("Last 30 days", recent)}</table></div>
    <p class="small muted" style="margin:0">NEET-PG gives about 70 seconds per question (42 minutes for 36).</p></section>
  <section class="panel stack"><h2>Confidence vs accuracy</h2>
    <div class="tscroll"><table><tr><th>When you said</th><th class="n">Answers</th><th class="n">Accuracy</th><th class="n">Median time</th></tr>
    ${accRow("Sure (didn't tick “I'm guessing”)", all.filter(a=>a.m==="p"&&!a.g))}${accRow("Guessing", all.filter(a=>a.m==="p"&&a.g))}${accRow("Test: marked for review", all.filter(a=>a.m==="t"&&a.mk))}${accRow("Test: not marked", all.filter(a=>a.m==="t"&&!a.mk))}</table></div>
    <p class="small muted" style="margin:0">If your guesses are right much more than 25% of the time, you know more than you think: in NEET-PG, eliminating two options makes a guess worth taking (+4 / −1).</p></section>
  <section class="panel stack"><h2>Why you miss questions</h2>
    ${wrong.length ? `<p class="small muted" style="margin:0">${fmt(wrong.length)} wrong answers, ${fmt(classified)} classified by you. Classify a miss from the explanation after you answer.</p>
    <div class="tscroll"><table><tr><th>Reason</th><th class="n">Count</th><th style="width:40%">Share of classified</th></tr>
    ${ERR_TYPES.map(([k,l]) => `<tr><td>${esc(l)}</td><td class="n">${errCount[k]||0}</td><td><div class="bar"><i style="width:${pct(errCount[k]||0, classified)}%"></i></div></td></tr>`).join("")}
    <tr><td class="muted">Not classified</td><td class="n">${errCount._||0}</td><td></td></tr></table></div>
    <div class="row"><button class="btn" id="errrev" ${classified?"":"disabled"}>Practise my classified misses</button></div>` : `<p class="muted" style="margin:0">No wrong answers logged yet.</p>`}</section>
  <section class="panel stack"><h2>Last 14 days</h2>
    <div class="tscroll"><table><tr><th>Day</th><th class="n">Answers</th><th class="n">Accuracy</th><th style="width:40%"></th></tr>
    ${dayRows.map(d => `<tr><td class="small">${new Date(d.d0).toLocaleDateString("en-IN",{weekday:"short",day:"numeric",month:"short"})}</td><td class="n">${d.n}</td><td class="n">${d.n?pct(d.c,d.n)+"%":"–"}</td><td><div class="bar"><i style="width:${pct(d.n,maxDay)}%"></i></div></td></tr>`).join("")}</table></div></section>` : ""}
  <section class="panel stack"><h2>Test score trend</h2>
    ${tests.length ? `<div class="tscroll"><table><tr><th>Date</th><th>Test</th><th class="n">Score</th><th class="n">%</th><th style="width:30%"></th></tr>
    ${tests.map(h => `<tr><td class="small">${new Date(h.at).toLocaleDateString("en-IN",{day:"numeric",month:"short"})}</td><td>${esc(h.title)}</td><td class="n">${h.score}/${h.max}</td><td class="n">${h.max?Math.round(100*h.score/h.max):0}%</td><td><div class="bar"><i style="width:${h.max?Math.max(0,Math.round(100*h.score/h.max)):0}%"></i></div></td></tr>`).join("")}</table></div>
    <p class="small muted" style="margin:0">Scores from different tests aren't directly comparable: mixes of subjects and difficulty differ, and these are AI-written practice questions, not past papers.</p>`
    : `<p class="muted" style="margin:0">No tests taken yet.</p>`}</section>`;
  const er = $("#errrev");
  if (er) er.onclick = () => {
    const ids = [...new Set(wrong.filter(a=>a.e).map(a=>a.q))];
    const qs = ids.map(id => S.Q.get(id)).filter(q => q && visible(q));
    if (!qs.length) return toast("Those questions are no longer in your bank.");
    startSession("Error log", shuffle(qs));
  };
};

// ---------- adaptive planner: days behind, re-plan, week ahead ----------
function dayCounts(all){
  const m = {};
  all.forEach(a => { const d = dayStart(a.t); m[d] = (m[d]||0) + 1; });
  // before the log existed, fall back to last-answer timestamps
  for (const sid in S.prog) for (const k in S.prog[sid].r){ const d = dayStart(S.prog[sid].r[k][2]); if (!all.length || d < dayStart(all[0].t)) m[d] = (m[d]||0) + 1; }
  return m;
}
const planRouteBase = routes.plan;
routes.plan = () => {
  planRouteBase();
  const P = S.plan; if (!P?.blocks) return;
  const host = document.createElement("div"); host.className = "stack"; host.id = "planx";
  $("#view").append(host);
  const t = planToday(); const target = t?.target || 50;
  const week = []; for (let i=0;i<7;i++){ const at = Date.now() + i*DAY; const d = planToday(at); if (d) week.push({ at, ...d }); }
  const due = questionsWhere(isDue).length;
  host.innerHTML = `<section class="panel stack"><h2>Next 7 days</h2>
    <div class="tscroll"><table><tr><th>Day</th><th>Subject</th><th>Focus</th><th>Test</th></tr>
    ${week.map(d => `<tr class="${dayStart(d.at)===dayStart(Date.now())?"now":""}"><td class="small">${new Date(d.at).toLocaleDateString("en-IN",{weekday:"short",day:"numeric",month:"short"})}</td><td>${esc(S.subj[d.sid]?.name||"")}</td><td class="small">${esc(d.focus||d.phase)}</td><td class="small">${esc(d.test||"")}</td></tr>`).join("")}</table></div></section>
  <section class="panel stack" id="behind"><h2>Staying on track</h2><p class="muted small" style="margin:0">Checking your last two weeks…</p></section>
  <section class="panel stack"><h2>Reviews due</h2><p class="small" style="margin:0">${fmt(due)} questions are due for spaced review today.</p>
    <div class="row"><button class="btn" id="dueGo" ${due?"":"disabled"}>Start due reviews</button><a class="btn ghost" href="#analytics">Open analytics and error log</a></div></section>`;
  $("#dueGo").onclick = () => startSession("Due reviews", shuffle(questionsWhere(isDue)).slice(0, 100));
  loadAllAttempts(2).then(all => {
    const box = $("#behind"); if (!box || !location.hash.startsWith("#plan")) return;
    const counts = dayCounts(all);
    const from = Math.max(dayStart(P.created || P.start), dayStart(Date.now()) - 14*DAY);
    const missed = []; for (let d = from; d < dayStart(Date.now()); d += DAY) if ((counts[d]||0) < target/2) missed.push(d);
    const doneToday = counts[dayStart(Date.now())] || 0;
    box.innerHTML = `<h2>Staying on track</h2>
      <p class="small" style="margin:0">Today: ${fmt(doneToday)} of about ${target} questions.</p>
      ${missed.length ? `<p class="note warn small" style="margin:0">In the last ${Math.round((dayStart(Date.now())-from)/DAY)} days, ${missed.length} had fewer than half the day's target (${missed.slice(-5).map(d=>new Date(d).toLocaleDateString("en-IN",{day:"numeric",month:"short"})).join(", ")}${missed.length>5?", …":""}). Re-planning spreads the remaining subjects over the days you have left, keeping the same exam date, hours and weak subjects.</p>
        <div class="row"><button class="btn primary" id="replan">Re-plan from today</button></div>`
      : `<p class="note good small" style="margin:0">No days behind in this period.</p>`}
      ${P.replans?.length ? `<p class="small muted" style="margin:0">Re-planned ${P.replans.length} time${P.replans.length>1?"s":""}, last on ${new Date(P.replans.at(-1)).toLocaleDateString("en-IN")}.</p>` : ""}`;
    const rp = $("#replan");
    if (rp) rp.onclick = async () => {
      if (P.exam - Date.now() < 14*DAY) return toast("Less than 2 weeks left: stay on the final-tests phase instead of re-planning.");
      const next = buildPlan({ exam: P.exam, hours: P.hours, weak: P.weak });
      next.replans = [...(P.replans||[]), Date.now()];
      S.plan = next; await Store.setDoc("plan", S.plan).catch(()=>{});
      toast("Re-planned from today."); render();
    };
  });
};
