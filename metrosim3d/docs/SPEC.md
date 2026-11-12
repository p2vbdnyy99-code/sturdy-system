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

**Product principle:** Creative mode is the primary experience: spending hours building an enormous, beautiful metropolis. Realistic simulation is the additional experience. When a design choice trades creative freedom against management depth, creative freedom wins. Management systems (including finance) must never be required in Creative mode.

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
| 1 | Audit and optimise the existing build | **Done**: iPad Air 3 gate passed on 2026-11-12 (City 52 FPS, Town 60 FPS at Medium; see `docs/AUDIT.md` §13) |
| 2 | Advanced road and transport construction (§7) | **2a passed** on iPad (AUDIT §15). **2b built**, waiting on the iPad benchmark. 2c–2e not yet approved. |
| 3 | Traffic and pedestrian simulation (road graph, pathfinding in a Web Worker, vehicles with LOD) | Not started |
| 4 | Population, economy and **finance** (demand, employment; treasury, banking, revenue, expenditure, reports, per §8) | Not started. Finance interfaces exist since 2a. |
| 5 | Utilities and public services (power, water, sewage, health, education, police, fire), each with its §8 revenue/expense lines | Not started |
| 6 | Public transport and advanced infrastructure (bus, rail, metro, airports, seaports), financed through §8.5 project financing | Not started |
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

## 7. Phase 2 plan: transport geometry

### Core architectural decision
Roads change from "a tile marked road" to a **road graph**: nodes (junctions and end points) joined by segments. Each segment is a straight line or curve with a road type, a height profile (ground / bridge / tunnel) and a direction. The graph becomes the source of truth.
- The tile grid stays for zoning, buildings and terrain. Each segment's footprint is **marked onto the tiles it covers**, so the existing zoning, growth, placement and bulldoze rules keep working with small changes.
- Phase 3 traffic will route on the same graph's lanes, so nothing is rebuilt later.
- Saves move to version 2. Version-1 saves convert their road tiles into graph segments when loaded. Old cities keep working.

### Milestones (each ends with the iPad performance test; the gate stays City ≥ 50 FPS at Medium)
| | Milestone | Contents |
|---|---|---|
| 2a ✅ | Creative mode + terrain tools | A per-city **Creative/Realistic** switch. Creative ignores money, slope and water-placement limits. Terrain raise / lower / level / smooth brushes. |
| 2b ✅ | Road graph + curved roads | Graph model, straight and curved drawing with snapping, automatic junctions where roads cross, road types (street, avenue). Tile footprint derived from the graph. Chunked road meshes. Save v2 + v1 migration. |
| 2c | Bridges, elevated roads, tunnels | Height control while drawing; automatic bridge over water; piers; tunnel portals; slope limits per road type. |
| 2d | Highways and interchanges | One-way highways, on/off ramps, flyovers, freeform interchanges built from ramps; prefab interchange templates later. |
| 2e | Larger maps | Up to 4 km (512 tiles): terrain split into chunks with level-of-detail, adopted only if the gate still passes. |

### Approval boundaries (2026-11-12)
2a approved and built. 2b approved only after 2a passes the iPad benchmark. 2c–2e need separate approval. No deployment or repository changes beyond the agreed workflow without approval.

### Phase 2b requirements (as approved)
- Straight and curved roads, automatic junctions, streets and avenues, road upgrades, deleting and modifying roads, proper connections.
- **Touch-first drawing:** placing a road on the iPad must feel natural (drag to draw; curves without CAD-style handles), not like desktop CAD.
- **Traffic-ready network:** lanes, directions and connections are modelled in the graph now, so Phase 3 doesn't rewrite it.
- **Existing cities migrate automatically** (save v3: tile roads become graph segments).
- **No complicated zoning changes** until curved roads have been played and awkward plots confirmed.
- Benchmark after the milestone. Road meshes are built in chunks: today, terrain edits over roads rebuild the whole road mesh (AUDIT §14).

### Phase 2a as built
- **Mode** (`sim/rules.ts`): a per-city Creative/Realistic switch. The rules are derived from the mode on demand, never stored, so switching cannot alter the city.
  - **Creative:** free construction; water, slope and drag-size limits ignored; all buildings unlocked. Optional "simulate finances" charges costs to the treasury without leaving Creative.
  - **Realistic:** costs, slope and water limits apply.
  - Buildings over water stand on piers; roads sit just above the surface.
- **Terrain brush** (`sim/terraform.ts`): raise, lower, flatten (to the stroke's start height) and smooth. Size 1–16 tiles, strength 1–10, smooth falloff. Ground under buildings is locked; roads follow the ground. Earthworks cost money in Realistic mode. One undo step per stroke. Digging below sea level makes water; raising seabed makes land.
- **Saves v2:** mode, Creative finance flag, treasury ledger. v1 saves migrate on load (unlimited money → Creative; limited → Realistic). Tests cover this.

### Phase 2b as built
- **Road graph** (`src/sim/roads/`): nodes and segments; each segment is a quadratic curve with a type.
  - Tiles are *derived*: a tile is a road when its centre is within half the road width + 3 m of the centreline (reference-counted). Zoning, growth, placement and bulldozing work unchanged.
  - **Traffic-ready:** `lanesFor(type)` gives lane offsets and directions (right-hand traffic); junctions are graph nodes.
- **Road types:** Street (8 m, 1 lane each way, centre line, $12/m, max grade 15%) and Avenue (14 m, 2 lanes each way, planted median, $28/m, max grade 12%).
- **Touch drawing:**
  - **Straight:** drag start → end.
  - **Curve:** draw with your finger; the path is simplified and fitted into smooth, tangent-continuous curves.
  - **Upgrade:** drag along roads to change their type (refused if the wider road would hit buildings).
  - **Edit:** drag a junction to move it (drop it on another end to join roads), or drag the middle of a road to bend it.
  - Ends snap to existing junctions and road ends (9 m), onto roads (creating a T), and optionally to the grid (streets to tile centres, avenues to tile edges). A green/red ghost previews the road, with blocked tiles in red, length, junction count and cost.
- **Automatic junctions:** crossing or meeting roads split both roads at a shared node.
  - Refused with a clear message: running along or grazing an existing road, crossings flatter than 25°, junctions closer than 10 m, building conflicts. In Realistic mode also water and gradient.
- **Delete:** the bulldozer removes whole segments (junction to junction) touched by its rectangle.
- **Rendering:** ribbons that follow terrain, with markings drawn per pixel by a shader (no textures), and round junction pads. Meshes are grouped in 256 m chunks; an edit or terrain stroke rebuilds only the chunks it touches, plus neighbours whose junction shape changed.
- **Saves v3:** the road graph is saved. **v1/v2 cities migrate automatically**: grid roads become street segments covering exactly the same tiles (tested), and buildings are untouched.
- **Zoning unchanged**, as instructed. Plot shapes along curved roads are to be judged by playing.

### Performance rules for Phase 2
- Road meshes are built in map chunks, so an edit rebuilds one chunk, never the whole network.
- The performance test gains a "Road network" scenario: a dense grid with curves, bridges and a highway.

## 8. Banking, Treasury and Financial Management

A core gameplay system for **Realistic mode** (and optional in Creative). Specified now; **implemented in Phase 4**, with revenue and expense lines added as Phases 5–6 create the services they belong to. Phase 2a has already established the interfaces and the treasury ledger that construction posts to (§8.8).

### 8.1 City Treasury
- Total available funds (cash reserve).
- Monthly revenue and expenditure; separate **operating** (recurring: salaries, maintenance, services) and **capital** (one-off: construction, land works, major projects) budgets.
- Cash-flow statement per month: opening balance, inflows by category, outflows by category, closing balance.
- Financial history: monthly totals kept for 10 years (120 months) in the save; yearly reports derived from them.

### 8.2 Banking
- An in-game lending institution offering several **loan products**, e.g. short-term credit line, municipal bond, infrastructure loan and emergency loan. Each has a maximum principal, an interest rate and allowed terms.
- The player chooses amount, rate tier (tied to creditworthiness) and repayment period.
- Monthly instalments (annuity formula, rounded to whole dollars; the final instalment absorbs rounding).
- Early repayment, with an optional fee by product. Refinancing (replace a loan with a new one) and additional borrowing (subject to limits).
- Tracking: outstanding principal, interest paid to date, remaining schedule, next due date.

### 8.3 Revenue
Taxes (residential, commercial, industrial, with adjustable rates), utility charges, transport fares, tourism, commercial and industrial activity levies, and other municipal income (fees, land sales). Each line is a `FinanceSource` computed from the city once per month.

### 8.4 Expenditure
Healthcare, education, emergency services (police, fire, ambulance), infrastructure maintenance (per road length, per building type), transportation operations, utilities, salaries, and loan interest/principal.

### 8.5 Infrastructure financing
- A major project (a highway, metro line, airport, power plant) gets a **financing plan**: from treasury, from one or more loans, or a mix.
- Before building, the game shows capital cost, estimated monthly operating cost, and the loan schedule if financed.
- After building, revenue attributed to the project (fares, fees, land-value tax uplift) is tracked against its costs. A project report shows payback progress.

### 8.6 Financial simulation
- Monthly and yearly reports; loan repayment schedules; interest calculations; cash reserves.
- **Creditworthiness**: a rating (AAA–D) computed from debt-to-revenue, reserves in months of expenses, and payment history. It sets available loan rates and limits.
- **Debt sustainability**: debt service as a share of revenue, shown with warning thresholds.
- **Optional bankruptcy** (off by default): after N consecutive months of negative reserves and missed payments, the city enters receivership (spending frozen, forced tax settings) until reserves recover. Never game-over without the player opting in.

### 8.7 Game modes
- **Creative:** unlimited money by default; never asks for financial decisions. Optional *Simulate finances in Creative* (already in Settings) charges costs and, from Phase 4, runs the full simulation without Realistic's construction limits.
- **Realistic:** complete financial management.

### 8.8 Architecture (interfaces in place since 2a)
- `src/sim/finance/` is part of the simulation layer: no rendering, DOM or React dependencies. It can run in a Web Worker with the rest of `sim/`.
- **All money movement goes through `Treasury.post(transaction)`**, which records category, budget kind and day. Construction and terraforming already do this. Reports read the ledger, never the UI.
- **Whole-dollar integers and basis-point rates** keep every calculation exact and deterministic. Monthly processing runs in a fixed order: sources → expenses → loans → rating. Unit tests cover the ledger already; Phase 4 adds tests per formula (annuity schedule, early payoff, rating).
- **Persistence:** `FinanceData` (balance, monthly totals, loans, settings) is a block in the save (v2+), versioned with the rest.
- **UI decoupling:** finance screens (budget, bank, reports) read a finance snapshot via the game store, like stats do today, and call Game methods (`takeLoan`, `setTaxRate`, …). No component computes money.
- Types defined now (`src/sim/finance/types.ts`): `Transaction`, `MonthTotals`, `FinanceSource`, `LoanProduct`, `Loan`, `ProjectFinancing`, `FinanceData`, plus revenue and expense category lists matching §8.3–8.4.
