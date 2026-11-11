# METROSIM 3D

A 3D city builder that runs in the browser (Three.js + React + TypeScript). It is built for the iPad Air 3 and also runs on the iPhone 14 Pro and on desktop.
**The first playable build (creative sandbox) works; see [docs/AUDIT.md](docs/AUDIT.md) for the current audit and performance baseline.** See [docs/SPEC.md](docs/SPEC.md) for the architecture, acceptance criteria and roadmap.

## Set up on Windows
1. Install **Node.js 22 LTS** from nodejs.org (the default options are fine) and **Git for Windows**.
2. In PowerShell:
   ```powershell
   git clone <this repository URL>
   cd sturdy-system\metrosim3d
   npm install
   npm run dev
   ```
3. On the laptop, open http://localhost:5173.
4. **On the iPad/iPhone** (same Wi-Fi): use the `Network:` address that `npm run dev` prints, e.g. `http://192.168.1.20:5173`. If it does not load, allow Node.js through Windows Defender Firewall on *Private* networks.

## Commands
| Command | What it does |
|---|---|
| `npm run dev` | Development server with live reload, reachable over your LAN |
| `npm test` | Unit tests (simulation, tools, saves) |
| `npm run build` | Type-check and produce `dist/` (static files; host anywhere, e.g. GitHub Pages) |
| `npm run preview` | Serve the built `dist/` locally |
| `node scripts/bench.mjs [url]` | Runs the in-game performance test headlessly (CPU timings only; no real GPU) |
| `node scripts/smoke.mjs [url] [dir]` | End-to-end browser test (needs Playwright + Chromium installed); mouse and iPad multi-touch |

## Controls
- **Touch:** one finger uses the selected tool (the *Move* tool pans). Two fingers pan, pinch to zoom, twist to rotate. The ▲▼ buttons tilt the view.
- **Mouse:** left = tool, right-drag = rotate/tilt, middle-drag or Shift+drag = pan, wheel = zoom.
- **Keys:** WASD/arrows, Q/E rotate, R/F tilt, +/− zoom.
