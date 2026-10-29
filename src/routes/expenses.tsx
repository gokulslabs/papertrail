import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { SiteHeader, appFrameClass, MAIN_CONTENT_ID } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { onChanged } from "@/lib/db";
import {
  EXPENSE_CATEGORIES,
  addExpense,
  expensesInMonth,
  formatMoney,
  formatMonthLabel,
  getExpenseCurrency,
  listExpenses,
  monthKey,
  monthTotal,
  removeExpense,
  setExpenseCurrency,
  shiftMonth,
  todayIso,
  totalsByCategory,
  updateExpense,
  type Expense,
} from "@/lib/expenses";

export const Route = createFileRoute("/expenses")({
  head: () => ({
    meta: [
      { title: "Expenses · Privytrail" },
      {
        name: "description",
        content: "Track spending by month — food, rent, shopping, and more. Stored only on this device.",
      },
    ],
  }),
  component: ExpensesPage,
});

function formatDay(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
  });
}

function ExpensesPage() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [currency, setCurrency] = useState("USD");
  const [month, setMonth] = useState(() => monthKey(new Date()));
  const [adding, setAdding] = useState(false);
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState<string>("Food");
  const [note, setNote] = useState("");
  const [date, setDate] = useState(todayIso);
  const [currencyDraft, setCurrencyDraft] = useState("USD");

  const reload = async () => {
    const [list, code] = await Promise.all([listExpenses(), getExpenseCurrency()]);
    setExpenses(list);
    setCurrency(code);
    setCurrencyDraft(code);
  };

  useEffect(() => {
    void reload();
    return onChanged(() => {
      void reload();
    });
  }, []);

  const monthItems = useMemo(() => expensesInMonth(expenses, month), [expenses, month]);
  const total = monthTotal(monthItems);
  const byCategory = totalsByCategory(monthItems);

  const submit = async () => {
    const parsed = Number.parseFloat(amount.replace(/,/g, ""));
    if (!Number.isFinite(parsed) || parsed <= 0 || !date) return;
    await addExpense({
      amount: Math.round(parsed * 100) / 100,
      category: category.trim() || "Other",
      note: note.trim(),
      date,
    });
    setAmount("");
    setNote("");
    setDate(todayIso());
    setCategory("Food");
    setAdding(false);
  };

  const saveCurrency = async () => {
    const next = currencyDraft.trim().toUpperCase() || "USD";
    await setExpenseCurrency(next);
  };

  return (
    <div className={appFrameClass}>
      <SiteHeader />
      <main id={MAIN_CONTENT_ID} className="mx-auto w-full max-w-2xl px-6 pb-24">
        <h1 className="text-ink-serif mt-2 text-3xl font-semibold">Expenses</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Log what you spend each month. Everything stays in this browser — nothing is uploaded.
        </p>

        <section className="mt-6 rounded-2xl border border-border bg-card p-5">
          <div className="flex items-center justify-between gap-2">
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-8 w-8 shrink-0"
              aria-label="Previous month"
              onClick={() => setMonth((m) => shiftMonth(m, -1))}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="min-w-0 text-center">
              <h2 className="text-lg font-semibold tabular-nums">{formatMonthLabel(month)}</h2>
              <p className="mt-0.5 text-2xl font-semibold tabular-nums tracking-tight">
                {formatMoney(total, currency)}
              </p>
              <p className="text-xs text-muted-foreground">
                {monthItems.length} {monthItems.length === 1 ? "expense" : "expenses"} this month
              </p>
            </div>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-8 w-8 shrink-0"
              aria-label="Next month"
              onClick={() => setMonth((m) => shiftMonth(m, 1))}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <div className="mt-3 flex justify-center">
            <button
              type="button"
              className="text-xs text-muted-foreground underline"
              onClick={() => setMonth(monthKey(new Date()))}
            >
              Jump to this month
            </button>
          </div>
        </section>

        {byCategory.length > 0 && (
          <section className="mt-4 rounded-2xl border border-border bg-card p-5">
            <h2 className="text-sm font-semibold">By category</h2>
            <ul className="mt-3 space-y-2">
              {byCategory.map(({ category: cat, total: catTotal }) => {
                const pct = total > 0 ? Math.round((catTotal / total) * 100) : 0;
                return (
                  <li key={cat}>
                    <div className="flex items-baseline justify-between gap-3 text-sm">
                      <span className="truncate font-medium">{cat}</span>
                      <span className="shrink-0 tabular-nums text-muted-foreground">
                        {formatMoney(catTotal, currency)} · {pct}%
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary/70"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        <section className="mt-4 rounded-2xl border border-border bg-card p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold">Add expense</h2>
            {!adding && (
              <Button size="sm" onClick={() => setAdding(true)}>
                Add expense
              </Button>
            )}
          </div>
          {adding ? (
            <form
              className="mt-4 space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                void submit();
              }}
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-xs font-medium text-muted-foreground">
                  Amount
                  <Input
                    className="mt-1 tabular-nums"
                    type="number"
                    inputMode="decimal"
                    min="0.01"
                    step="0.01"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.00"
                    autoFocus
                    required
                  />
                </label>
                <label className="block text-xs font-medium text-muted-foreground">
                  Date
                  <Input
                    className="mt-1"
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    required
                  />
                </label>
              </div>
              <label className="block text-xs font-medium text-muted-foreground">
                Category
                <select
                  className="mt-1 flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                >
                  {EXPENSE_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-xs font-medium text-muted-foreground">
                Note (optional)
                <Input
                  className="mt-1"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="e.g. groceries, Uber, Netflix"
                />
              </label>
              <div className="flex justify-end gap-2">
                <Button type="button" size="sm" variant="ghost" onClick={() => setAdding(false)}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={!amount || Number.parseFloat(amount) <= 0 || !date}
                >
                  Save expense
                </Button>
              </div>
            </form>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">
              Coffee runs, rent, subscriptions — log them and see the month total above.
            </p>
          )}
        </section>

        <section className="mt-6">
          <h2 className="text-sm font-semibold">This month</h2>
          {monthItems.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">
              No expenses in {formatMonthLabel(month)} yet.
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-border rounded-2xl border border-border bg-card px-4">
              {monthItems.map((expense) => (
                <ExpenseRow key={expense.id} expense={expense} currency={currency} />
              ))}
            </ul>
          )}
        </section>

        <section className="mt-8 rounded-2xl border border-border bg-card p-5">
          <h2 className="text-sm font-semibold">Currency</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Used for totals and formatting. Does not convert between currencies.
          </p>
          <form
            className="mt-3 flex flex-wrap items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void saveCurrency();
            }}
          >
            <label className="block text-xs font-medium text-muted-foreground">
              Code
              <Input
                className="mt-1 w-24 uppercase"
                value={currencyDraft}
                onChange={(e) => setCurrencyDraft(e.target.value.slice(0, 3))}
                maxLength={3}
                placeholder="USD"
              />
            </label>
            <Button type="submit" size="sm" variant="outline">
              Save
            </Button>
          </form>
        </section>
      </main>
    </div>
  );
}

function ExpenseRow({ expense, currency }: { expense: Expense; currency: string }) {
  const [editing, setEditing] = useState(false);
  const [amount, setAmount] = useState(String(expense.amount));
  const [category, setCategory] = useState(expense.category);
  const [note, setNote] = useState(expense.note);
  const [date, setDate] = useState(expense.date);

  useEffect(() => {
    if (!editing) {
      setAmount(String(expense.amount));
      setCategory(expense.category);
      setNote(expense.note);
      setDate(expense.date);
    }
  }, [expense, editing]);

  const save = async () => {
    const parsed = Number.parseFloat(amount.replace(/,/g, ""));
    if (!Number.isFinite(parsed) || parsed <= 0 || !date) return;
    await updateExpense(expense.id, {
      amount: Math.round(parsed * 100) / 100,
      category: category.trim() || "Other",
      note: note.trim(),
      date,
    });
    setEditing(false);
  };

  if (editing) {
    return (
      <li className="py-3">
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-xs font-medium text-muted-foreground">
              Amount
              <Input
                className="mt-1 tabular-nums"
                type="number"
                inputMode="decimal"
                min="0.01"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
              />
            </label>
            <label className="block text-xs font-medium text-muted-foreground">
              Date
              <Input
                className="mt-1"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
              />
            </label>
          </div>
          <label className="block text-xs font-medium text-muted-foreground">
            Category
            <select
              className="mt-1 flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              value={
                EXPENSE_CATEGORIES.includes(category as (typeof EXPENSE_CATEGORIES)[number])
                  ? category
                  : "Other"
              }
              onChange={(e) => setCategory(e.target.value)}
            >
              {EXPENSE_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs font-medium text-muted-foreground">
            Note
            <Input className="mt-1" value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
          <div className="flex justify-end gap-2">
            <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>
              Cancel
            </Button>
            <Button type="submit" size="sm">
              Save
            </Button>
          </div>
        </form>
      </li>
    );
  }

  return (
    <li className="flex flex-wrap items-center gap-3 py-3 text-sm">
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium">
          {expense.note || expense.category}
          {expense.note ? (
            <span className="font-normal text-muted-foreground"> · {expense.category}</span>
          ) : null}
        </div>
        <div className="text-xs text-muted-foreground">{formatDay(expense.date)}</div>
      </div>
      <span className="shrink-0 tabular-nums font-medium">{formatMoney(expense.amount, currency)}</span>
      <button type="button" className="text-xs underline" onClick={() => setEditing(true)}>
        Edit…
      </button>
      <button
        type="button"
        className="text-xs underline"
        onClick={() => void removeExpense(expense.id)}
      >
        Remove
      </button>
    </li>
  );
}
