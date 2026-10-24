import Database from 'better-sqlite3';
import path from 'path';

let dbInstance: Database.Database | null = null;

export function getCreditDatabase(dbPath?: string): Database.Database {
  if (dbInstance && !dbPath) {
    return dbInstance;
  }

  const resolvedPath =
    dbPath ||
    process.env.SQLITE_CREDIT_DB_PATH ||
    path.resolve(process.cwd(), 'credit_service.db');

  const db = new Database(resolvedPath);
  db.pragma('journal_mode = WAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS credit_evaluations (
      id TEXT PRIMARY KEY,
      application_id TEXT NOT NULL,
      applicant_id TEXT NOT NULL,
      score INTEGER NOT NULL,
      decision TEXT NOT NULL,
      risk_tier TEXT NOT NULL,
      dti_ratio REAL NOT NULL,
      max_approved_amount REAL NOT NULL,
      recommended_rate REAL NOT NULL,
      reason_codes TEXT NOT NULL,
      correlation_id TEXT,
      evaluated_at TEXT NOT NULL
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
