
// ---------- evidence report (data/evidence.json, built by pipeline/analyze.py) ----------
// Every block carries the kind of statement it is, so official facts, reconstructions from memory,
// estimates, recommendations and hypotheses are never mixed.
const KIND = {
  verified: ["VERIFIED", "ok", "Stated in an official notice (NBEMS or a court/news report quoting officials)."],
  reconstructed: ["RECONSTRUCTED FROM MEMORY", "verify", "Third-party recall of what candidates remembered. Not an official paper; wording, year and counts can be wrong."],
  estimate: ["ESTIMATE", "hy", "A number from a coaching site or survey, or computed from one. Approximate, often single-source."],
  recommendation: ["RECOMMENDATION", "ai", "Educational advice written by Claude (AI). Not derived from exam counts."],
  hypothesis: ["HYPOTHESIS", "", "A reasoned guess that the data cannot confirm yet."]
};
const kindTag = k => `<span class="tag ${KIND[k][1]}" title="${esc(KIND[k][2])}">${KIND[k][0]}</span>`;
const SRC_CAT_LABEL = { OFFICIAL_NOTICE:"Official notice", THIRD_PARTY_RECALL:"Third-party recall", THIRD_PARTY_FORECAST:"Coaching forecast",
  THIRD_PARTY_SURVEY:"Survey", THIRD_PARTY_REPORT:"Third-party report", THIRD_PARTY_COMPILATION:"Third-party compilation", NEWS:"News report", LICENSED_MEDIA:"Licensed media" };
const VIDEO_TOPICS = [
  ["Gait abnormalities", "gait abnormalities examination neurology"],
  ["Tremor and movement disorders", "tremor chorea dystonia examination video"],
  ["Cranial nerve examination signs", "cranial nerve examination clinical signs"],
  ["Seizure types", "seizure semiology video focal generalized"],
  ["Heart sounds and murmurs", "heart murmurs auscultation sounds"],
  ["Orthopaedic special tests", "orthopaedic special tests knee shoulder examination"],
  ["Neonatal reflexes and newborn examination", "newborn examination primitive reflexes"],
  ["Common procedures (LP, intubation, catheterisation)", "lumbar puncture intubation procedure medical education"]
];
function srcName(id){ return S.evidence?.sources?.find(s => s.id === id)?.name || id; }
function srcLinks(ids){ return (ids||[]).map(id => `<a href="#review-sources" title="${esc(srcName(id))}">${esc(id)}</a>`).join(", "); }
routes.evidence = () => {
  const v = $("#view"); const E = S.evidence;
  if (!E){ v.innerHTML = `<header><h1>Evidence</h1></header><p class="note bad">The evidence file didn't load. Reload the page.</p>`; return; }
  const H = E.headline;
  const cov = {}; E.coverage.forEach(c => (cov[c.exam] ||= []).push(c));
  const years = [...new Set(E.coverage.map(c=>c.year))].sort();
  const covCell = c => !c ? "" : c.topic_observations ? `<b>${c.topic_observations}</b>` : c.sources.length ? `<span class="muted">${c.sources.length} src</span>` : `<span class="muted">–</span>`;
  const R = E.rankings;
  v.innerHTML = `<header class="stack" style="gap:4px"><span class="eyebrow">What the data can and can't say</span><h1>Evidence report</h1>
    <span class="muted small">Built ${esc(E.generated)} from the source registry. ${esc(E.method)}</span></header>
  <section class="panel stack"><h2>Bottom line</h2>
    <ul class="clean">
      <li>${kindTag("verified")} No official question papers are published for NEET-PG, INI-CET or FMGE. NBEMS published the NEET-PG 2025 answer key after Supreme Court orders, but not the questions; AIIMS releases no INI-CET key; sources conflict for FMGE. From October 2026 NEET-PG candidates see their own responses by question ID, without question text.</li>
      <li>${kindTag("reconstructed")} Topic-level recall exists for ${H.sessions_with_topic_data.length} sessions: ${H.sessions_with_topic_data.map(esc).join(" and ")}. That gives ${H.concepts_observed} concepts; ${H.concepts_in_2plus_sessions} of them was reported in more than one session (at most ${H.max_sessions_for_any_concept}).</li>
      <li>${kindTag("estimate")} Subject shares come from coaching tables with wide uncertainty (95% intervals below).</li>
      <li><b>So:</b> there's no basis for "most repeated topics over 10 years", topic probabilities or rising/falling trends. Study the full syllabus; use this page only to break ties.</li>
    </ul>
    <details class="small"><summary>What each label means</summary><ul class="clean">${Object.keys(KIND).map(k => `<li>${kindTag(k)} ${esc(KIND[k][2])}</li>`).join("")}</ul></details></section>

  <section class="panel stack"><h2>Official facts</h2>
    <ul class="clean small">${E.official_facts.map(f => `<li>${kindTag("verified")} ${esc(f.fact)} <span class="muted">(${srcLinks([f.source])})</span></li>`).join("")}</ul></section>

  <section class="panel stack"><h2>Coverage: which sessions have any data</h2>
    <p class="small muted" style="margin:0">Number = topic observations recorded. "src" = sources found but no topic-level data. "–" = nothing usable found.</p>
    <div class="tscroll"><table><tr><th>Exam</th>${years.map(y=>`<th class="n">${y}</th>`).join("")}</tr>
    ${Object.entries(cov).map(([ex, list]) => `<tr><td>${esc(ex)}</td>${years.map(y => { const cs = list.filter(c=>c.year===y); return `<td class="n" title="${esc(cs.map(c=>c.status).join("; "))}">${cs.map(covCell).join(" ")}</td>`; }).join("")}</tr>`).join("")}</table></div></section>

  <section class="panel stack"><h2>Subject distribution ${kindTag("estimate")}</h2>
    ${E.distributions.map(d => `<details class="pyqd" ${d.status==="partial"?"open":""}><summary><span>${esc(srcName(d.source))} · ${esc(d.exam)} ${esc(d.session)}</span><span class="tag ${d.status==="rejected"?"bad":d.status==="partial"?"verify":""}">${esc(d.status.toUpperCase())}</span></summary>
      <p class="small" style="margin:8px 0">${esc(d.note)}${d.paper_total?` Recorded ${d.recorded_total} of ${d.paper_total} questions (${d.completeness}%).`:""}</p>
      ${d.status==="rejected" ? `<p class="note bad small" style="margin:0">Not used for any ranking.</p>` :
      `<div class="tscroll"><table><tr><th>Subject</th><th class="n">n</th><th class="n">Share</th><th class="n">95% interval</th></tr>${d.rows.map(r => `<tr><td>${esc(r.label)}</td><td class="n">${r.n}</td><td class="n">${r.pct}%</td><td class="n small">${r.ci95?`${r.ci95[0]}–${r.ci95[1]}%`:"–"}</td></tr>`).join("")}</table></div>`}</details>`).join("")}
    <p class="small muted" style="margin:0">Intervals assume the table is an honest count of one paper; they don't cover recall errors.</p></section>

  <section class="panel stack"><h2>Topics reported in more than one session ${kindTag("reconstructed")}</h2>
    ${R.B_recurrence.length ? `<div class="tscroll"><table><tr><th>Concept</th><th>Sessions</th></tr>${R.B_recurrence.map(c => `<tr><td>${esc(c.name)}${S.modules.some(m=>m.why.concepts.includes(c.id))?` · <a href="#m-${S.modules.find(m=>m.why.concepts.includes(c.id)).id}">module</a>`:""}</td><td class="small">${c.sessions.map(esc).join("; ")}</td></tr>`).join("")}</table></div>` : `<p class="muted">None.</p>`}
    <span class="eyebrow">Subtopics reached in more than one session</span>
    <ul class="clean small">${E.subtopics.filter(x=>x.distinct_sessions>1).map(x => { const hsh = subtopicHash(x.s, x.t, x.st); return `<li>${hsh?`<a href="#${hsh}">`:""}${esc(S.subj[x.s]?.name||x.s)} › ${esc(x.t)} › ${esc(x.st)}${hsh?"</a>":""} — ${x.distinct_sessions} sessions (concepts: ${x.concepts.map(esc).join(", ")})</li>`; }).join("")}</ul>
    <details class="small"><summary>All ${E.concepts.length} observed concepts</summary><div class="tscroll"><table><tr><th>Concept</th><th>Subject › subtopic</th><th>Session(s)</th><th>Image</th></tr>
      ${E.concepts.map(c => `<tr><td>${esc(c.name)}</td><td>${esc(S.subj[c.s]?.name||c.s)} › ${esc(c.st)}</td><td>${c.sessions.map(x=>`${esc(x.exam)} ${esc(x.session)} (${srcLinks(x.sources)})`).join("; ")}</td><td>${c.sessions.map(x=>esc(x.image)).join(", ")}</td></tr>`).join("")}</table></div></details></section>

  <section class="panel stack"><h2>Trends</h2><p class="small" style="margin:0"><b>${E.trend.run?"Run.":"Not run."}</b> ${esc(E.trend.verdict)}</p><p class="small muted" style="margin:0">Rule: ${esc(E.trend.rule)}</p></section>

  <section class="panel stack"><h2>Priorities ${kindTag("recommendation")}</h2>
    <p class="small muted" style="margin:0">A and C are Claude's educational judgement, not exam statistics. B is the computed list above.</p>
    <span class="eyebrow">A · Foundational</span>
    <ul class="clean small">${R.A_foundational.map(a => `<li><b>${esc(a.id)} ${esc(a.name)}</b> — ${esc(a.rationale)}${S.modules.filter(m=>m.why.groups?.includes(a.id)).map(m=>` <a href="#m-${m.id}">${esc(m.title)}</a>`).join(",")}</li>`).join("")}</ul>
    <span class="eyebrow">C · Important but not seen in this dataset</span>
    <ul class="clean small">${R.C_underrepresented.map(a => `<li><b>${esc(a.id)} ${esc(a.name)}</b> — ${esc(a.rationale)} ${a.id==="C8"?kindTag("hypothesis"):""}</li>`).join("")}</ul>
    <p class="small muted" style="margin:0">Revision schedule used across the app: ${E.revision_intervals_days.join(", ")} days.</p></section>

  <section class="panel stack"><h2>Image-based questions</h2>
    <p class="small" style="margin:0">${esc(E.image.verdict)}</p>
    <div class="tscroll"><table><tr><th>Claim</th><th>Exam</th><th>Value</th><th>Source</th></tr>${E.image.claims.map(c => `<tr><td>${kindTag("estimate")}</td><td class="small">${esc(c.exam)} ${esc(c.session)}</td><td class="small">${esc(c.value)}</td><td class="small">${srcLinks([c.source])} · ${esc(c.note)}</td></tr>`).join("")}</table></div>
    <p class="small muted" style="margin:0">The claims contradict each other (from "very few" to about half), so the app makes no image-share claim. Images in this bank are openly licensed teaching images, not exam images.</p></section>

  <section class="panel stack"><h2>Video-based questions</h2>
    <ul class="clean small">${Object.entries(E.video.by_exam).map(([ex, txt]) => `<li><b>${esc(ex)}:</b> ${esc(txt)}</li>`).join("")}</ul>
    <div class="tscroll"><table><tr><th>Exam</th><th>Reported</th><th>Source</th></tr>${E.video.claims.map(c => `<tr><td class="small">${esc(c.exam)} ${esc(c.session)}</td><td class="small">${esc(c.value)}</td><td class="small">${srcLinks([c.source])} · ${esc(c.note)}</td></tr>`).join("")}</table></div>
    <span class="eyebrow">Video learning ${kindTag("hypothesis")}</span>
    <p class="small" style="margin:0">If video questions reach NEET-PG, they'd most likely test things that are hard to show in a still image. These links search YouTube for teaching videos; they're study aids, not evidence about the exam, and quality varies, so prefer university or society channels.</p>
    <div class="row">${VIDEO_TOPICS.map(([t,qy]) => `<a class="btn sm" target="_blank" rel="noopener" href="https://www.youtube.com/results?search_query=${encodeURIComponent(qy)}">${esc(t)}</a>`).join("")}</div></section>

  <section class="panel stack"><h2>All recorded claims</h2>
    <div class="tscroll"><table><tr><th>ID</th><th>Exam</th><th>Metric</th><th>Value</th><th>Source</th></tr>${E.claims.map(c => `<tr><td class="num small">${esc(c.id)}</td><td class="small">${esc(c.exam)} ${esc(c.session)}</td><td class="small">${esc(c.metric.replace(/_/g," "))}</td><td class="small">${esc(c.value)}</td><td class="small">${srcLinks([c.source])} · ${esc(c.note)}</td></tr>`).join("")}</table></div></section>

  <section class="panel stack"><h2>Checks the pipeline ran</h2>
    <ul class="clean small">${Object.entries(E.validation).map(([k,val]) => `<li>${esc(k.replace(/_/g," "))}: <b>${esc(String(val))}</b></li>`).join("")}</ul></section>

  <section class="panel stack"><h2>Limits of this report</h2><ul class="clean small">
    <li>All topic observations are third-party memory recall, mostly from coaching sites that also sell courses. None is confirmed against an official paper.</li>
    <li>Only two sessions have topic-level data. Absence of a topic means "not in this small sample", never "not asked".</li>
    <li>Session attribution in public datasets is unreliable (for example, MedMCQA's NEET-PG split mixes dental and AIIMS items), so they weren't used as exam evidence.</li>
    <li>Questions in this app are AI-written practice questions. None is a past-paper question.</li>
    <li>You can add sources you're entitled to use with pipeline/ingest.py; they go to a review queue first. <a href="#review-sources">Source registry</a></li></ul></section>`;
};
