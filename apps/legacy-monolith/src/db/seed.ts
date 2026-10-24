import { Database } from 'better-sqlite3';

export function seedLegacyDatabase(db: Database) {
  const count = db.prepare('SELECT COUNT(*) as count FROM applications').get() as { count: number };
  if (count.count > 0) {
    return;
  }

  const now = new Date().toISOString();

  const insertApp = db.prepare(`
    INSERT INTO applications (
      id, applicant_id, applicant_name, applicant_email, applicant_income, existing_emi,
      amount, tenure_months, interest_rate, monthly_emi, purpose, status,
      credit_score, rejection_reason, disbursement_ref, created_at, updated_at
    ) VALUES (
      @id, @applicant_id, @applicant_name, @applicant_email, @applicant_income, @existing_emi,
      @amount, @tenure_months, @interest_rate, @monthly_emi, @purpose, @status,
      @credit_score, @rejection_reason, @disbursement_ref, @created_at, @updated_at
    )
  `);

  const sampleApplications = [
    {
      id: 'app-seed-001',
      applicant_id: 'usr-corp-101',
      applicant_name: 'Apex Industrial Logistics',
      applicant_email: 'finance@apexlogistics.com',
      applicant_income: 180000,
      existing_emi: 15000,
      amount: 500000,
      tenure_months: 36,
      interest_rate: 9.5,
      monthly_emi: 16016.15,
      purpose: 'BUSINESS_EXPANSION',
      status: 'DISBURSED',
      credit_score: 820,
      rejection_reason: null,
      disbursement_ref: 'DISB-SEED-101',
      created_at: now,
      updated_at: now,
    },
    {
      id: 'app-seed-002',
      applicant_id: 'usr-corp-102',
      applicant_name: 'Beacon Health Systems',
      applicant_email: 'treasury@beaconhealth.org',
      applicant_income: 95000,
      existing_emi: 22000,
      amount: 250000,
      tenure_months: 24,
      interest_rate: 10.5,
      monthly_emi: 11598.63,
      purpose: 'DEBT_CONSOLIDATION',
      status: 'APPROVED',
      credit_score: 710,
      rejection_reason: null,
      disbursement_ref: null,
      created_at: now,
      updated_at: now,
    },
    {
      id: 'app-seed-003',
      applicant_id: 'usr-corp-103',
      applicant_name: 'Vanguard Retail Holdings',
      applicant_email: 'credit@vanguardretail.net',
      applicant_income: 22000,
      existing_emi: 12000,
      amount: 400000,
      tenure_months: 12,
      interest_rate: 12.0,
      monthly_emi: 35540.32,
      purpose: 'HOME_IMPROVEMENT',
      status: 'REJECTED',
      credit_score: 540,
      rejection_reason: 'INSUFFICIENT_MINIMUM_INCOME_BELOW_25000',
      disbursement_ref: null,
      created_at: now,
      updated_at: now,
    },
  ];

  const transaction = db.transaction((apps) => {
    for (const app of apps) {
      insertApp.run(app);
    }
  });

  transaction(sampleApplications);
}
