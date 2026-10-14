const DB = "relay-carts";
const STORE = "carts";

export const MAX_CARTS = 12;

/** A game someone loaded from their own disk, kept in this browser's IndexedDB and nowhere else. */
export interface Cart {
  /** the file's name and size, so the same file put on the shelf twice stays one cartridge */
  id: string;
  title: string;
  size: number;
  at: number;
  rom: ArrayBuffer;
}

function open(): Promise<IDBDatabase | null> {
  return new Promise((done) => {
    try {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "id" });
      req.onsuccess = () => done(req.result);
      req.onerror = () => done(null);
      req.onblocked = () => done(null);
    } catch {
      done(null);
    }
  });
}

type Done<T> = { ok: boolean; v?: T };

async function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<Done<T>> {
  const db = await open();
  if (!db) return { ok: false };
  return new Promise((done) => {
    const end = (r: Done<T>) => {
      db.close();
      done(r);
    };
    try {
      const tx = db.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      tx.oncomplete = () => end({ ok: true, v: req.result });
      tx.onerror = () => end({ ok: false });
      tx.onabort = () => end({ ok: false });
    } catch {
      end({ ok: false });
    }
  });
}

/** Newest first; empty when this browser keeps no storage. */
export async function listCarts(): Promise<Cart[]> {
  const r = await run<Cart[]>("readonly", (s) => s.getAll());
  return (r.v ?? []).sort((a, b) => b.at - a.at);
}

/** Puts a file on the shelf, or moves it to the front when it is there already. full: the shelf has no room left. */
export async function keepCart(title: string, file: File): Promise<"ok" | "full" | "fail"> {
  const id = `${title}:${file.size}`;
  const have = await listCarts();
  if (!have.some((c) => c.id === id) && have.length >= MAX_CARTS) return "full";
  const rom = await file.arrayBuffer().catch(() => null);
  if (!rom) return "fail";
  const cart: Cart = { id, title, size: file.size, at: Date.now(), rom };
  const r = await run("readwrite", (s) => s.put(cart));
  return r.ok ? "ok" : "fail";
}

export async function dropCart(id: string): Promise<boolean> {
  return (await run("readwrite", (s) => s.delete(id))).ok;
}
