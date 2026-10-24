import Database from 'better-sqlite3';
import path from 'path';

let dbInstance: Database.Database | null = null;

export function getDatabase(dbPath?: string): Database.Database {
  if (dbInstance && !dbPath) {
    return dbInstance;
  }

  const resolvedPath = dbPath || process.env.SQLITE_DB_PATH || path.resolve(process.cwd(), 'legacy_monolith.db');
  const db = new Database(resolvedPath);

  // Enable WAL mode for concurrency
  db.pragma('journal_mode = WAL');

  // Schema creation: intentional legacy pattern with shared database for all three domains
  db.exec(`
    CREATE TABLE IF NOT EXISTS applications (
      id TEXT PRIMARY KEY,
      applicant_id TEXT NOT NULL,
      applicant_name TEXT NOT NULL,
      applicant_email TEXT NOT NULL,
      applicant_income REAL NOT NULL,
      existing_emi REAL NOT NULL,
      amount REAL NOT NULL,
      tenure_months INTEGER NOT NULL,
      interest_rate REAL NOT NULL,
      monthly_emi REAL NOT NULL,
      purpose TEXT NOT NULL,
      status TEXT NOT NULL,
      credit_score INTEGER,
      rejection_reason TEXT,
      disbursement_ref TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS credit_evaluations (
      id TEXT PRIMARY KEY,
      application_id TEXT NOT NULL,
      applicant_id TEXT NOT NULL,
      score INTEGER NOT NULL,
      decision TEXT NOT NULL,
      risk_tier TEXT NOT NULL,
      dti_ratio REAL NOT NULL,
      reason_codes TEXT NOT NULL,
      evaluated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS disbursements (
      id TEXT PRIMARY KEY,
      application_id TEXT NOT NULL,
      amount REAL NOT NULL,
      recipient_account TEXT NOT NULL,
      bank_reference TEXT NOT NULL,
      status TEXT NOT NULL,
      failure_reason TEXT,
      ledger_entry_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      action TEXT NOT NULL,
      correlation_id TEXT,
      details TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);

  if (!dbPath) {
    dbInstance = db;
  }

  return db;
}
