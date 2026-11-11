import type { CityData } from '../sim/serialize';

const DB_NAME = 'metrosim3d';
const DB_VERSION = 1;
const META = 'meta';
const DATA = 'data';

export interface SaveMeta {
  id: string;
  name: string;
  savedAt: number;
  population: number;
  size: number;
  autosave: boolean;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(META)) db.createObjectStore(META, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(DATA)) db.createObjectStore(DATA);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => {
      dbPromise = null;
      reject(req.error ?? new Error('IndexedDB unavailable'));
    };
  });
  return dbPromise;
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('Transaction aborted'));
  });
}

let persistAsked = false;
/** Ask the browser not to evict our saves under storage pressure (best effort). */
async function askPersist(): Promise<void> {
  if (persistAsked) return;
  persistAsked = true;
  try {
    if (navigator.storage?.persist) await navigator.storage.persist();
  } catch {
    /* not supported: fine */
  }
}

export function newSaveId(): string {
  return `city-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
}

export async function saveCity(meta: SaveMeta, data: CityData): Promise<void> {
  const db = await openDb();
  const tx = db.transaction([META, DATA], 'readwrite');
  tx.objectStore(META).put(meta);
  tx.objectStore(DATA).put(data, meta.id);
  await done(tx);
  if (typeof navigator !== 'undefined') void askPersist();
}

export async function listSaves(): Promise<SaveMeta[]> {
  const db = await openDb();
  const tx = db.transaction(META, 'readonly');
  const req = tx.objectStore(META).getAll();
  await done(tx);
  return (req.result as SaveMeta[]).sort((a, b) => b.savedAt - a.savedAt);
}

export async function loadCity(id: string): Promise<CityData> {
  const db = await openDb();
  const tx = db.transaction(DATA, 'readonly');
  const req = tx.objectStore(DATA).get(id);
  await done(tx);
  if (!req.result) throw new Error('Save not found');
  return req.result as CityData;
}

export async function deleteCity(id: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction([META, DATA], 'readwrite');
  tx.objectStore(META).delete(id);
  tx.objectStore(DATA).delete(id);
  await done(tx);
}

/** For tests: forget the cached connection. */
export function _resetDbForTests(): void {
  dbPromise = null;
}
