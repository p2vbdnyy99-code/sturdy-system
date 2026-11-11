# METROSIM 3D — Development Specification

Status: **First playable build done** (sections 3 below). Revised Phase 1 (audit + baseline) is in progress: see `docs/AUDIT.md`. Not yet tested on real devices.

## 0. Locked decisions (2026-11-11)

| Decision | Selection |
|---|---|
| Primary device | iPad Air 3 (A12 Bionic, 3 GB RAM): every feature must stay playable on it |
| Secondary device | iPhone 14 Pro (higher graphics settings) |
| Graphics | CS1-level stylised 3D on iPad; enhanced settings on iPhone |
| Map size | Large metropolitan map, initially 2–4 km |
| Experience | Both a creative sandbox and realistic simulation, switchable per city |
| Approach | Extend this repository; no rewrites without a measured reason |
| Developer / reviewer | Claude Code (Opus) / Gemini Pro |

Non-negotiable:
1. **Creative mode from the beginning:** unlimited money, unrestricted construction, all buildings unlocked. Every new system ships with its creative-mode behaviour.
2. **Transport geometry before advanced simulation:** curved roads, highways, bridges, tunnels and interchanges come before sophisticated traffic.
3. **Performance before visual complexity:** each phase ends with the performance test on the iPad Air 3 (see `AUDIT.md`).

## 1. Targets

| Device | Role | Default graphics |
|---|---|---|
| iPad Air 3 (A12 Bionic, 3 GB RAM) | Primary device: performance is designed around it | Medium |
| iPhone 14 Pro | Portable version | High |
| Windows laptop | Development, testing, builds | High |

The game is a web app (WebGL2), so one codebase runs on all three. On iOS, every browser uses WebKit, so **Safari on the real devices is the test that counts**. Chrome passing does not prove it works on iOS.

The device cannot be identified from inside the browser (Safari hides the model and GPU). Quality is therefore guessed from the device class: iPad → Medium, phone → High, desktop → High. The player can change it under Settings → Graphics quality. The setting is stored per device.

## 2. Architecture

Three layers. Data flows one way: Interface → Game → Simulation → Renderer reads it.

```
src/
  sim/        Layer 2 – Simulation (pure TypeScript, no DOM/Three.js; can move to a Web Worker)
    world.ts        tile grid, corner heights, roads, zones, buildings, money, RNG, version counters
    terrain.ts      seeded procedural terrain: plains, hills, coast, river
    tools.ts        Actions (road / zone / bulldoze / place): plan (preview + cost) and commit
    growth.ts       zone development: zoned tiles within 2 tiles of a road grow buildings
    stats.ts        population, jobs, zoned area
    serialize.ts    versioned save snapshot / restore with validation
  render/     Layer 1 – Rendering (Three.js). Reads the World, never mutates it.
    SceneRenderer.ts  renderer, lights, shadows, fog, on-demand rendering, height-field picking
    terrainMesh.ts    shared-corner terrain mesh, vertex colours, skirts, water
    roadLayer.ts      road tiles with an auto-connecting texture atlas (straight/corner/T/cross/end)
    buildingParts.ts  procedural buildings from a seed (houses, apartments, shops, offices, towers, factories, parks)
    buildingLayer.ts  instanced meshes, procedural window shader, decorative forests
    cameraRig.ts      target/distance/yaw/pitch camera with clamps
    quality.ts        Low/Medium/High profiles
  game/       Glue: input → actions, undo, autosave, main loop
    Game.ts, InputController.ts, settings.ts
  storage/    IndexedDB city saves (metadata + data stores)
  ui/         Layer 3 – Interface (React): toolbar, HUD, saves, settings
```

Design rules:
- The simulation is deterministic: a seeded RNG whose state is saved. Load a save, run N days, and you get the same city every time.
- The renderer rebuilds only the layers whose version counter changed. It draws a frame only when something changed, which saves battery on the iPad.
- Everything is drawn with a few instanced meshes. Building count does not add draw calls.
- Saves are versioned (`SAVE_VERSION`). Loading rejects saves with a mismatched size or unknown types instead of loading a corrupt city.

## 3. First playable build — acceptance criteria

| Requirement | Implementation | Verified by |
|---|---|---|
| Large 3D terrain map | 128 / 192 / 256 tiles (1.0 / 1.5 / 2.0 km), 8 m tiles. Seeded hills, coast and river | unit test (deterministic, has water + buildable land), screenshots |
| Free camera, zoom/rotate/pan | 2-finger pan + pinch + twist; mouse right-drag rotate/tilt, wheel zoom; WASD/QE/RF; on-screen buttons | smoke test (pinch zoom 450→150 m, twist rotates, city unchanged) |
| Road construction | Drag start→end (L-shaped), auto-connecting intersections, follows slopes; blocked by water, steep ground, buildings | unit tests, smoke test (mouse + touch) |
| Building placement | Park, Residential tower, Office tower, Factory (1×1 and 2×2). Foundations on slopes | unit tests, smoke test |
| R/C/I zoning | Drag rectangles; zoned land within 2 tiles of a road grows houses/apartments, shops/offices, workshops/warehouses | unit tests, smoke test |
| Unlimited money | Settings toggle, saved per city (on by default = creative mode). Off: costs are charged, and you can't build without funds | unit test, smoke test |
| Save and load cities | IndexedDB, named slots, save-as-copy, delete, autosave every 60 s and when the app goes to background | unit test (fake IndexedDB), smoke test (save → reload page → load) |
| Touch-friendly controls | 44 px+ targets, safe-area insets, no page zoom, a second finger cancels the tool, ending a pinch never draws | smoke test (emulated iPad) |
| Extra | Undo (25 steps), bulldoze, city statistics, pause / 1× / 3× | unit + smoke tests |

### Known Phase 1 limits (by design, not bugs)
- No income. With unlimited money off, funds only go down. The economy arrives in Phase 3.
- Roads are grid-aligned and cannot cross water. Curves, bridges and highways come in Phase 2.
- No terrain editing yet. Buildings sit on foundation plinths instead of flattening the ground.
- The "unlimited construction" toggle from the feature list is not implemented. Its meaning needs defining first: e.g. ignore slope, water and money limits.
- No Web Worker yet. Growth takes well under a millisecond per day. The `sim/` layer has no DOM dependencies so it can move to a worker once traffic simulation needs one.

## 4. Roadmap (revised 2026-11-11; one phase at a time, each gated on the iPad performance test)

| Phase | Development | Status |
|---|---|---|
| 1 | Audit and optimise the existing build | Audit + baseline done (`docs/AUDIT.md`); waiting on iPad numbers before optimising |
| 2 | Advanced road and transport construction: Creative/Realistic mode flag, curved roads, road types, highways, interchanges, bridges, tunnels, terrain editing | Not started |
| 3 | Traffic and pedestrian simulation (road graph, pathfinding in a Web Worker, vehicles with LOD) | Not started |
| 4 | Population and economy (demand, taxes, budget, employment) | Not started |
| 5 | Utilities and public services (power, water, sewage, health, education, police, fire) | Not started |
| 6 | Public transport and advanced infrastructure (bus, rail, metro, airports, seaports) | Not started |
| 7 | Graphics, lighting, weather, day/night, environment | Not started |
| 8 | Challenges, advanced creative tools, expansion | Not started |

## 5. Performance budget (iPad Air 3, Medium)
These are targets, to be measured on the device. They are not measured yet.
- 60 fps while panning an empty map; ≥ 30 fps with ~5,000 buildings.
- JS heap < 300 MB (Safari kills tabs well before the 3 GB physical RAM is used).
- Measure: Settings → "Show render time", plus Safari Web Inspector from a Mac or the Timelines tab. Without a Mac: watch the FPS feel and the render-time figure.

## 6. Device test checklist (run on each device for every phase)
1. Open the URL in Safari → Share → **Add to Home Screen**, then launch from the icon (full screen, and saves are better protected).
2. Draw roads, zone R/C/I, place each building, bulldoze, undo.
3. Pinch, twist, two-finger pan; tilt buttons; rotate the device (portrait and landscape).
4. Save, force-quit the app, reopen, load. Check that autosave appears after a minute.
5. Switch Low / Medium / High and note smoothness and render time for each.
6. Report problems with a screenshot plus device, quality setting and what you did.
