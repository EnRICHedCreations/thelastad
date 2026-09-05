import { DatabaseSync } from 'node:sqlite';
import { Pool } from 'pg';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

export const dataDir = resolve(process.env.DATA_DIR || './data');
mkdirSync(dataDir, { recursive: true });
export const postgres = Boolean(process.env.DATABASE_URL);
const pool = postgres ? new Pool({ connectionString: process.env.DATABASE_URL, max: 8 }) : null;
const sqlite = postgres ? null : new DatabaseSync(resolve(dataDir, 'last-ad.sqlite'));
if (sqlite) sqlite.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
const convert = sql => { let i = 0; return sql.replace(/\?/g, () => `$${++i}`); };
function runner(client) {
  return async (sql, values = []) => {
    if (postgres) return (await client.query(convert(sql), values)).rows;
    const stmt = sqlite.prepare(sql);
    return stmt.columns().length ? stmt.all(...values) : (stmt.run(...values), []);
  };
}
export const q = runner(pool);
let chain = Promise.resolve();
export function tx(fn) {
  const job = chain.then(async () => {
    const client = postgres ? await pool.connect() : null;
    const query = runner(client);
    try {
      if (postgres) await client.query('BEGIN'); else sqlite.exec('BEGIN IMMEDIATE');
      await query('UPDATE app_lock SET version=version+1 WHERE id=1');
      const result = await fn(query);
      if (postgres) await client.query('COMMIT'); else sqlite.exec('COMMIT');
      return result;
    } catch (e) {
      if (postgres) await client.query('ROLLBACK'); else sqlite.exec('ROLLBACK');
      throw e;
    } finally { client?.release(); }
  });
  chain = job.catch(() => {});
  return job;
}
export async function migrate() {
  const statements = [
    'CREATE TABLE IF NOT EXISTS app_lock (id INTEGER PRIMARY KEY, version BIGINT NOT NULL)',
    'INSERT INTO app_lock(id,version) VALUES(1,0) ON CONFLICT(id) DO NOTHING',
    'CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)',
    'CREATE TABLE IF NOT EXISTS sponsors (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, password TEXT NOT NULL, created_at BIGINT NOT NULL)',
    'CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, sponsor_id TEXT NOT NULL, expires_at BIGINT NOT NULL)',
    `CREATE TABLE IF NOT EXISTS placements (id TEXT PRIMARY KEY, sponsor_id TEXT, name TEXT NOT NULL, headline TEXT NOT NULL, description TEXT NOT NULL, url TEXT NOT NULL, image TEXT NOT NULL DEFAULT '', theme TEXT NOT NULL DEFAULT 'red', status TEXT NOT NULL, allowance INTEGER NOT NULL DEFAULT 500, remaining INTEGER NOT NULL DEFAULT 500, refilled INTEGER NOT NULL DEFAULT 0, complimentary INTEGER NOT NULL DEFAULT 0, house INTEGER NOT NULL DEFAULT 0, clicks INTEGER NOT NULL DEFAULT 0, views INTEGER NOT NULL DEFAULT 0, created_at BIGINT NOT NULL, queued_at BIGINT, started_at BIGINT, ended_at BIGINT, expires_at BIGINT, reason TEXT NOT NULL DEFAULT '', moderation_note TEXT NOT NULL DEFAULT '')`,
    'CREATE INDEX IF NOT EXISTS placements_status ON placements(status,queued_at)',
    "CREATE UNIQUE INDEX IF NOT EXISTS one_live_placement ON placements(status) WHERE status='live'",
    'CREATE TABLE IF NOT EXISTS audience (placement_id TEXT NOT NULL, visitor TEXT NOT NULL, action TEXT NOT NULL, created_at BIGINT NOT NULL, PRIMARY KEY(placement_id,visitor,action))',
    'CREATE TABLE IF NOT EXISTS payments (id TEXT PRIMARY KEY, placement_id TEXT NOT NULL, sponsor_id TEXT NOT NULL, purpose TEXT NOT NULL, amount INTEGER NOT NULL, state TEXT NOT NULL, session_id TEXT, checkout_url TEXT, intent_id TEXT, created_at BIGINT NOT NULL)',
    'CREATE TABLE IF NOT EXISTS payment_events (id TEXT PRIMARY KEY, created_at BIGINT NOT NULL)',
    'CREATE TABLE IF NOT EXISTS audit (id TEXT PRIMARY KEY, action TEXT NOT NULL, placement_id TEXT, detail TEXT NOT NULL, created_at BIGINT NOT NULL)',
    'CREATE TABLE IF NOT EXISTS outbox (id TEXT PRIMARY KEY, recipient TEXT NOT NULL, subject TEXT NOT NULL, body TEXT NOT NULL, state TEXT NOT NULL, created_at BIGINT NOT NULL)',
    'CREATE TABLE IF NOT EXISTS assets (id TEXT PRIMARY KEY, sponsor_id TEXT NOT NULL, content TEXT NOT NULL, created_at BIGINT NOT NULL)',
    'CREATE TABLE IF NOT EXISTS resets (token TEXT PRIMARY KEY, sponsor_id TEXT NOT NULL, expires_at BIGINT NOT NULL)'
  ];
  for (const sql of statements) await q(sql);
}
