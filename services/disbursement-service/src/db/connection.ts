import Database from 'better-sqlite3';
import path from 'path';

let dbInstance: Database.Database | null = null;

export function getDisbursementDatabase(dbPath?: string): Database.Database {
  if (dbInstance && !dbPath) {
    return dbInstance;
  }

  const resolvedPath =
    dbPath ||
    process.env.SQLITE_DISBURSEMENT_DB_PATH ||
    path.resolve(process.cwd(), 'disbursement_service.db');

  const db = new Database(resolvedPath);
  db.pragma('journal_mode = WAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS disbursements (
      id TEXT PRIMARY KEY,
      application_id TEXT NOT NULL,
      amount REAL NOT NULL,
      recipient_account TEXT NOT NULL,
      bank_reference TEXT NOT NULL,
      status TEXT NOT NULL,
      failure_reason TEXT,
      retry_count INTEGER NOT NULL DEFAULT 0,
      ledger_entry_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS outbox_messages (
      id TEXT PRIMARY KEY,
      topic TEXT NOT NULL,
      payload TEXT NOT NULL,
      correlation_id TEXT NOT NULL,
      causation_id TEXT,
      status TEXT NOT NULL DEFAULT 'PENDING',
      created_at TEXT NOT NULL,
      published_at TEXT
    );

    CREATE TABLE IF NOT EXISTS processed_messages (
      message_id TEXT PRIMARY KEY,
      processed_at TEXT NOT NULL
    );
  `);

  if (!dbPath) {
    dbInstance = db;
  }

  return db;
}
