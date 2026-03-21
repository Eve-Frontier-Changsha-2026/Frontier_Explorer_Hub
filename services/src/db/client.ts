import Database from 'better-sqlite3';
import { initSchema } from './schema.js';

let _db: Database.Database | null = null;

export function getDb(dbPath = 'explorer-hub.db'): Database.Database {
  if (_db) return _db;

  _db = new Database(dbPath);
  _db.pragma('journal_mode = WAL');
  _db.pragma('busy_timeout = 5000');
  _db.pragma('synchronous = NORMAL');
  _db.pragma('foreign_keys = ON');

  initSchema(_db);
  return _db;
}

export function closeDb(): void {
  if (_db) {
    _db.close();
    _db = null;
  }
}

/** Create an in-memory DB for testing */
export function getTestDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  initSchema(db);
  return db;
}
