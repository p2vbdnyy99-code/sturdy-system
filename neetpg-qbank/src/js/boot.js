// ---------- boot ----------
(async function boot(){
  $("#view").innerHTML = `<p class="muted">Loading your bank…</p>`;
  try { await loadStatic(); loadModules(await getData("modules.json").catch(()=>null)); S.evidence = await getData("evidence.json").catch(()=>null); } catch { $("#view").innerHTML = `<p class="note bad">The question files didn't load. Reload the page.</p>`; return; }
  try { const cached = LS.get("doc:settings", null); if (cached) Object.assign(S.settings, cached); } catch {}
  // local cache first so the page is usable at once
  S.tx.forEach(s => { const p = LS.get("doc:p-"+s.id, null); if (p) S.prog[s.id] = Object.assign({r:{},b:{},x:{},f:{},v:{},sr:{}}, p); });
  render();
  await initCaps();
  try { await loadUser(); } catch {}
  try { await loadAttempts(); S.modProg = (await Store.getDoc("mods")) || {}; } catch {}
  if (!["run","practice"].includes((location.hash.slice(1)||"home").split("-")[0])) render();
})();
