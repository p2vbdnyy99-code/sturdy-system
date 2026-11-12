# MetroSim 3D — Phase 1 audit and performance baseline

Date: 2026-11-11. Scope: inspect the existing build before any new feature work. **No code was rewritten.**
Two things were added: an in-game performance test (Settings → Performance test) and per-layer timing inside the renderer.

## 1. Architecture as built (unchanged)

| Layer | Files | Notes |
|---|---|---|
| Simulation | `src/sim/*` | Pure TypeScript with no DOM or Three.js. Seeded and deterministic. Ready for a Web Worker. |
| Rendering | `src/render/*` | Reads the World and never mutates it. Rebuilds only layers whose version counter changed. Draws only when something changed. |
| Game glue | `src/game/*` | Input → Actions, undo (25 snapshots), autosave, main loop, performance test. |
| Storage | `src/storage/saves.ts` | IndexedDB, separate meta and data stores. |
| Interface | `src/ui/*` | React HUD, toolbar, save and settings sheets. |

Size: about 3,000 lines of TypeScript/TSX. Dependencies: three 0.170, react 18.3, vite 5.4. Tests: 11 unit tests, plus an end-to-end smoke test (mouse and emulated iPad multi-touch).

## 2. Feature inventory against the locked decisions

| Locked requirement | Status |
|---|---|
| Creative mode: unlimited money | **Done.** Per-city toggle, on by default. |
| Creative mode: unrestricted construction | **Not done.** Slope, water and occupancy rules always apply. Needs an explicit "Creative" mode flag (Phase 2). |
| Creative mode: all buildings unlocked | **Done.** There is no unlock system. |
| Realistic mode | **Not started.** Only money costs and zone growth exist. No income, demand or utilities. |
| Roads | **Partial.** Grid-aligned, L-shaped drag, auto-joining junctions, follow slopes. No curves, road types, bridges, tunnels or interchanges. |
| Zoning R/C/I + growth | **Done (basic).** Growth within 2 tiles of a road; denser neighbourhoods grow taller. |
| Building placement | **Done.** Four placeable types, eleven procedural looks overall. |
| Terrain | **Done (generation only).** Coast, river, hills. No editing tools. |
| Camera / touch | **Done.** Tested on an emulated iPad, **not on a real one**. |
| Save / load | **Done.** Named slots, autosave, survives page reload (tested). |
| Map size 2–4 km | **Partial.** The current maximum is 2.0 km (256 tiles × 8 m). |

## 3. Baseline measurements (cloud machine, software GPU)

Headless Chromium with SwiftShader at 1112×834 (the iPad Air 3's logical size), Medium quality, map 192×192 (1.5 km).
**The FPS column is meaningless here: there is no GPU.** The JavaScript columns are real CPU costs on this machine.

```
Scenario     Bldgs  build  rebuild (bldg/tree/zone)  draws  tris
Empty map        4    113     10.0 (0.1/9.5/0.1)         8   613k
Town          1500     86     15.9 (5.1/10.4/0.3)       11   660k
City          5000     50     18.8 (9.2/9.2/0.1)        11   776k
Metro        10000     84     15.5 (12.4/2.9/0.1)       11   795k
```
(build = ms to create all meshes; rebuild = main-thread ms each time a building appears; draws = draw calls per frame.)

Growth at 3× speed applies about 4 growth steps per second, each costing the rebuild time above.

## 4. Findings, ranked by expected cost on the iPad Air 3

These are **hypotheses until the iPad numbers come in.** Each cites the measurement behind it.

1. **Decorative trees dominate geometry.** The *empty* map already draws about 613k triangles, while 10,000 buildings add only about 180k. Each tree is a 10-sided capped trunk plus an 8-sided cone (≈56 triangles), and with shadows on, the whole scene is drawn twice. This is the most likely cause of a low frame rate on the A12.
   *Candidate fix:* simpler trees, no trunks at Low/Medium, and no tree shadows at Medium. This changes visuals only, not gameplay.
2. **Every growth step rebuilds all trees across the whole map.** That costs about 10 ms, because the forest noise is recomputed for every tile.
   *Candidate fix:* compute the forest mask once per city and rebuild only the changed area.
3. **Every growth step rebuilds every building's instances.** This grows linearly, to about 12 ms at 10,000 buildings. On the iPad, roughly 15–30 ms stalls 4× per second at fast speed would read as stutter. *(The A12 being 1–2× slower than this cloud CPU is my estimate, not measured.)*
   *Candidate fix:* append new instances, and do a full rebuild only on removals.
4. **Draw calls are low (8–11).** Instancing works as intended. Not a concern.
5. **Memory: the JS heap is 22–45 MB.** Low. GPU memory is unmeasured; Safari doesn't expose it.

## 5. What the iPad run decides

Run Settings → **Performance test** on the iPad Air 3 at **Medium**, then again at **Low**. Then:

- **Town ≥ 50 FPS and City ≥ 30 FPS at Medium:** apply fixes 2–3 (stutter only), then start Phase 2.
- **City < 30 FPS at Medium but ≥ 30 at Low:** apply fix 1 first, re-measure, then decide Medium's defaults.
- **City < 30 FPS even at Low:** stop. Profile on the device before any Phase 2 work.

Repeat the test on the iPhone 14 Pro at High to set the iPhone defaults.

## 6. iPad results, run 1 (2026-11-12, before optimisation)

Reported by the device: Safari 26.2 (iPadOS presents itself as a Mac), "Apple GPU", 1112×660 screen at 2×. The canvas was 1112×612 CSS pixels. Safari hides the device model, so these are taken to be from the iPad Air 3.

| Scenario | Medium FPS (p95 ms) | Low FPS (p95 ms) | Growth-step cost, Medium → Low |
|---|---|---|---|
| Empty map | 32 (36) | 60 (18) | 16 → 8 ms |
| Town 1,500 | 33 (39) | 60 (19) | 23 → 9 ms |
| City 5,000 | 31 (40) | 49 (23) | 30 → 16 ms |
| Metro 10,000 | 33 (39) | 46 (25) | 24 → 17 ms |

Reading:
- **Medium is about 32 FPS even on an empty map**, so its cost is per-frame and fixed, not caused by buildings. The frame lands just over one 60 Hz refresh (16.7 ms), so it waits for the next one (33 ms).
  - Medium differs from Low in four ways: 2.25× the pixels (1.5× ratio), anti-aliasing, shadows, and twice the trees. One run cannot separate these.
- **Low holds 60 FPS up to Town and 46–49 FPS at City/Metro.** Building geometry starts to cost here.
- **Growth-step cost on the iPad is 1.0–1.9× the cloud machine.** That's 8–30 ms, mostly the full tree rebuild, which confirms findings 2 and 3 as real stutter sources.
- **Against §5's rules:** City at Medium is 31, which passes the ≥30 bar, but Town at Medium is 33, which fails the ≥50 bar. The rules didn't cover this case. It is treated as "optimise before Phase 2".
- **Not a throttling artefact:** Low reached 60 FPS in the same setup, which rules out a Low Power Mode or embedded-page 30 FPS cap.

## 7. Optimisations applied after run 1 (no gameplay changes)

| Change | Measured effect (cloud machine; the iPad needs re-measuring) |
|---|---|
| Low-poly open-ended trees (5-sided trunk, 6-sided crown: about 16 instead of 56 triangles) | Empty map 613k → 229k triangles. Metro 795k → 586k |
| Trees cast no shadows at Low/Medium (still do at High) | Removes the trees from the shadow pass |
| Tree positions computed once per city; updates only filter by tile use, with no allocation | Tree rebuild 9.5 → about 0.5–1 ms |
| Buildings cached as ready-made matrices; growth appends only new instances; full repack only on removal or terrain change | Building rebuild 12.4 → about 0.4 ms at 10,000 buildings |
| **Total main-thread cost per growth step** | **10–19 ms → about 1 ms** |

Deliberately not changed yet: render resolution, anti-aliasing and shadow-map size. The performance test now has a **diagnosis section**: the City scenario re-measured with no shadows, then at 1× resolution, then with no trees. Run 2 will show which of these the Medium setting should give up.

## 8. iPhone 14 Pro, run 1 (2026-11-12 03:13, before the section 7 optimisations)

Reported by the device: iOS 18.6, inside the Claude app's web view. Screen 393×852 at 3×; the canvas was 786×1446 (393×723 CSS pixels) at render pixel ratio 2. Quality: High.

| Scenario | FPS | p50 ms | p95 ms | worst ms | Growth-step cost |
|---|---|---|---|---|---|
| Empty map | 57 | 17 | 22 | 24 | 15 ms |
| Town 1,500 | 55 | 17 | 22 | 140 | 17 ms |
| City 5,000 | 58 | 17 | 20 | 49 | 18 ms |
| Metro 10,000 | 54 | 17 | 24 | 47 | 18 ms |

Reading:
- **High runs at the 60 Hz ceiling (p50 17 ms) at every city size, with up to about 840k–980k triangles.** The iPhone 14 Pro screen can do 120 Hz, but this web view delivered 60 frames a second; that's the effective cap here.
- **p95 of 20–24 ms means occasional dropped frames.** The single 140 ms frame is a one-off hitch, likely a shader compile or garbage collection; a second run would show whether it repeats.
- **The 15–18 ms growth-step cost is the stutter source fixed in section 7.** It should now be about 1 ms.
- **Decision:** keep **High** as the iPhone default. The iPhone is not the constraint; the iPad Air 3 at Medium still gates Phase 2.
