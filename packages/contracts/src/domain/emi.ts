export interface AmortizationPeriod {
  periodMonth: number;
  openingBalance: number;
  emi: number;
  principalComponent: number;
  interestComponent: number;
  closingBalance: number;
}

export interface EmiCalculationResult {
  monthlyEmi: number;
  totalInterestPayable: number;
  totalPayment: number;
  principalAmount: number;
  tenureMonths: number;
  annualInterestRate: number;
  amortizationSchedule?: AmortizationPeriod[];
}

/**
 * Calculates Equated Monthly Installment (EMI) using the standard Reducing-Balance formula:
 * E = P * r * (1 + r)^n / ((1 + r)^n - 1)
 *
 * @param principal Principal loan amount (P > 0)
 * @param annualInterestRate Annual interest rate in percentage (e.g. 10.5 for 10.5%)
 * @param tenureMonths Loan tenure in months (n >= 1)
 * @param includeSchedule Whether to compute full month-by-month amortization schedule
 */
export function calculateEMI(
  principal: number,
  annualInterestRate: number,
  tenureMonths: number,
  includeSchedule = false,
): EmiCalculationResult {
  if (principal <= 0) {
    throw new Error('Principal amount must be greater than zero');
  }
  if (tenureMonths <= 0 || !Number.isInteger(tenureMonths)) {
    throw new Error('Tenure must be a positive integer representing months');
  }
  if (annualInterestRate < 0) {
    throw new Error('Annual interest rate cannot be negative');
  }

  // Handle 0% interest rate as special case: straight line division
  if (annualInterestRate === 0) {
    const rawEmi = principal / tenureMonths;
    const monthlyEmi = Math.round(rawEmi * 100) / 100;
    const totalPayment = principal;
    const totalInterestPayable = 0;

    let schedule: AmortizationPeriod[] | undefined;
    if (includeSchedule) {
      schedule = [];
      let balance = principal;
      for (let month = 1; month <= tenureMonths; month++) {
        const principalComp = month === tenureMonths ? balance : monthlyEmi;
        const closing = Math.max(0, Math.round((balance - principalComp) * 100) / 100);
        schedule.push({
          periodMonth: month,
          openingBalance: balance,
          emi: principalComp,
          principalComponent: principalComp,
          interestComponent: 0,
          closingBalance: closing,
        });
        balance = closing;
      }
    }

    return {
      monthlyEmi,
      totalInterestPayable,
      totalPayment,
      principalAmount: principal,
      tenureMonths,
      annualInterestRate,
      amortizationSchedule: schedule,
    };
  }

  const monthlyRate = annualInterestRate / 12 / 100;
  const factor = Math.pow(1 + monthlyRate, tenureMonths);
  const rawEmi = (principal * monthlyRate * factor) / (factor - 1);
  const monthlyEmi = Math.round(rawEmi * 100) / 100;

  let schedule: AmortizationPeriod[] | undefined;
  let totalInterest = 0;

  if (includeSchedule) {
    schedule = [];
    let currentBalance = principal;

    for (let month = 1; month <= tenureMonths; month++) {
      const interestComp = Math.round(currentBalance * monthlyRate * 100) / 100;
      let principalComp = Math.round((monthlyEmi - interestComp) * 100) / 100;

      // Adjust last month rounding differences
      if (month === tenureMonths) {
        principalComp = currentBalance;
      }

      const closingBalance = Math.max(0, Math.round((currentBalance - principalComp) * 100) / 100);
      totalInterest += interestComp;

      schedule.push({
        periodMonth: month,
        openingBalance: currentBalance,
        emi: Math.round((principalComp + interestComp) * 100) / 100,
        principalComponent: principalComp,
        interestComponent: interestComp,
        closingBalance,
      });

      currentBalance = closingBalance;
    }
    totalInterest = Math.round(totalInterest * 100) / 100;
  } else {
    totalInterest = Math.round((monthlyEmi * tenureMonths - principal) * 100) / 100;
  }

  const totalPayment = Math.round((principal + totalInterest) * 100) / 100;

  return {
    monthlyEmi,
    totalInterestPayable: totalInterest,
    totalPayment,
    principalAmount: principal,
    tenureMonths,
    annualInterestRate,
    amortizationSchedule: schedule,
  };
}
