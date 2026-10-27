
// ---------- review queue (you are the medical reviewer) and source registry ----------
const QUEUES = [
  ["unreviewed", "Not reviewed yet", q => !reviewedAt(q)],
  ["disagreed", "Claude disagreed with the key", q => typeof prog(q.s).f[q.id] === "string" && prog(q.s).f[q.id].startsWith("Claude disagreed")],
  ["flagged", "Flagged by you", q => prog(q.s).f[q.id] && !String(prog(q.s).f[q.id]).startsWith("Claude disagreed")],
  ["verify", "Marked VERIFY", q => q.verify],
  ["imported", "Imported by you", q => category(q) === "IMPORTED_UNVERIFIED"],
  ["reviewed", "Reviewed by you", q => reviewedAt(q)]
];
const REVIEW_PAGE = 10;
function verificationHTML(q){
  const P = prog(q.s), f = P.f[q.id];
  const rows = [
    ["Category", category(q)],
    ["Origin", q.src==="module" ? `Learning module “${S.modules.find(m=>m.id===q.mod)?.title || q.mod}”` : q.src==="notes" ? "Generated from your uploaded notes" : q.src==="import" ? "Imported by you" : q.src==="ai" ? "Generated in the app by Claude" : "Starter bank"],
    ["Written", q.gen || "–"],
    ["AI cross-check", q.vf ? "A second Claude pass chose the same answer (screening, not medical verification)" : q.verify ? "A second pass disagreed or was unsure" : "Not run"],
    ["Your review", reviewedAt(q) ? new Date(reviewedAt(q)).toLocaleString("en-IN") : "Not reviewed"],
    ["Flag", f ? String(f) : "None"],
    ["Explanation layers", ["w","mm","tb","steps","mn"].filter(k=>q[k]).join(", ") || "Short explanation only"],
    ["Past-paper status", "Not a past-paper question" + (q.pyqClaim ? " (older data carried an unsupported PYQ tag; it is ignored)" : "")]
  ];
  return `<details class="small"><summary>Verification details · ${esc(q.id)}</summary><div class="tscroll"><table>${rows.map(([k,val])=>`<tr><th>${esc(k)}</th><td>${esc(val)}</td></tr>`).join("")}</table></div></details>`;
}
routes.review = (arg) => {
  if (arg === "sources") return reviewSources();
  const v = $("#view");
  const all = questionsWhere(()=>true);
  const counts = Object.fromEntries(QUEUES.map(([k,,fn]) => [k, all.filter(fn).length]));
  S.revq ||= { queue: counts.disagreed ? "disagreed" : "unreviewed", sid: "", page: 0 };
  const Rq = S.revq;
  const fn = QUEUES.find(x=>x[0]===Rq.queue)[2];
  const list = all.filter(q => fn(q) && (!Rq.sid || q.s === Rq.sid)).sort((a,b) => (a.s+a.t+a.st+a.id).localeCompare(b.s+b.t+b.st+b.id));
  const pages = Math.max(1, Math.ceil(list.length / REVIEW_PAGE)); Rq.page = Math.min(Rq.page, pages-1);
  const shown = list.slice(Rq.page*REVIEW_PAGE, (Rq.page+1)*REVIEW_PAGE);
  v.innerHTML = `<header class="stack" style="gap:4px"><span class="eyebrow">You are the reviewer</span><h1>Review queue</h1>
    <span class="muted small">Every question here was written by Claude (AI) or added by you. Check the key and explanation against your textbook, then mark it reviewed or flag it. This page shows answers.</span></header>
  <div class="stats">${QUEUES.slice(0,4).map(([k,l]) => `<div><span class="muted small">${esc(l)}</span><b>${fmt(counts[k])}</b></div>`).join("")}</div>
  <section class="panel stack"><div class="grid g2">
    <label class="f">Queue<select id="rvq">${QUEUES.map(([k,l]) => `<option value="${k}" ${k===Rq.queue?"selected":""}>${esc(l)} (${fmt(counts[k])})</option>`).join("")}</select></label>
    <label class="f">Subject<select id="rvs"><option value="">All subjects</option>${S.tx.map(s=>`<option value="${s.id}" ${s.id===Rq.sid?"selected":""}>${esc(s.name)}</option>`).join("")}</select></label></div>
    <p class="small muted" style="margin:0">Reviewed ${fmt(counts.reviewed)} of ${fmt(all.length)} questions (${pct(counts.reviewed, all.length)}%). <a href="#review-sources">Source registry</a></p></section>
  <div class="stack" id="rvlist">${shown.length ? shown.map((q,k) => `<article class="panel qcard">${qMetaHTML(q)}<div class="stem">${esc(q.q)}</div>${imgHTML(q)}
      <ol class="opts">${q.o.map((o,j)=>`<li><div class="opt ${j===q.a?"right":""}"><span class="k">${"ABCD"[j]}</span><span>${esc(o)}</span></div></li>`).join("")}</ol>
      ${verificationHTML(q)}<div data-rv="${k}"></div></article>`).join("") : `<p class="muted">Nothing in this queue.</p>`}</div>
  ${pages>1?`<div class="row between"><button class="btn" id="rvprev" ${Rq.page?"":"disabled"}>Previous</button><span class="small muted num">Page ${Rq.page+1} / ${pages}</span><button class="btn" id="rvnext" ${Rq.page<pages-1?"":"disabled"}>Next</button></div>`:""}`;
  shown.forEach((q,k) => showExplanation(q, null, $(`[data-rv="${k}"]`), [0,1,2,3]));
  $("#rvq").onchange = e => { Rq.queue = e.target.value; Rq.page = 0; render(); };
  $("#rvs").onchange = e => { Rq.sid = e.target.value; Rq.page = 0; render(); };
  const pv = $("#rvprev"), nx = $("#rvnext");
  if (pv) pv.onclick = () => { Rq.page--; render(); };
  if (nx) nx.onclick = () => { Rq.page++; render(); };
};
function reviewSources(){
  const v = $("#view"); const src = S.evidence?.sources || [];
  v.innerHTML = `<a href="#review" class="small">Review queue</a>
  <header class="stack" style="gap:4px"><h1>Source registry</h1><span class="muted small">Every source the evidence report uses, with what it is, how far to trust it and its reuse terms. Only facts (counts, topic names) were recorded from third-party pages; no questions or explanations were copied.</span></header>
  ${src.length ? src.map(s => `<details class="panel pyqd" id="src-${esc(s.id)}"><summary><span><b>${esc(s.id)}</b> ${esc(s.name)}</span><span class="tag ${s.category==="OFFICIAL_NOTICE"?"ok":/REJECT/i.test(s.confidence+s.notes)?"bad":"verify"}">${esc(SRC_CAT_LABEL[s.category]||s.category)}</span></summary>
    <div class="tscroll" style="margin-top:8px"><table>
      <tr><th>Publisher</th><td>${esc(s.publisher||"–")}</td></tr>
      <tr><th>Exam / session</th><td>${esc(s.exam||"–")} ${esc(s.session||"")}</td></tr>
      <tr><th>Published</th><td>${esc(s.published||"unknown")}</td></tr>
      <tr><th>Confidence</th><td>${esc(s.confidence||"–")}</td></tr>
      <tr><th>Licence / reuse</th><td>${esc(s.licence||"not stated")}</td></tr>
      <tr><th>Notes</th><td>${esc(s.notes||"")}</td></tr>
      <tr><th>Link</th><td>${s.url?`<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.url.replace(/^https?:\/\//,"").slice(0,70))}</a>`:"–"}</td></tr></table></div></details>`).join("")
    : `<p class="note warn">The evidence file didn't load.</p>`}
  <section class="panel stack"><h2>Adding your own sources</h2>
    <p class="small" style="margin:0">To bring in recall books, notes or question files you're entitled to use, run <code>pipeline/ingest.py</code> on a computer with a rights statement. It extracts questions into a review file, never guesses missing answers, marks near-duplicates and image references, and never counts anything as exam evidence until you've reviewed it. To add questions straight into this app, use “Add your own questions” in More: they're labelled IMPORTED · UNVERIFIED.</p></section>`;
}
