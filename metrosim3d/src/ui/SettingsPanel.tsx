import type { Game, UiState } from '../game/Game';
import type { Quality } from '../render/quality';
import { Icon } from './icons';

export function SettingsPanel({ game, state, onClose }: { game: Game; state: UiState; onClose: () => void }) {
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Settings">
        <div className="sheet-head">
          <h2>Settings</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">{Icon.close}</button>
        </div>
        <section>
          <h3>Creative mode</h3>
          <label className="toggle">
            <input type="checkbox" checked={state.unlimitedMoney} onChange={(e) => game.setUnlimitedMoney(e.target.checked)} />
            <span>Unlimited money</span>
          </label>
          <p className="muted">
            Off: construction costs money from the city's funds (${Math.round(state.money).toLocaleString('en-US')}). There is no
            income yet — taxes arrive with the economy phase.
          </p>
        </section>
        <section>
          <h3>Graphics quality</h3>
          <div className="seg wide" role="group" aria-label="Graphics quality">
            {(['low', 'medium', 'high'] as Quality[]).map((q) => (
              <button key={q} className={state.settings.quality === q ? 'on' : ''} onClick={() => game.updateSettings({ quality: q })}>
                {q[0].toUpperCase() + q.slice(1)}
              </button>
            ))}
          </div>
          <p className="muted">
            Low: no shadows, fewer trees, 1× resolution. Medium: soft shadows, 1.5× resolution (iPad default). High: sharper
            shadows, 2× resolution. Anti-aliasing changes apply after reloading.
          </p>
          <label className="toggle">
            <input type="checkbox" checked={state.settings.showPerf} onChange={(e) => game.updateSettings({ showPerf: e.target.checked })} />
            <span>Show render time in statistics</span>
          </label>
        </section>
        <section>
          <h3>Controls</h3>
          <ul className="help">
            <li><b>Touch:</b> one finger uses the selected tool (Move tool: pans). Two fingers: drag to pan, pinch to zoom, twist to rotate. Tilt with the ▲▼ buttons.</li>
            <li><b>Mouse:</b> left button uses the tool, right-drag rotates/tilts, middle-drag or Shift+drag pans, wheel zooms.</li>
            <li><b>Keys:</b> WASD/arrows pan, Q/E rotate, R/F tilt, +/− zoom.</li>
            <li>Roads: drag from start to end (L-shaped). Zones and bulldozer: drag a rectangle. Buildings: drag to position, lift to place.</li>
            <li>Zoned land within 2 tiles of a road grows buildings while time runs.</li>
          </ul>
        </section>
      </div>
    </div>
  );
}
