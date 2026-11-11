import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { snapshot, restore } from '../src/sim/serialize';
import { deleteCity, listSaves, loadCity, newSaveId, saveCity } from '../src/storage/saves';
import { World } from '../src/sim/world';
import { commitAction } from '../src/sim/tools';

describe('IndexedDB saves', () => {
  it('saves, lists, loads and deletes a city', async () => {
    const w = new World(32, 5, 'Stored');
    commitAction(w, { type: 'road', from: { x: 10, y: 12 }, to: { x: 20, y: 12 } });
    const id = newSaveId();
    await saveCity({ id, name: 'Stored', savedAt: 1000, population: 0, size: 32, autosave: false }, snapshot(w));
    const list = await listSaves();
    expect(list.map((s) => s.id)).toContain(id);
    const w2 = restore(await loadCity(id));
    expect(w2.kind).toEqual(w.kind);
    expect(w2.heights).toEqual(w.heights);
    await deleteCity(id);
    expect((await listSaves()).map((s) => s.id)).not.toContain(id);
    await expect(loadCity(id)).rejects.toThrow(/not found/);
  });
});
