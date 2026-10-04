/* db.js — IndexedDB wrapper for FLOUSY (offline-first storage) */

const DB_NAME = 'flosy';
const DB_VERSION = 1;
const STORES = ['transactions', 'accounts', 'categories', 'budgets', 'goals', 'bills', 'recurring', 'settings'];

let _db = null;
let _openPromise = null;

export function uid() {
  try {
    if (crypto && crypto.randomUUID) return crypto.randomUUID();
  } catch { /* ignore */ }
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function openDB() {
  if (_db) return Promise.resolve(_db);
  if (_openPromise) return _openPromise;
  _openPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('transactions')) {
        const s = db.createObjectStore('transactions', { keyPath: 'id' });
        s.createIndex('date', 'date');
        s.createIndex('type', 'type');
        s.createIndex('accountId', 'accountId');
        s.createIndex('categoryId', 'categoryId');
        s.createIndex('createdAt', 'createdAt');
      }
      for (const name of ['accounts', 'categories', 'budgets', 'goals', 'bills', 'recurring']) {
        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('settings')) db.createObjectStore('settings', { keyPath: 'key' });
    };
    req.onsuccess = () => {
      _db = req.result;
      resolve(_db);
    };
    req.onerror = () => reject(req.error || new Error('IndexedDB open failed'));
  });
  _openPromise.catch(() => { _openPromise = null; });
  return _openPromise;
}

function tx(stores, mode = 'readonly') {
  return openDB().then((db) => db.transaction(stores, mode));
}

function toPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('IDB error'));
  });
}

export function getAll(store) {
  return tx([store]).then((t) => toPromise(t.objectStore(store).getAll()));
}

export function get(store, id) {
  return tx([store]).then((t) => toPromise(t.objectStore(store).get(id)));
}

export function put(store, value) {
  return tx([store], 'readwrite').then((t) => toPromise(t.objectStore(store).put(value)));
}

export function bulkPut(store, values) {
  return tx([store], 'readwrite').then((t) => {
    const os = t.objectStore(store);
    for (const v of values) os.put(v);
    if (t.done) return t.done;
    return new Promise((resolve, reject) => {
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error || new Error('IDB bulk write failed'));
    });
  });
}

export function del(store, id) {
  return tx([store], 'readwrite').then((t) => toPromise(t.objectStore(store).delete(id)));
}

export function clearStore(store) {
  return tx([store], 'readwrite').then((t) => toPromise(t.objectStore(store).clear()));
}

export function getSettings() {
  return openDB().then((db) => new Promise((resolve) => {
    const out = {};
    db.transaction('settings', 'readonly').objectStore('settings').getAll().onsuccess = (e) => {
      for (const row of e.target.result || []) out[row.key] = row.value;
      resolve(out);
    };
    db.transaction('settings', 'readonly').onerror = () => resolve(out);
  }));
}

export function setSetting(key, value) {
  return openDB().then((db) => new Promise((resolve) => {
    const t = db.transaction('settings', 'readwrite');
    const os = t.objectStore('settings');
    if (value === undefined || value === null) os.delete(key);
    else os.put({ key, value });
    t.oncomplete = () => resolve();
    t.onerror = () => resolve();
  }));
}

export async function setSettings(pairs) {
  for (const [k, v] of Object.entries(pairs)) await setSetting(k, v);
}

/** Wipe all data (all stores). */
export async function clearAll() {
  for (const s of STORES) await clearStore(s);
}

/** Load every collection in one pass. */
export async function loadAll() {
  const [transactions, accounts, categories, budgets, goals, bills, recurring, settings] = await Promise.all([
    getAll('transactions'),
    getAll('accounts'),
    getAll('categories'),
    getAll('budgets'),
    getAll('goals'),
    getAll('bills'),
    getAll('recurring'),
    getSettings()
  ]);
  return { transactions, accounts, categories, budgets, goals, bills, recurring, settings };
}

export async function replaceAll(data) {
  await clearAll();
  await bulkPut('transactions', data.transactions || []);
  await bulkPut('accounts', data.accounts || []);
  await bulkPut('categories', data.categories || []);
  await bulkPut('budgets', data.budgets || []);
  await bulkPut('goals', data.goals || []);
  await bulkPut('bills', data.bills || []);
  await bulkPut('recurring', data.recurring || []);
  await setSettings(data.settings || {});
}

export { STORES };
