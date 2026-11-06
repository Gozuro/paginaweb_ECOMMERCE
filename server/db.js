/* Base de datos compatible con local (node:sqlite) y serverless en la nube (Turso / @libsql/client).
   - En Vercel / producción (con TURSO_DATABASE_URL): usa @libsql/client para conectarse a Turso.
   - En local / pruebas (sin TURSO_DATABASE_URL): usa node:sqlite nativo (sin dependencias). */
const path = require('path');
const fs = require('fs');
const { AsyncLocalStorage } = require('node:async_hooks');
const { CATALOG } = require('./catalog');

const txStorage = new AsyncLocalStorage();
const isTurso = !!process.env.TURSO_DATABASE_URL;

let tursoClient = null;
let localDb = null;
let initPromise = null;

const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS stock (
    product_id TEXT PRIMARY KEY,
    qty INTEGER NOT NULL CHECK (qty >= 0),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    folio TEXT UNIQUE,
    status TEXT NOT NULL DEFAULT 'pendiente'
      CHECK (status IN ('pendiente','pagado','en_produccion','enviado','entregado','cancelado')),
    email TEXT NOT NULL, first_name TEXT NOT NULL, last_name TEXT NOT NULL, phone TEXT NOT NULL,
    address TEXT NOT NULL, city TEXT NOT NULL, state TEXT NOT NULL, zip TEXT NOT NULL,
    pay_method TEXT NOT NULL CHECK (pay_method IN ('card','oxxo','spei')),
    promo_code TEXT, subtotal INTEGER NOT NULL, discount INTEGER NOT NULL,
    shipping INTEGER NOT NULL, total INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK (kind IN ('stock','custom')),
    product_id TEXT, name TEXT NOT NULL, cut TEXT NOT NULL, color TEXT NOT NULL,
    size TEXT NOT NULL, qty INTEGER NOT NULL CHECK (qty > 0), unit_price INTEGER NOT NULL,
    text TEXT, font_id TEXT, text_color TEXT, preset_key TEXT, notes TEXT, thumb TEXT
  );

  CREATE TABLE IF NOT EXISTS checkout_sessions (
    session_id TEXT PRIMARY KEY,
    payload TEXT NOT NULL,
    folio TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status, created_at);
`;

function getLocalDb() {
  if (localDb) return localDb;
  const { DatabaseSync } = require('node:sqlite');
  const DIR = path.join(__dirname, 'data');
  fs.mkdirSync(DIR, { recursive: true });
  localDb = new DatabaseSync(path.join(DIR, 'trama.db'));
  localDb.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  localDb.exec(SCHEMA_SQL);
  const seed = localDb.prepare('INSERT OR IGNORE INTO stock (product_id, qty) VALUES (?, ?)');
  for (const p of CATALOG.PRODUCTS) seed.run(p.id, p.stock);
  return localDb;
}

function getTursoClient() {
  if (tursoClient) return tursoClient;
  const { createClient } = require('@libsql/client');
  tursoClient = createClient({
    url: process.env.TURSO_DATABASE_URL,
    authToken: process.env.TURSO_AUTH_TOKEN
  });
  return tursoClient;
}

async function ensureInit() {
  if (isTurso) {
    if (!initPromise) {
      initPromise = (async () => {
        const c = getTursoClient();
        await c.execute('PRAGMA foreign_keys = ON;');
        await c.executeMultiple(SCHEMA_SQL);
        for (const p of CATALOG.PRODUCTS) {
          await c.execute({
            sql: 'INSERT OR IGNORE INTO stock (product_id, qty) VALUES (?, ?)',
            args: [p.id, p.stock]
          });
        }
      })();
    }
    return initPromise;
  }
  getLocalDb();
}

const sanitize = args => (args || []).map(a => (a === undefined ? null : a));

async function get(sql, ...args) {
  await ensureInit();
  if (isTurso) {
    const executor = txStorage.getStore() || getTursoClient();
    const res = await executor.execute({ sql, args: sanitize(args) });
    return res.rows[0];
  }
  return getLocalDb().prepare(sql).get(...args);
}

async function all(sql, ...args) {
  await ensureInit();
  if (isTurso) {
    const executor = txStorage.getStore() || getTursoClient();
    const res = await executor.execute({ sql, args: sanitize(args) });
    return res.rows;
  }
  return getLocalDb().prepare(sql).all(...args);
}

async function run(sql, ...args) {
  await ensureInit();
  if (isTurso) {
    const executor = txStorage.getStore() || getTursoClient();
    const res = await executor.execute({ sql, args: sanitize(args) });
    return {
      changes: Number(res.rowsAffected || 0),
      lastInsertRowid: res.lastInsertRowid !== undefined ? Number(res.lastInsertRowid) : 0
    };
  }
  const r = getLocalDb().prepare(sql).run(...args);
  return { changes: Number(r.changes || 0), lastInsertRowid: Number(r.lastInsertRowid || 0) };
}

async function exec(sql) {
  await ensureInit();
  if (isTurso) {
    const executor = txStorage.getStore() || getTursoClient();
    return executor.executeMultiple(sql);
  }
  return getLocalDb().exec(sql);
}

function prepare(sql) {
  return {
    get: (...args) => get(sql, ...args),
    all: (...args) => all(sql, ...args),
    run: (...args) => run(sql, ...args)
  };
}

async function tx(fn) {
  await ensureInit();
  if (isTurso) {
    const existing = txStorage.getStore();
    if (existing) return fn();
    const transaction = await getTursoClient().transaction('write');
    return txStorage.run(transaction, async () => {
      try {
        const result = await fn();
        await transaction.commit();
        return result;
      } catch (e) {
        try { await transaction.rollback(); } catch (_) {}
        throw e;
      }
    });
  }

  const db = getLocalDb();
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = await fn();
    db.exec('COMMIT');
    return result;
  } catch (e) {
    try { db.exec('ROLLBACK'); } catch (_) {}
    throw e;
  }
}

function close() {
  if (tursoClient) {
    try { tursoClient.close(); } catch (_) {}
    tursoClient = null;
    initPromise = null;
  }
  if (localDb) {
    try { localDb.close(); } catch (_) {}
    localDb = null;
  }
}

const db = { get, all, run, exec, prepare, close };

module.exports = { db, tx, ensureInit };
