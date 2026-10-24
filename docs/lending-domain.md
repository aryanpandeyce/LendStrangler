# Lending Domain Knowledge & Mathematical Rules

This document outlines the corporate and retail banking domain principles implemented across the **LendStrangler** codebase.

---

## 1. Banking Glossary

| Term | Definition | Context in LendStrangler |
| :--- | :--- | :--- |
| **EMI (Equated Monthly Installment)** | A fixed payment amount made by a borrower to a lender at a specified date each calendar month. | Computed via the standard reducing-balance formula in `@lendstrangler/contracts`. |
| **DTI (Debt-To-Income Ratio)** | The percentage of a borrower's gross monthly income that goes toward paying debts: $\text{DTI} = \frac{\text{Total Monthly Debt}}{\text{Gross Monthly Income}}$. | Hard risk policy: $\text{DTI} > 50\%$ results in automated loan rejection. |
| **Underwriting** | The process through which a financial institution evaluates creditworthiness and assesses risk of default. | Evaluated deterministically in `credit-service` returning score (300-900), decision, and risk tier. |
| **Disbursement** | The delivery of approved funds from the lending institution into the borrower's designated bank account. | Managed by `disbursement-service` with ledger creation and bank ACH transfer simulation. |
| **LTV (Loan-To-Value)** | The ratio of a loan to the appraised value of an asset purchased. | Used in secured asset finance to cap total exposure relative to collateral value. |
| **NPA (Non-Performing Asset)** | A loan or advance for which the principal or interest payment remained overdue for a period of 90 days. | Mitigated during underwriting by enforcing strict debt service coverage and DTI limits. |
| **KYC / AML** | Know Your Customer and Anti-Money Laundering verification procedures required before account funding. | Validated at application ingress before initiating the underwriting saga. |

---

## 2. Reducing-Balance EMI Calculation Formula

LendStrangler uses the standard **Reducing-Balance (Amortizing) Formula** required by banking regulators globally, rather than predatory flat-rate interest calculations.

### 2.1 The Mathematical Formula

$$E = P \cdot r \cdot \frac{(1 + r)^n}{(1 + r)^n - 1}$$

Where:
- $E$ = Equated Monthly Installment (EMI)
- $P$ = Principal loan amount
- $r$ = Periodic monthly interest rate:
  $$r = \frac{\text{Annual Interest Rate}}{12 \times 100}$$
- $n$ = Loan tenure in months

### 2.2 Boundary & Edge Case Handling
1. **Zero Percent Interest ($r = 0$):**
   When interest is waived (promotional or subsidy schemes), the reducing-balance denominator $(1+r)^n - 1$ yields a division-by-zero ($0/0$). The implementation switches to straight-line division:
   $$E = \frac{P}{n}$$
2. **Monthly Principal & Interest Amortization:**
   For each month $t \in [1, n]$:
   - Interest Component: $I_t = \text{Balance}_{t-1} \times r$
   - Principal Component: $P_t = E - I_t$
   - Closing Balance: $\text{Balance}_t = \text{Balance}_{t-1} - P_t$
   - Final Month Adjustment: Rounding differences in the last month are applied to the final principal payment so closing balance reaches exactly `$0.00`.

---

## 3. Automated Underwriting Business Rules

The `evaluateCreditScore` engine in `@lendstrangler/contracts` applies deterministic rules:

1. **Minimum Income Threshold:**
   If $\text{monthlyIncome} < \$25,000$, application is automatically **REJECTED** with reason `INSUFFICIENT_MINIMUM_INCOME_BELOW_25000`.
2. **Maximum Debt-to-Income (DTI) Threshold:**
   If $\text{DTI} > 0.50$ (50%), application is **REJECTED** with reason `DTI_RATIO_EXCEEDS_MAXIMUM_THRESHOLD_50_PERCENT`.
3. **Credit Scoring Matrix (300 to 900):**
   - $\ge 760$ and $\text{DTI} \le 35\%$: **PRIME** tier approval; preferred interest rate ($9.0\%$).
   - $670 - 759$ and $\text{DTI} \le 45\%$: **STANDARD** tier approval; standard interest rate ($10.5\%$).
   - $600 - 669$ or borderline metrics: **MANUAL_REVIEW** with risk premium rate ($12.5\%$).
   - $< 600$: **REJECTED** with reason `CREDIT_SCORE_BELOW_MINIMUM_APPROVAL_650`.
