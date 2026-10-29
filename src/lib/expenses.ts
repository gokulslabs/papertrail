import { emitChanged, getMeta, setMeta } from "./db";

const KEY = "expenses";
const CURRENCY_KEY = "expenseCurrency";

export const EXPENSE_CATEGORIES = [
  "Food",
  "Transport",
  "Rent",
  "Utilities",
  "Shopping",
  "Health",
  "Entertainment",
  "Subscriptions",
  "Travel",
  "Other",
] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number] | string;

/** A single spending entry — stored locally, not tied to a document. */
export interface Expense {
  id: string;
  /** Calendar day the money was spent (YYYY-MM-DD). */
  date: string;
  /** Amount in major currency units (e.g. dollars). */
  amount: number;
  category: ExpenseCategory;
  note: string;
  createdAt: number;
}

function asList(value: unknown): Expense[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is Expense => {
    if (!item || typeof item !== "object") return false;
    const e = item as Expense;
    return (
      typeof e.id === "string" &&
      typeof e.date === "string" &&
      typeof e.amount === "number" &&
      Number.isFinite(e.amount) &&
      typeof e.category === "string" &&
      typeof e.note === "string" &&
      typeof e.createdAt === "number"
    );
  });
}

export async function listExpenses(): Promise<Expense[]> {
  return asList(await getMeta(KEY, []));
}

export async function saveExpenses(expenses: Expense[]): Promise<void> {
  await setMeta(KEY, expenses);
  emitChanged();
}

export async function addExpense(
  input: Omit<Expense, "id" | "createdAt">,
): Promise<Expense> {
  const entry: Expense = {
    ...input,
    id: crypto.randomUUID(),
    createdAt: Date.now(),
  };
  const all = await listExpenses();
  await saveExpenses([...all, entry]);
  return entry;
}

export async function updateExpense(id: string, patch: Partial<Expense>): Promise<void> {
  const all = await listExpenses();
  await saveExpenses(all.map((e) => (e.id === id ? { ...e, ...patch, id } : e)));
}

export async function removeExpense(id: string): Promise<void> {
  const all = await listExpenses();
  await saveExpenses(all.filter((e) => e.id !== id));
}

export async function getExpenseCurrency(): Promise<string> {
  const value = await getMeta<string>(CURRENCY_KEY, "USD");
  return typeof value === "string" && value.trim() ? value.trim().toUpperCase() : "USD";
}

export async function setExpenseCurrency(code: string): Promise<void> {
  await setMeta(CURRENCY_KEY, code.trim().toUpperCase() || "USD");
  emitChanged();
}

/** YYYY-MM for a Date or ISO day string. */
export function monthKey(date: Date | string): string {
  if (typeof date === "string") return date.slice(0, 7);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export function shiftMonth(key: string, delta: number): string {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return monthKey(d);
}

export function formatMonthLabel(key: string): string {
  return new Date(`${key}-01T00:00:00`).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
}

export function expensesInMonth(expenses: Expense[], key: string): Expense[] {
  return expenses
    .filter((e) => e.date.startsWith(key))
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
}

export function monthTotal(expenses: Expense[]): number {
  return expenses.reduce((sum, e) => sum + e.amount, 0);
}

export function totalsByCategory(expenses: Expense[]): { category: string; total: number }[] {
  const map = new Map<string, number>();
  for (const e of expenses) {
    map.set(e.category, (map.get(e.category) ?? 0) + e.amount);
  }
  return [...map.entries()]
    .map(([category, total]) => ({ category, total }))
    .sort((a, b) => b.total - a.total || a.category.localeCompare(b.category));
}

export function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

export function todayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
