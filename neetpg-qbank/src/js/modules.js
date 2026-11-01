
// ---------- learning modules (data/modules.json) ----------
// Original teaching notes for priority topics, written by Claude (AI). Their practice questions join the bank
// as AI-generated questions with ids m-<module>-<n>.
S.modules = []; S.modProg = {};             // modProg: module id -> [timestamps you marked it studied]
const MOD_CAT = {
  B: ["B · Recurred in this dataset", "Reported in two or more exam sessions in the evidence registry (third-party recall)."],
  A: ["A · Foundational", "Educational priority: underpins many questions across subjects. Not derived from exam counts."],
  OBSERVED_ONCE: ["Reported once", "Reported in one exam session (single third-party recall source). One report is not a pattern."],
  C: ["C · Under-represented", "Important but not seen in this small dataset."]
};
function loadModules(d){
  S.modules = d?.modules || [];
  S.modAbout = d?._about || "";
  for (const m of S.modules) (m.mcqs||[]).forEach((q,i) => addQuestion({ ...q, s:m.s, t:m.t, st:m.st, id:`m-${m.id}-${i}`, src:"module", mod:m.id,
    gen:"Learning module, written by Claude (AI), Oct 2026" }));
}
function modQs(m){ return (m.mcqs||[]).map((_,i) => S.Q.get(`m-${m.id}-${i}`)).filter(q => q && visible(q)); }
// next revision from the expanding schedule: the n-th study session is followed by SR_DAYS[n-1] days
function modNext(id){
  const h = S.modProg[id] || []; if (!h.length) return null;
  return h.at(-1) + SR_DAYS[Math.min(h.length, SR_DAYS.length) - 1] * DAY;
}
function subtopicHash(sid, t, st){
  const s = S.subj[sid]; const ti = s?.topics.findIndex(x=>x.name===t) ?? -1;
  if (ti < 0) return null; const si = s.topics[ti].subs.indexOf(st); return si < 0 ? null : `t-${sid}-${ti}-${si}`;
}
// Flowchart: a vertical chain of steps; a step with branches shows each "if → then" side by side
function flowHTML(f){
  if (!f?.steps?.length) return "";
  return `<figure class="flow" aria-label="${esc(f.title||"Flowchart")}">${f.title?`<figcaption class="eyebrow">${esc(f.title)}</figcaption>`:""}
    <ol>${f.steps.map((st,i) => `<li class="fstep" style="--d:${i}"><div class="fbox">${esc(st.t)}</div>
      ${st.d?.length ? `<div class="fbr">${st.d.map(b => `<div class="fopt"><span class="fif">${esc(b.if)}</span><span class="fthen">${esc(b.then)}</span></div>`).join("")}</div>` : ""}</li>`).join("")}</ol></figure>`;
}
function catBadge(w){
  const c = MOD_CAT[w.category] || [w.category, ""];
  return `<span class="tag ${w.category==="B"?"pyq":w.category==="A"?"ok":""}" title="${esc(c[1])}">${esc(c[0])}${w.groups?.length?` (${w.groups.join(", ")})`:""}</span>`;
}
routes.modules = () => {
  const v = $("#view");
  if (!S.modules.length){ v.innerHTML = `<header><h1>Modules</h1></header><p class="note warn">No learning modules loaded.</p>`; return; }
  const now = Date.now();
  const order = ["B","A","OBSERVED_ONCE","C"];
  const groups = order.map(k => [k, S.modules.filter(m => m.why.category === k)]).filter(g => g[1].length);
  const due = S.modules.filter(m => { const n = modNext(m.id); return n && n <= now; });
  v.innerHTML = `<header class="stack" style="gap:4px"><span class="eyebrow">Study</span><h1>Learning modules</h1>
    <span class="muted small">${S.modules.length} short modules on priority topics: concept, facts, a differential table, a flowchart, a mind map, common mistakes and two practice questions each. Written by Claude (AI) in October 2026 and not reviewed by a doctor: check them against your textbook.</span></header>
  <section class="panel stack"><h2>Why these topics</h2>
    <p class="small" style="margin:0">Each module says why it was chosen. <b>B</b> means the topic was reported in two or more exam sessions in the evidence registry. <b>A</b> is an educational judgement about foundational topics. <b>Reported once</b> means a single third-party recall. None of this is a prediction of what will be asked. <a href="#evidence">See the evidence</a>.</p>
    ${due.length ? `<p class="note warn small" style="margin:0">Due for revision: ${due.map(m => `<a href="#m-${m.id}">${esc(m.title)}</a>`).join(", ")}</p>` : ""}</section>
  ${groups.map(([k, list]) => `<section class="stack"><h2>${esc(MOD_CAT[k]?.[0] || k)}</h2><p class="small muted" style="margin:0">${esc(MOD_CAT[k]?.[1] || "")}</p>
    <div class="grid g2">${list.map(m => { const h = S.modProg[m.id]||[]; const n = modNext(m.id);
      return `<a class="panel modcard" href="#m-${m.id}"><span class="small muted">${esc(S.subj[m.s]?.name||m.s)} › ${esc(m.st)}</span><b>${esc(m.title)}</b>
        <span class="small">${h.length ? `Studied ${h.length}× · next revision ${new Date(n).toLocaleDateString("en-IN",{day:"numeric",month:"short"})}${n<=now?" (due)":""}` : `<span class="muted">Not studied yet</span>`}</span></a>`; }).join("")}</div></section>`).join("")}`;
};
routes.m = (id) => {
  const v = $("#view"); const m = S.modules.find(x => x.id === id);
  if (!m) return go("modules");
  const qs = modQs(m); const h = S.modProg[m.id] || []; const n = modNext(m.id);
  const sub = subtopicHash(m.s, m.t, m.st);
  const ev = S.evidence?.concepts?.filter(c => m.why.concepts.includes(c.id)) || [];
  v.innerHTML = `<a href="#modules" class="small">All modules</a>
  <header class="stack" style="gap:6px"><span class="eyebrow">${esc(S.subj[m.s]?.name||m.s)} › ${esc(m.t)} › ${esc(m.st)}</span><h1>${esc(m.title)}</h1>
    <div class="row">${catBadge(m.why)}<span class="tag ai" title="Written by Claude (AI); not reviewed by a doctor">AI-WRITTEN · UNREVIEWED</span></div></header>
  <section class="panel stack"><h2>Why this topic</h2><p class="small" style="margin:0">${esc(m.why.text)}</p>
    ${ev.length ? `<div class="tscroll"><table><tr><th>Concept in the registry</th><th>Sessions reported</th><th>Source quality</th></tr>${ev.map(c => `<tr><td>${esc(c.name)}</td><td class="small">${c.sessions.map(x=>`${esc(x.exam)} ${esc(x.session)}`).join("; ")}</td><td class="small">${esc(c.provenance)}</td></tr>`).join("")}</table></div>` : ""}</section>
  <section class="panel stack"><h2>The concept</h2><p style="margin:0">${esc(m.concept)}</p></section>
  <section class="panel stack"><h2>Key facts</h2><ul class="clean">${m.facts.map(f=>`<li>${esc(f)}</li>`).join("")}</ul>
    ${m.associations?.length?`<span class="eyebrow">Associations</span><ul class="clean">${m.associations.map(f=>`<li>${esc(f)}</li>`).join("")}</ul>`:""}</section>
  ${m.clues?.length?`<section class="panel stack"><h2>Clues in a question stem</h2><div class="row">${m.clues.map(c=>`<span class="chip static">${esc(c)}</span>`).join("")}</div></section>`:""}
  ${m.differentials?`<section class="panel stack"><h2>Differentials</h2>${tableHTML(m.differentials)}</section>`:""}
  ${m.flow?`<section class="panel stack"><div class="row between"><h2>Flowchart</h2><button class="btn sm" id="fplay">Step through</button></div>${flowHTML(m.flow)}</section>`:""}
  ${m.mm?`<section class="panel stack"><h2>Mind map</h2>${mindMapHTML(m.mm)}</section>`:""}
  ${m.misconceptions?.length?`<section class="panel stack"><h2>Common mistakes</h2><ul class="clean">${m.misconceptions.map(f=>`<li>${esc(f)}</li>`).join("")}</ul></section>`:""}
  ${m.image?`<section class="panel stack"><h2>Images</h2><p class="small" style="margin:0">${esc(m.image)}</p></section>`:""}
  <section class="panel stack"><h2>Practise and revise</h2>
    <div class="row"><button class="btn primary" id="mq" ${qs.length?"":"disabled"}>Practise the ${qs.length} module question${qs.length===1?"":"s"}</button>${sub?`<a class="btn" href="#${sub}">All questions in ${esc(m.st)}</a>`:""}</div>
    <p class="small" style="margin:0">Revise on an expanding schedule: ${SR_DAYS.map(d=>`${d} day${d>1?"s":""}`).join(", ")} after each study session.
      ${h.length ? `You've studied this ${h.length}× (last ${new Date(h.at(-1)).toLocaleDateString("en-IN")}); next revision ${new Date(n).toLocaleDateString("en-IN",{day:"numeric",month:"short"})}.` : "You haven't marked it studied yet."}</p>
    <div class="row"><button class="btn" id="mdone">${h.length && dayStart(h.at(-1))===dayStart(Date.now()) ? "Studied today ✓" : "Mark studied today"}</button></div></section>
  <section class="panel stack"><h2>References to check</h2><p class="small muted" style="margin:0"><span class="tag">SUGGESTED · NOT VERIFIED</span> Standard books where this is usually covered. No page numbers are given because none were checked.</p>
    <ul class="clean small">${(m.refs||[]).map(r=>`<li>${esc(r)}</li>`).join("")}</ul></section>`;
  const fp = $("#fplay"); if (fp) fp.onclick = () => { const f = $(".flow", v); f.classList.remove("playing"); void f.offsetWidth; f.classList.add("playing"); };
  $("#mq").onclick = () => startSession(m.title, qs);
  $("#mdone").onclick = async () => {
    const list = S.modProg[m.id] ||= [];
    if (list.length && dayStart(list.at(-1)) === dayStart(Date.now())) return toast("Already marked for today.");
    list.push(Date.now()); await Store.setDoc("mods", S.modProg).catch(()=>{});
    toast("Saved. Next revision in " + SR_DAYS[Math.min(list.length, SR_DAYS.length)-1] + " day(s)."); render();
  };
};
