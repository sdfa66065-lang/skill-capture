import { DatabaseSync } from 'node:sqlite';

export type Db = DatabaseSync;

export function openDb(path: string): Db {
  const db = new DatabaseSync(path);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS users (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      device_id  TEXT NOT NULL UNIQUE,
      nickname   TEXT NOT NULL,
      coins      INTEGER NOT NULL DEFAULT 0 CHECK (coins >= 0),
      created_at INTEGER NOT NULL
    );

    -- 每一次金币变动一条流水；(reason, ref_id) 唯一，用来防止重复加扣
    CREATE TABLE IF NOT EXISTS coin_logs (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id       INTEGER NOT NULL REFERENCES users(id),
      delta         INTEGER NOT NULL,
      balance_after INTEGER NOT NULL,
      reason        TEXT NOT NULL,
      ref_id        TEXT NOT NULL,
      created_at    INTEGER NOT NULL,
      UNIQUE (reason, ref_id)
    );
    CREATE INDEX IF NOT EXISTS idx_coin_logs_user ON coin_logs (user_id, reason, created_at);
  `);
  return db;
}
