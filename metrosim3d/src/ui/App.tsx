import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Game, ToolId, UiState } from '../game/Game';
import { BUILDING_DEFS, PLACEABLE_TYPES } from '../sim/constants';
import { Icon } from './icons';
import { SavePanel } from './SavePanel';
import { SettingsPanel } from './SettingsPanel';

const TOOLS: { id: ToolId; label: string; icon: JSX.Element; cls?: string }[] = [
  { id: 'pan', label: 'Move', icon: Icon.pan },
  { id: 'road', label: 'Road', icon: Icon.road },
  { id: 'zoneRes', label: 'Homes', icon: Icon.res, cls: 'z-res' },
  { id: 'zoneCom', label: 'Shops', icon: Icon.com, cls: 'z-com' },
  { id: 'zoneInd', label: 'Industry', icon: Icon.ind, cls: 'z-ind' },
  { id: 'place', label: 'Buildings', icon: Icon.place },
  { id: 'terrain', label: 'Terrain', icon: Icon.terrain },
  { id: 'bulldoze', label: 'Bulldoze', icon: Icon.bulldoze, cls: 'danger' },
];

const fmt = (n: number) => Math.round(n).toLocaleString('en-US');

export function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [game, setGame] = useState<Game | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    let g: Game;
    try {
      g = new Game(canvasRef.current);
    } catch (e) {
      setError((e as Error).message || 'Could not start WebGL');
      return;
    }
    setGame(g);
    (window as unknown as { __game: Game }).__game = g; // handy for debugging on device
    return () => g.dispose();
  }, []);

  return (
    <div className="app">
      <canvas ref={canvasRef} className="view" />
      {error && (
        <div className="fatal">
          <h2>METROSIM 3D could not start</h2>
          <p>{error}</p>
          <p>This game needs WebGL2 (Safari on iOS 15 or later, or a current Chrome/Edge).</p>
        </div>
      )}
      {game && <Hud game={game} />}
    </div>
  );
}

function Hud({ game }: { game: Game }) {
  const s: UiState = useSyncExternalStore(game.subscribe, game.getState);
  const [panel, setPanel] = useState<'none' | 'saves' | 'settings'>('none');
  const [showStats, setShowStats] = useState(false);
  const [toastVisible, setToastVisible] = useState(false);

  useEffect(() => {
    if (!s.toast) return;
    setToastVisible(true);
    const t = setTimeout(() => setToastVisible(false), 2200);
    return () => clearTimeout(t);
  }, [s.toast?.id]);

  if (s.bench.running) {
    // HUD hidden so the measurement reflects the 3D view alone.
    return <div className="bench-progress">Performance test: {s.bench.step}</div>;
  }

  return (
    <>
      <header className="topbar">
        <div className="city">
          <div className="city-name">{s.cityName}</div>
          <div className="city-sub">Day {fmt(s.day)}</div>
        </div>
        <button className={`pill mode ${s.mode}`} onClick={() => setPanel('settings')} aria-label={`Game mode: ${s.mode}`}>
          {s.mode === 'creative' ? 'Creative' : 'Realistic'}
        </button>
        <div className="pill money" title="Funds">
          {s.unlimitedMoney ? <span className="inf">∞</span> : `$${fmt(s.money)}`}
        </div>
        <button className="pill" onClick={() => setShowStats((v) => !v)} aria-label="City statistics">
          {Icon.stats}
          <span>{fmt(s.stats.population)}</span>
        </button>
        <div className="seg" role="group" aria-label="Simulation speed">
          <button className={s.speed === 0 ? 'on' : ''} onClick={() => game.setSpeed(0)} aria-label="Pause">{Icon.pause}</button>
          <button className={s.speed === 1 ? 'on' : ''} onClick={() => game.setSpeed(1)} aria-label="Normal speed">{Icon.play}</button>
          <button className={s.speed === 3 ? 'on' : ''} onClick={() => game.setSpeed(3)} aria-label="Fast speed">{Icon.fast}</button>
        </div>
        <div className="spacer" />
        <button className="icon-btn" disabled={!s.canUndo} onClick={() => game.undo()} aria-label="Undo">{Icon.undo}</button>
        <button className="icon-btn" onClick={() => setPanel('saves')} aria-label="Save and load">{Icon.save}</button>
        <button className="icon-btn" onClick={() => setPanel('settings')} aria-label="Settings">{Icon.settings}</button>
      </header>

      {showStats && (
        <div className="stats card">
          <Row k="Population" v={fmt(s.stats.population)} />
          <Row k="Commercial jobs" v={fmt(s.stats.commercialJobs)} />
          <Row k="Industrial jobs" v={fmt(s.stats.industrialJobs)} />
          <Row k="Other jobs" v={fmt(s.stats.otherJobs)} />
          <Row k="Buildings" v={fmt(s.stats.buildings)} />
          <Row k="Road tiles" v={fmt(s.stats.roadTiles)} />
          <Row k="Zoned R / C / I" v={`${fmt(s.stats.zonedRes)} / ${fmt(s.stats.zonedCom)} / ${fmt(s.stats.zonedInd)}`} />
          <Row k="Map" v={`${s.mapSize} × ${s.mapSize} tiles`} />
          {s.settings.showPerf && <Row k="Render (CPU)" v={`${s.frameMs.toFixed(1)} ms`} />}
        </div>
      )}

      <div className="camctl">
        <button onClick={() => game.camera('zoomIn')} aria-label="Zoom in">{Icon.plus}</button>
        <button onClick={() => game.camera('zoomOut')} aria-label="Zoom out">{Icon.minus}</button>
        <button onClick={() => game.camera('rotL')} aria-label="Rotate left">{Icon.rotL}</button>
        <button onClick={() => game.camera('rotR')} aria-label="Rotate right">{Icon.rotR}</button>
        <button onClick={() => game.camera('tiltUp')} aria-label="Tilt up">{Icon.up}</button>
        <button onClick={() => game.camera('tiltDown')} aria-label="Tilt down">{Icon.down}</button>
        <button onClick={() => game.camera('reset')} aria-label="Reset view">{Icon.home}</button>
      </div>

      <div className="bottom">
        {s.hint && <div className={`hint ${s.hint.ok ? '' : 'bad'}`}>{s.hint.text}</div>}
        {s.tool === 'place' && (
          <div className="subbar">
            {PLACEABLE_TYPES.map((t) => {
              const d = BUILDING_DEFS[t];
              return (
                <button key={t} className={s.placeType === t ? 'on' : ''} onClick={() => game.setPlaceType(t)}>
                  <span className="sb-name">{d.label}</span>
                  <span className="sb-meta">
                    {d.w}×{d.h} · {s.unlimitedMoney ? 'free' : `$${fmt(d.cost)}`}
                  </span>
                </button>
              );
            })}
          </div>
        )}
        {s.tool === 'road' && (
          <div className="subbar roadbar">
            <div className="seg" role="group" aria-label="Road type">
              {(['street', 'avenue'] as const).map((t) => (
                <button key={t} className={s.road.type === t ? 'on' : ''} onClick={() => game.setRoad({ type: t })}>
                  {t === 'street' ? 'Street' : 'Avenue'}
                </button>
              ))}
            </div>
            <div className="seg" role="group" aria-label="Road mode">
              {(['straight', 'curve', 'upgrade', 'edit'] as const).map((m) => (
                <button key={m} className={s.road.mode === m ? 'on' : ''} onClick={() => game.setRoad({ mode: m })}>
                  {m[0].toUpperCase() + m.slice(1)}
                </button>
              ))}
            </div>
            <label className="toggle compact">
              <input type="checkbox" checked={s.road.grid} onChange={(e) => game.setRoad({ grid: e.target.checked })} />
              <span>Snap to grid</span>
            </label>
          </div>
        )}
        {s.tool === 'terrain' && (
          <div className="subbar brushbar">
            {(['raise', 'lower', 'flatten', 'smooth'] as const).map((m) => (
              <button key={m} className={s.brush.mode === m ? 'on' : ''} onClick={() => game.setBrush({ mode: m })}>
                <span className="sb-name">{m[0].toUpperCase() + m.slice(1)}</span>
              </button>
            ))}
            <label className="slider">
              <span>Size {s.brush.radius}</span>
              <input type="range" min={1} max={16} value={s.brush.radius} onChange={(e) => game.setBrush({ radius: +e.target.value })} />
            </label>
            <label className="slider">
              <span>Strength {s.brush.strength}</span>
              <input type="range" min={1} max={10} value={s.brush.strength} onChange={(e) => game.setBrush({ strength: +e.target.value })} />
            </label>
          </div>
        )}
        <nav className="toolbar">
          {TOOLS.map((t) => (
            <button key={t.id} className={`tool ${t.cls ?? ''} ${s.tool === t.id ? 'on' : ''}`} onClick={() => game.setTool(t.id)}>
              {t.icon}
              <span>{t.label}</span>
            </button>
          ))}
        </nav>
      </div>

      {toastVisible && s.toast && <div className="toast">{s.toast.text}</div>}
      {panel === 'saves' && <SavePanel game={game} state={s} onClose={() => setPanel('none')} />}
      {s.bench.report && <BenchReportPanel text={s.bench.report} onClose={() => game.clearBenchReport()} />}
      {panel === 'settings' && <SettingsPanel game={game} state={s} onClose={() => setPanel('none')} />}
    </>
  );
}

function BenchReportPanel({ text, onClose }: { text: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      // Clipboard API can be blocked (e.g. inside an embedded page): select the text instead.
      ref.current?.select();
    }
  };
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Performance results">
        <div className="sheet-head">
          <h2>Performance results</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">{Icon.close}</button>
        </div>
        <textarea ref={ref} className="report" readOnly value={text} rows={14} />
        <div className="btn-row">
          <button className="primary" onClick={() => void copy()}>{copied ? 'Copied' : 'Copy results'}</button>
          <span className="muted">Paste these into the chat. Your city has been restored.</span>
        </div>
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="row">
      <span>{k}</span>
      <b>{v}</b>
    </div>
  );
}
