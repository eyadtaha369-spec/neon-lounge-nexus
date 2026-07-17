import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { AlertTriangle, Package, Calculator, Wallet, RotateCcw } from "lucide-react";
import { actions, useStore } from "@/lib/store";

export const Route = createFileRoute("/inventory")({
  head: () => ({
    meta: [
      { title: "Inventory — GLITCH Lounge Manager" },
      {
        name: "description",
        content: "Stock levels, recipes, end-of-day sales, and cash reconciliation.",
      },
    ],
  }),
  component: InventoryPage,
});

function InventoryPage() {
  const inventory = useStore((s) => s.inventory);
  const menu = useStore((s) => s.menu);
  const recipes = useStore((s) => s.recipes);
  const salesEntry = useStore((s) => s.salesEntry);
  const actualCash = useStore((s) => s.actualCash);

  const expectedRevenue = useMemo(
    () =>
      menu.reduce((a, m) => a + (salesEntry[m.id] || 0) * m.price, 0),
    [menu, salesEntry],
  );

  const diff = actualCash - expectedRevenue;

  return (
    <div className="max-w-7xl mx-auto space-y-8">
      <header>
        <div className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
          Backend
        </div>
        <h1 className="text-3xl md:text-4xl font-bold mt-1">
          <span className="neon-text-cyan">Inventory</span>{" "}
          <span className="text-muted-foreground text-2xl">& Stock Control</span>
        </h1>
        <p className="text-muted-foreground text-sm mt-2">
          Raw materials, recipes, automated deduction, and end-of-day cash reconciliation.
        </p>
      </header>

      {/* STOCK TABLE */}
      <section className="glass-card p-6">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Package className="h-5 w-5 text-neon-blue" />
            <h2 className="font-semibold">Stock Inventory</h2>
          </div>
          <button
            onClick={() => actions.resetInventoryUsage()}
            className="inline-flex items-center gap-1.5 text-xs rounded-md border border-border/60 px-2.5 py-1.5 hover:bg-white/5"
          >
            <RotateCcw className="h-3.5 w-3.5" /> Reset usage
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground border-b border-border/60">
                <th className="py-2 pr-4">Item</th>
                <th className="py-2 pr-4">Unit</th>
                <th className="py-2 pr-4">Initial</th>
                <th className="py-2 pr-4">Used</th>
                <th className="py-2 pr-4">Remaining</th>
                <th className="py-2 pr-4">Status</th>
              </tr>
            </thead>
            <tbody>
              {inventory.map((i) => {
                const remaining = i.initial - i.used;
                const low = i.initial > 0 && remaining < i.initial * 0.2;
                return (
                  <tr key={i.id} className="border-b border-border/30 last:border-0">
                    <td className="py-3 pr-4 font-medium">{i.name}</td>
                    <td className="py-3 pr-4 text-muted-foreground">{i.unit}</td>
                    <td className="py-3 pr-4">
                      <input
                        type="number"
                        value={i.initial}
                        onChange={(e) =>
                          actions.setInitialStock(i.id, Number(e.target.value) || 0)
                        }
                        className="w-24 rounded-md bg-input border border-border/60 px-2 py-1 text-sm focus:outline-none focus:border-primary"
                      />
                    </td>
                    <td className="py-3 pr-4 font-mono-display text-muted-foreground">
                      {i.used.toFixed(0)}
                    </td>
                    <td className={`py-3 pr-4 font-mono-display font-semibold ${low ? "text-warning" : ""}`}>
                      {remaining.toFixed(0)}
                    </td>
                    <td className="py-3 pr-4">
                      {low ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-warning/15 text-warning text-[11px] px-2 py-0.5">
                          <AlertTriangle className="h-3 w-3" /> Low
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">OK</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* RECIPES */}
      <section className="glass-card p-6">
        <h2 className="font-semibold mb-4">Recipe Management</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {menu.map((m) => {
            const lines = recipes[m.id] || [];
            return (
              <div key={m.id} className="rounded-lg border border-border/50 p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="font-medium">{m.name}</div>
                  <div className="text-xs text-neon-cyan">${m.price.toFixed(2)}</div>
                </div>
                <div className="space-y-2">
                  {inventory.map((inv) => {
                    const line = lines.find((l) => l.invId === inv.id);
                    return (
                      <div key={inv.id} className="grid grid-cols-[minmax(0,1fr)_80px] items-center gap-2">
                        <div className="text-xs text-muted-foreground truncate">
                          {inv.name} <span className="opacity-60">({inv.unit})</span>
                        </div>
                        <input
                          type="number"
                          min="0"
                          value={line?.qty ?? 0}
                          onChange={(e) => {
                            const qty = Number(e.target.value) || 0;
                            const others = lines.filter((l) => l.invId !== inv.id);
                            const next = qty > 0 ? [...others, { invId: inv.id, qty }] : others;
                            actions.setRecipe(m.id, next);
                          }}
                          className="w-full rounded-md bg-input border border-border/60 px-2 py-1 text-xs font-mono-display focus:outline-none focus:border-primary"
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* SALES ENTRY */}
      <section className="glass-card p-6">
        <div className="flex items-center gap-2 mb-4">
          <Calculator className="h-5 w-5 text-neon-purple" />
          <h2 className="font-semibold">End of Day Sales Entry</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          {menu.map((m) => (
            <div
              key={m.id}
              className="rounded-lg border border-border/50 p-3 grid grid-cols-[minmax(0,1fr)_80px] items-center gap-2"
            >
              <div>
                <div className="font-medium text-sm">{m.name}</div>
                <div className="text-xs text-muted-foreground">${m.price.toFixed(2)}</div>
              </div>
              <input
                type="number"
                min="0"
                placeholder="Qty"
                value={salesEntry[m.id] ?? ""}
                onChange={(e) => actions.setSalesQty(m.id, Number(e.target.value) || 0)}
                className="w-full rounded-md bg-input border border-border/60 px-2 py-2 text-sm font-mono-display focus:outline-none focus:border-primary"
              />
            </div>
          ))}
        </div>
        <div className="mt-4 flex items-center justify-between flex-wrap gap-3">
          <div className="text-sm text-muted-foreground">
            Submitting deducts recipe ingredients from stock.
          </div>
          <button
            onClick={() => actions.submitEndOfDay()}
            className="inline-flex items-center gap-2 rounded-lg bg-primary/20 border border-primary/40 px-4 py-2 text-sm font-medium hover:bg-primary/30"
          >
            Submit & Deduct
          </button>
        </div>
      </section>

      {/* RECONCILIATION */}
      <section className="glass-card p-6">
        <div className="flex items-center gap-2 mb-4">
          <Wallet className="h-5 w-5 text-neon-cyan" />
          <h2 className="font-semibold">Cash Reconciliation</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="rounded-lg border border-border/50 p-4">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">
              Expected Revenue
            </div>
            <div className="text-2xl font-bold font-mono-display neon-text-blue mt-2">
              ${expectedRevenue.toFixed(2)}
            </div>
          </div>
          <div className="rounded-lg border border-border/50 p-4">
            <label className="text-xs uppercase tracking-wider text-muted-foreground">
              Actual Cash Entered
            </label>
            <input
              type="number"
              value={actualCash || ""}
              onChange={(e) => actions.setActualCash(Number(e.target.value) || 0)}
              placeholder="0.00"
              className="mt-2 w-full rounded-md bg-input border border-border/60 px-3 py-2 text-2xl font-bold font-mono-display focus:outline-none focus:border-primary"
            />
          </div>
          <ReconResult diff={diff} />
        </div>
      </section>
    </div>
  );
}

function ReconResult({ diff }: { diff: number }) {
  const status =
    Math.abs(diff) < 0.005 ? "balanced" : diff < 0 ? "deficit" : "surplus";
  const color =
    status === "deficit"
      ? "text-destructive"
      : status === "surplus"
        ? "text-success"
        : "text-muted-foreground";
  const border =
    status === "deficit"
      ? "border-destructive/40"
      : status === "surplus"
        ? "border-success/40"
        : "border-border/50";
  const label =
    status === "deficit"
      ? "Deficit (عجز)"
      : status === "surplus"
        ? "Surplus (زيادة)"
        : "Balanced";
  return (
    <div className={`rounded-lg border ${border} p-4`}>
      <div className="text-xs uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className={`text-2xl font-bold font-mono-display mt-2 ${color}`}>
        {status === "balanced" ? "$0.00" : `${diff < 0 ? "-" : "+"}$${Math.abs(diff).toFixed(2)}`}
      </div>
    </div>
  );
}