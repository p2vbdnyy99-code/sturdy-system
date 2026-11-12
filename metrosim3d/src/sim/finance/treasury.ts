import type { FinanceData, MonthTotals, Transaction } from './types';

export const DAYS_PER_MONTH = 30;
/** Months of history kept in saves (10 years). */
const HISTORY_MONTHS = 120;

export function monthOf(day: number): number {
  return Math.floor(day / DAYS_PER_MONTH);
}

/**
 * The city's funds and its ledger. Everything that moves money goes through post(), so the
 * monthly reports, budgets and loans of Phase 4 read one consistent record.
 */
export class Treasury {
  balance: number;
  months: MonthTotals[] = [];
  data: Omit<FinanceData, 'balance' | 'months'> = { loans: [], nextLoanId: 1, bankruptcyEnabled: false };

  constructor(balance: number) {
    this.balance = Math.round(balance);
  }

  private monthRecord(day: number): MonthTotals {
    const m = monthOf(day);
    let last = this.months[this.months.length - 1];
    if (!last || last.month !== m) {
      last = { month: m, opening: this.balance, closing: this.balance, byCategory: {} };
      this.months.push(last);
      if (this.months.length > HISTORY_MONTHS) this.months.shift();
    }
    return last;
  }

  post(tx: Transaction): void {
    const amount = Math.round(tx.amount);
    if (amount === 0) return;
    const rec = this.monthRecord(tx.day);
    this.balance += amount;
    rec.byCategory[tx.category] = (rec.byCategory[tx.category] ?? 0) + amount;
    rec.closing = this.balance;
  }

  current(day: number): MonthTotals | undefined {
    const last = this.months[this.months.length - 1];
    return last && last.month === monthOf(day) ? last : undefined;
  }

  toData(): FinanceData {
    return {
      balance: this.balance,
      months: this.months.map((m) => ({ ...m, byCategory: { ...m.byCategory } })),
      loans: this.data.loans.map((l) => ({ ...l })),
      nextLoanId: this.data.nextLoanId,
      bankruptcyEnabled: this.data.bankruptcyEnabled,
    };
  }

  static fromData(d: FinanceData): Treasury {
    const t = new Treasury(d.balance);
    t.months = d.months.map((m) => ({ ...m, byCategory: { ...m.byCategory } }));
    t.data = { loans: d.loans.map((l) => ({ ...l })), nextLoanId: d.nextLoanId, bankruptcyEnabled: d.bankruptcyEnabled };
    return t;
  }
}
