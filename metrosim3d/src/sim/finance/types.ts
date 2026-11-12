/**
 * Finance system interfaces (spec §8). Phase 2a ships the Treasury and ledger that construction
 * already posts to; revenue/expense sources, loans and reports are implemented in Phase 4 against
 * these types, so nothing here needs rewriting later.
 *
 * All amounts are whole dollars (integers) so results are exact and deterministic.
 */

export type RevenueCategory =
  | 'tax.residential'
  | 'tax.commercial'
  | 'tax.industrial'
  | 'utilities'
  | 'transport'
  | 'tourism'
  | 'other';

export type ExpenseCategory =
  | 'construction.roads'
  | 'construction.zoning'
  | 'construction.buildings'
  | 'construction.terrain'
  | 'construction.demolition'
  | 'maintenance'
  | 'healthcare'
  | 'education'
  | 'emergency'
  | 'transport'
  | 'utilities'
  | 'salaries'
  | 'loan.interest'
  | 'loan.principal';

export type BudgetKind = 'operating' | 'capital';

export interface Transaction {
  /** Simulation day the transaction happened. */
  day: number;
  /** Positive = money in, negative = money out. Whole dollars. */
  amount: number;
  category: RevenueCategory | ExpenseCategory | 'loan.proceeds';
  budget: BudgetKind;
  memo?: string;
}

/** Per-month totals by category; the ledger keeps these instead of every transaction. */
export interface MonthTotals {
  month: number;
  opening: number;
  closing: number;
  byCategory: Record<string, number>;
}

/** Phase 4: a recurring income or cost computed from the city each month. */
export interface FinanceSource {
  id: string;
  /** Entries for the month that just ended; must be a pure function of the world state. */
  monthly(month: number): Omit<Transaction, 'day'>[];
}

/** Phase 4: what the bank offers. */
export interface LoanProduct {
  id: string;
  label: string;
  maxPrincipal: number;
  /** Annual interest rate in basis points (e.g. 450 = 4.50%). Integer for determinism. */
  annualRateBp: number;
  termMonths: number[];
}

/** Phase 4: an outstanding loan. */
export interface Loan {
  id: number;
  productId: string;
  principal: number;
  annualRateBp: number;
  termMonths: number;
  startMonth: number;
  balance: number;
  /** Optional link to an infrastructure project it financed. */
  projectId?: number;
}

/** Phase 4: a major project financed by funds, loans or both, with its tracked returns. */
export interface ProjectFinancing {
  id: number;
  label: string;
  capitalCost: number;
  fromTreasury: number;
  loanIds: number[];
  monthlyOperatingCost: number;
  /** Revenue attributed to the project since completion. */
  attributedRevenue: number;
}

/** Save-format block for everything financial (save version 2+). */
export interface FinanceData {
  balance: number;
  months: MonthTotals[];
  loans: Loan[];
  nextLoanId: number;
  /** Bankruptcy is optional (spec §8.6); off unless the player enables it. */
  bankruptcyEnabled: boolean;
}
