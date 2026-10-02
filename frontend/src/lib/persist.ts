import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from 'react';

// Page state that survives a refresh. Plain values go to localStorage;
// files (which can't be JSON-encoded) go to IndexedDB via saveFiles/loadFiles.

const PREFIX = 'sw:';

// Sets are stored as { __set: [...] } so pages can keep using them
const replacer = (_: string, v: unknown) => (v instanceof Set ? { __set: [...v] } : v);
const reviver = (_: string, v: unknown) => (v && typeof v === 'object' && '__set' in v ? new Set((v as { __set: unknown[] }).__set) : v);

export function readStored<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (raw !== null) return JSON.parse(raw, reviver) as T;
  } catch { /* ignore */ }
  return fallback;
}

export function writeStored(key: string, value: unknown) {
  try { localStorage.setItem(PREFIX + key, JSON.stringify(value, replacer)); } catch { /* ignore */ }
}

// Removes every stored key starting with `key` (e.g. a whole page's draft)
export function clearStored(key: string) {
  try {
    Object.keys(localStorage).filter((k) => k.startsWith(PREFIX + key)).forEach((k) => localStorage.removeItem(k));
  } catch { /* ignore */ }
}

// Drop-in for useState. When `key` changes (e.g. another project id) the stored value for that key is loaded.
export function usePersistentState<T>(key: string, initial: T | (() => T)): [T, Dispatch<SetStateAction<T>>] {
  const load = (k: string) => readStored<T>(k, typeof initial === 'function' ? (initial as () => T)() : initial);
  const [state, setState] = useState(() => ({ key, value: load(key) }));
  let current = state;
  if (state.key !== key) {
    current = { key, value: load(key) };
    setState(current);
  }

  useEffect(() => { writeStored(current.key, current.value); }, [current.key, current.value]);

  const set = useCallback<Dispatch<SetStateAction<T>>>((u) => setState((s) => ({
    key: s.key,
    value: typeof u === 'function' ? (u as (prev: T) => T)(s.value) : u,
  })), []);

  return [current.value, set];
}

// --- IndexedDB, for File/Blob values ---

function db() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open('skillwala', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('files');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<R>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<R>) {
  const d = await db();
  return new Promise<R>((resolve, reject) => {
    const req = run(d.transaction('files', mode).objectStore('files'));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export const saveFiles = (key: string, value: unknown) => tx('readwrite', (s) => s.put(value, PREFIX + key)).catch(() => undefined);
export const loadFiles = <T,>(key: string) => tx<T | undefined>('readonly', (s) => s.get(PREFIX + key)).catch(() => undefined);
export const clearFiles = (key: string) => tx('readwrite', (s) => s.delete(PREFIX + key)).catch(() => undefined);
