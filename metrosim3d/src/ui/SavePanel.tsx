import { useEffect, useState } from 'react';
import type { Game, UiState } from '../game/Game';
import { MapSizeId, MAP_SIZES } from '../sim/constants';
import { deleteCity, SaveMeta } from '../storage/saves';
import { Icon } from './icons';

export function SavePanel({ game, state, onClose }: { game: Game; state: UiState; onClose: () => void }) {
  const [saves, setSaves] = useState<SaveMeta[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [name, setName] = useState(state.cityName);
  const [newName, setNewName] = useState('');
  const [size, setSize] = useState<MapSizeId>('large');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [confirmNew, setConfirmNew] = useState(false);

  const refresh = () =>
    game
      .listSaves()
      .then(setSaves)
      .catch((e: Error) => setErr(`Storage unavailable: ${e.message}`));
  useEffect(() => {
    void refresh();
  }, []);

  const doSave = async (asNew: boolean) => {
    if (name.trim() && name.trim() !== state.cityName) game.renameCity(name);
    await game.save(asNew);
    await refresh();
  };

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Cities">
        <div className="sheet-head">
          <h2>Cities</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">{Icon.close}</button>
        </div>

        <section>
          <label className="field">
            <span>City name</span>
            <input value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
          </label>
          <div className="btn-row">
            <button className="primary" onClick={() => void doSave(false)}>
              {state.saveId ? 'Save' : 'Save city'}
            </button>
            {state.saveId && <button onClick={() => void doSave(true)}>Save as copy</button>}
          </div>
          <p className="muted">
            {state.lastSavedAt ? `Last saved ${new Date(state.lastSavedAt).toLocaleTimeString()}. ` : ''}
            Autosaves every minute and when the app is hidden.
          </p>
        </section>

        <section>
          <h3>Saved cities</h3>
          {err && <p className="error">{err}</p>}
          {!saves && !err && <p className="muted">Loading…</p>}
          {saves && saves.length === 0 && <p className="muted">No saved cities yet.</p>}
          <ul className="saves">
            {saves?.map((m) => (
              <li key={m.id} className={m.id === state.saveId ? 'current' : ''}>
                <div className="save-info">
                  <b>{m.autosave ? `${m.name} (autosave)` : m.name}</b>
                  <span className="muted">
                    Pop. {m.population.toLocaleString('en-US')} · {m.size}×{m.size} · {new Date(m.savedAt).toLocaleString()}
                  </span>
                </div>
                <div className="btn-row">
                  <button
                    onClick={async () => {
                      await game.load(m.id);
                      onClose();
                    }}
                  >
                    Load
                  </button>
                  {confirmDelete === m.id ? (
                    <button
                      className="danger"
                      onClick={async () => {
                        await deleteCity(m.id);
                        setConfirmDelete(null);
                        await refresh();
                      }}
                    >
                      Confirm
                    </button>
                  ) : (
                    <button onClick={() => setConfirmDelete(m.id)}>Delete</button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h3>New city</h3>
          <label className="field">
            <span>Name</span>
            <input value={newName} placeholder="New City" maxLength={40} onChange={(e) => setNewName(e.target.value)} />
          </label>
          <div className="seg wide" role="group" aria-label="Map size">
            {(Object.keys(MAP_SIZES) as MapSizeId[]).map((k) => (
              <button key={k} className={size === k ? 'on' : ''} onClick={() => setSize(k)}>
                {k[0].toUpperCase() + k.slice(1)} · {((MAP_SIZES[k] * 8) / 1000).toFixed(1)} km
              </button>
            ))}
          </div>
          <div className="btn-row">
            {confirmNew ? (
              <>
                <button
                  className="primary"
                  onClick={() => {
                    game.newCity(size, newName || 'New City');
                    onClose();
                  }}
                >
                  Start new city
                </button>
                <button onClick={() => setConfirmNew(false)}>Cancel</button>
                <span className="muted">Unsaved changes to the current city will be lost.</span>
              </>
            ) : (
              <button onClick={() => setConfirmNew(true)}>New city…</button>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
