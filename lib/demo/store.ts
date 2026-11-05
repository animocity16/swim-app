// lib/demo/store.ts
//
// The demo's "database": plain tables held in memory and mirrored into this
// tab's sessionStorage so a refresh keeps the visitor's changes. It never
// touches the network. A new tab (or exiting and re-entering the demo) starts
// from the original sample data.

import { DEMO_DATA_STORAGE_KEY } from "./demoMode";
import { buildSeed } from "./seed";

export type Row = Record<string, unknown>;

export type DemoDb = {
  tables: Record<string, Row[]>;
  seq: Record<string, number>; // next auto id per table
  meta: Record<string, unknown>; // user metadata (theme, language...) and seed info
};

let cache: DemoDb | null = null;
const listeners = new Set<() => void>();

export function getDb(): DemoDb {
  if (cache) return cache;
  try {
    const raw = window.sessionStorage.getItem(DEMO_DATA_STORAGE_KEY);
    if (raw) cache = JSON.parse(raw) as DemoDb;
  } catch {
    cache = null;
  }
  if (!cache) {
    cache = buildSeed();
    persist();
  }
  return cache;
}

export function persist(): void {
  if (!cache) return;
  try {
    window.sessionStorage.setItem(DEMO_DATA_STORAGE_KEY, JSON.stringify(cache));
  } catch {
    /* quota or blocked storage: keep working from memory */
  }
  listeners.forEach((l) => l());
}

export function resetDb(): void {
  cache = null;
  try {
    window.sessionStorage.removeItem(DEMO_DATA_STORAGE_KEY);
  } catch {
    /* nothing to clear */
  }
}

export function nextId(db: DemoDb, table: string): number {
  const current = db.seq[table] ?? 1;
  db.seq[table] = current + 1;
  return current;
}

export function onDbChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
