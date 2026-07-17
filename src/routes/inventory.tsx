import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  TriangleAlert as AlertTriangle,
  Package,
  ChefHat,
  RefreshCw,
  X,
  Plus,
  Trash2,
  Calculator,
  Wallet,
  FileDown,
} from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import {
  actions,
  useStore,
  type RecipeLine,
  type State,
} from "@/lib/store";

export const Route = createFileRoute("/inventory")({
  head: () => ({
    meta: [
      { title: "Inventory — GLITCH Lounge Manager" },
      {
        name: "description",
        content: "Live stock levels, low-stock alerts, and recipe management.",
      },
    ],
  }),
  component: InventoryPage,
});

function InventoryPage() {
  const inventory = useStore((s) => s.inventory);
  const menu = useStore((s) => s.menu);
  const recipes = useStore((s) => s.recipes);
  const salesLog = useStore((s) => s.salesLog);
  const sessions = useStore((s) => s.sessions);
  const dailyCash = useStore((s) => s.dailyCash);

  const lowStock = inventory.filter((i) => i.currentStock <= i.minimumStockLevel);
  const [editRecipeFor, setEditRecipeFor] = useState<string | null>(null);
  const [showAddItem, setShowAddItem] = useState(false);
  const [reportMonth, setReportMonth] = useState(
    new Date().toISOString().slice(0, 7),
  );
  const [reportBusy, setReportBusy] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);

  // Aggregate sales by menu item for today (automated from sales_log).
  const salesByItem = useMemo(() => {
    const map = new Map<string, { name: string; qty: number; revenue: number }>();
    for (const s of salesLog) {
      const key = s.menuItemId ?? s.menuItemName;
      const existing = map.get(key);
      if (existing) {
        existing.qty += s.qty;
        existing.revenue += s.total;
      } else {
        map.set(key, {
          name: s.menuItemName,
          qty: s.qty,
          revenue: s.total,
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => b.revenue - a.revenue);
  }, [salesLog]);

  const totalSalesRevenue = salesByItem.reduce((a, s) => a + s.revenue, 0);
  const totalSalesQty = salesByItem.reduce((a, s) => a + s.qty, 0);

  // Expected cash = today's completed-session totals (time + orders).
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todaySessions = sessions.filter((s) => s.endedAt >= todayStart.getTime());
  const expectedCash = todaySessions.reduce((a, s) => a + s.total, 0);
  const actualCash = dailyCash?.actualCash ?? 0;
  const discrepancy = actualCash - expectedCash;

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
          Live stock levels, low-stock alerts, and recipe-driven automatic
          deduction on session close.
        </p>
      </header>

      {lowStock.length > 0 && (
        <div className="glass-card p-4 border-l-4 border-l-warning flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-warning shrink-0 mt-0.5" />
          <div className="text-sm">
            <div className="font-semibold text-warning">
              {lowStock.length} item{lowStock.length > 1 ? "s" : ""} at or below
              minimum stock level
            </div>
            <div className="text-muted-foreground mt-0.5">
              {lowStock.map((i) => i.name).join(", ")} — restock soon.
            </div>
          </div>
        </div>
      )}

      {/* STOCK TABLE */}
      <section className="glass-card p-6">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Package className="h-5 w-5 text-neon-blue" />
            <h2 className="font-semibold">Stock Inventory</h2>
          </div>
          <button
            onClick={() => actions.refreshInventory()}
            className="inline-flex items-center gap-1.5 text-xs rounded-md border border-border/60 px-2.5 py-1.5 hover:bg-white/5"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground border-b border-border/60">
                <th className="py-2 pr-4">Item</th>
                <th className="py-2 pr-4">Unit</th>
                <th className="py-2 pr-4">Current Stock</th>
                <th className="py-2 pr-4">Min. Level</th>
                <th className="py-2 pr-4">Status</th>
              </tr>
            </thead>
            <tbody>
              {inventory.map((i) => {
                const low = i.currentStock <= i.minimumStockLevel;
                return (
                  <tr key={i.id} className="border-b border-border/30 last:border-0">
                    <td className="py-3 pr-4 font-medium">{i.name}</td>
                    <td className="py-3 pr-4 text-muted-foreground">{i.unit}</td>
                    <td className="py-3 pr-4">
                      <input
                        type="number"
                        min="0"
                        value={i.currentStock}
                        onChange={(e) =>
                          actions.setInventoryStock(
                            i.id,
                            Math.max(0, Number(e.target.value) || 0),
                          )
                        }
                        className={`w-28 rounded-md bg-input border px-2 py-1 text-sm font-mono-display focus:outline-none focus:border-primary ${
                          low ? "border-warning/60" : "border-border/60"
                        }`}
                      />
                    </td>
                    <td className="py-3 pr-4">
                      <input
                        type="number"
                        min="0"
                        value={i.minimumStockLevel}
                        onChange={(e) =>
                          actions.setMinimumStock(
                            i.id,
                            Math.max(0, Number(e.target.value) || 0),
                          )
                        }
                        className="w-24 rounded-md bg-input border border-border/60 px-2 py-1 text-sm font-mono-display focus:outline-none focus:border-primary"
                      />
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
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <ChefHat className="h-5 w-5 text-neon-purple" />
            <h2 className="font-semibold">Recipe Management</h2>
          </div>
          <button
            onClick={() => setShowAddItem(true)}
            className="inline-flex items-center gap-1.5 text-xs rounded-md bg-primary/20 border border-primary/40 px-3 py-1.5 hover:bg-primary/30 font-medium"
          >
            <Plus className="h-3.5 w-3.5" /> Add New Item
          </button>
        </div>
        <p className="text-xs text-muted-foreground mb-4">
          Each menu item maps to inventory ingredients. When a room session is
          closed, the database trigger automatically deducts{" "}
          <span className="font-mono-display">quantity_needed × order qty</span>{" "}
          from stock.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {menu.map((m) => {
            const lines = recipes[m.id] || [];
            return (
              <div key={m.id} className="rounded-lg border border-border/50 p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="font-medium">{m.name}</div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-neon-cyan">
                      ${m.price.toFixed(2)}
                    </span>
                    <button
                      onClick={() => setEditRecipeFor(m.id)}
                      className="text-xs inline-flex items-center gap-1 rounded-md border border-border/60 px-2 py-1 hover:bg-white/5"
                    >
                      <Plus className="h-3 w-3" /> Manage
                    </button>
                  </div>
                </div>
                {lines.length === 0 ? (
                  <div className="text-xs text-muted-foreground italic">
                    No recipe defined.
                  </div>
                ) : (
                  <ul className="space-y-1 text-xs">
                    {lines.map((l) => {
                      const inv = inventory.find((i) => i.id === l.invId);
                      return (
                        <li
                          key={l.invId}
                          className="flex justify-between text-muted-foreground"
                        >
                          <span className="truncate">{inv?.name ?? "—"}</span>
                          <span className="font-mono-display">
                            {l.qty} {inv?.unit}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {editRecipeFor && (
        <RecipeModal
          menuId={editRecipeFor}
          menuName={menu.find((m) => m.id === editRecipeFor)?.name ?? "Recipe"}
          inventory={inventory}
          currentLines={recipes[editRecipeFor] || []}
          onClose={() => setEditRecipeFor(null)}
        />
      )}

      {/* END OF DAY SALES (automated) */}
      <section className="glass-card p-6">
        <div className="flex items-center gap-2 mb-1">
          <Calculator className="h-5 w-5 text-neon-purple" />
          <h2 className="font-semibold">End of Day Sales</h2>
          <span className="text-xs text-muted-foreground ml-auto">
            Auto-logged from completed room sessions
          </span>
        </div>
        <p className="text-xs text-muted-foreground mb-4">
          Every closed room session automatically logs its drink orders here —
          no manual entry needed.
        </p>
        {salesByItem.length === 0 ? (
          <div className="text-sm text-muted-foreground italic py-4 text-center">
            No sales recorded today yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground border-b border-border/60">
                  <th className="py-2 pr-4">Menu Item</th>
                  <th className="py-2 pr-4 text-right">Qty Sold</th>
                  <th className="py-2 pr-4 text-right">Revenue</th>
                </tr>
              </thead>
              <tbody>
                {salesByItem.map((s) => (
                  <tr key={s.name} className="border-b border-border/30 last:border-0">
                    <td className="py-3 pr-4 font-medium">{s.name}</td>
                    <td className="py-3 pr-4 text-right font-mono-display">{s.qty}</td>
                    <td className="py-3 pr-4 text-right font-mono-display neon-text-blue">
                      ${s.revenue.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-border/60">
                  <td className="py-3 pr-4 font-semibold">Total</td>
                  <td className="py-3 pr-4 text-right font-mono-display font-semibold">
                    {totalSalesQty}
                  </td>
                  <td className="py-3 pr-4 text-right font-mono-display font-bold neon-text-cyan">
                    ${totalSalesRevenue.toFixed(2)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>

      {/* CASH RECONCILIATION (automated) */}
      <section className="glass-card p-6">
        <div className="flex items-center gap-2 mb-4">
          <Wallet className="h-5 w-5 text-neon-cyan" />
          <h2 className="font-semibold">Cash Reconciliation</h2>
        </div>
        <p className="text-xs text-muted-foreground mb-4">
          Expected cash is calculated automatically from today's completed room
          sessions (time + orders). Enter the actual cash in the drawer to see
          the discrepancy.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="rounded-lg border border-border/50 p-4">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">
              Expected Cash
            </div>
            <div className="text-2xl font-bold font-mono-display neon-text-blue mt-2">
              ${expectedCash.toFixed(2)}
            </div>
            <div className="text-[11px] text-muted-foreground mt-1">
              {todaySessions.length} session{todaySessions.length !== 1 ? "s" : ""} today
            </div>
          </div>
          <div className="rounded-lg border border-border/50 p-4">
            <label className="text-xs uppercase tracking-wider text-muted-foreground">
              Actual Cash in Drawer
            </label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={actualCash || ""}
              onChange={(e) =>
                actions.setActualCash(Math.max(0, Number(e.target.value) || 0))
              }
              placeholder="0.00"
              className="mt-2 w-full rounded-md bg-input border border-border/60 px-3 py-2 text-2xl font-bold font-mono-display focus:outline-none focus:border-primary"
            />
          </div>
          <ReconResult diff={discrepancy} />
        </div>
      </section>

      {/* MONTHLY REPORT */}
      <section className="glass-card p-6">
        <div className="flex items-center gap-2 mb-4">
          <FileDown className="h-5 w-5 text-neon-gold" />
          <h2 className="font-semibold">Monthly Inventory Report</h2>
        </div>
        <p className="text-xs text-muted-foreground mb-4">
          Generate a PDF of the selected month's inventory snapshot (stock
          levels, minimums, and consumption). The snapshot is captured on
          demand and saved historically month-by-month.
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="text-xs uppercase tracking-wider text-muted-foreground block mb-1">
              Month
            </label>
            <input
              type="month"
              value={reportMonth}
              onChange={(e) => {
                setReportMonth(e.target.value);
                setReportError(null);
              }}
              className="rounded-md bg-input border border-border/60 px-3 py-2 text-sm font-mono-display focus:outline-none focus:border-primary"
            />
          </div>
          <button
            disabled={reportBusy}
            onClick={async () => {
              setReportBusy(true);
              setReportError(null);
              try {
                await downloadMonthlyReport(reportMonth, inventory);
              } catch (err) {
                setReportError(
                  err instanceof Error ? err.message : "Failed to generate report",
                );
              } finally {
                setReportBusy(false);
              }
            }}
            className="inline-flex items-center gap-2 rounded-lg bg-neon-gold/20 border border-neon-gold/40 px-4 py-2 text-sm font-medium hover:bg-neon-gold/30 disabled:opacity-50"
          >
            <FileDown className="h-4 w-4" />
            {reportBusy ? "Generating…" : "Download Monthly Report"}
          </button>
        </div>
        {reportError && (
          <div className="mt-3 text-sm text-destructive flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            {reportError}
          </div>
        )}
      </section>

      {showAddItem && (
        <AddItemModal
          inventory={inventory}
          onClose={() => setShowAddItem(false)}
        />
      )}
    </div>
  );
}

function RecipeModal({
  menuId,
  menuName,
  inventory,
  currentLines,
  onClose,
}: {
  menuId: string;
  menuName: string;
  inventory: { id: string; name: string; unit: string }[];
  currentLines: RecipeLine[];
  onClose: () => void;
}) {
  const [lines, setLines] = useState<RecipeLine[]>(currentLines);
  const [picking, setPicking] = useState(false);
  const [saving, setSaving] = useState(false);

  function addIngredient(invId: string) {
    if (lines.some((l) => l.invId === invId)) return;
    setLines([...lines, { invId, qty: 1 }]);
    setPicking(false);
  }

  function updateQty(invId: string, qty: number) {
    setLines(lines.map((l) => (l.invId === invId ? { ...l, qty } : l)));
  }

  function removeLine(invId: string) {
    setLines(lines.filter((l) => l.invId !== invId));
  }

  async function save() {
    setSaving(true);
    await actions.setRecipe(menuId, lines);
    setSaving(false);
    onClose();
  }

  const available = inventory.filter(
    (i) => !lines.some((l) => l.invId === i.id),
  );

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="glass-card p-6 max-w-lg w-full">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground">
              Manage Recipe
            </div>
            <h3 className="font-bold text-lg">{menuName}</h3>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-white/5"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
          {lines.length === 0 && (
            <div className="text-sm text-muted-foreground italic">
              No ingredients yet. Add one below.
            </div>
          )}
          {lines.map((l) => {
            const inv = inventory.find((i) => i.id === l.invId);
            return (
              <div
                key={l.invId}
                className="grid grid-cols-[minmax(0,1fr)_90px_36px] items-center gap-2"
              >
                <div className="text-sm truncate">
                  {inv?.name ?? "—"}{" "}
                  <span className="text-muted-foreground text-xs">
                    ({inv?.unit})
                  </span>
                </div>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={l.qty}
                  onChange={(e) =>
                    updateQty(l.invId, Number(e.target.value) || 0)
                  }
                  className="w-full rounded-md bg-input border border-border/60 px-2 py-1 text-sm font-mono-display focus:outline-none focus:border-primary"
                />
                <button
                  onClick={() => removeLine(l.invId)}
                  className="grid place-items-center h-8 w-9 rounded-md border border-border/60 hover:bg-destructive/10 hover:border-destructive/40 text-muted-foreground hover:text-destructive"
                  aria-label="Remove ingredient"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })}
        </div>

        {picking ? (
          <div className="mt-3 rounded-lg border border-border/60 p-2 max-h-40 overflow-y-auto">
            {available.length === 0 ? (
              <div className="text-xs text-muted-foreground px-2 py-1">
                All inventory items already added.
              </div>
            ) : (
              available.map((inv) => (
                <button
                  key={inv.id}
                  onClick={() => addIngredient(inv.id)}
                  className="w-full text-left text-sm px-2 py-1.5 rounded hover:bg-primary/10"
                >
                  {inv.name}{" "}
                  <span className="text-muted-foreground text-xs">
                    ({inv.unit})
                  </span>
                </button>
              ))
            )}
          </div>
        ) : (
          <button
            onClick={() => setPicking(true)}
            className="mt-3 inline-flex items-center gap-1.5 text-xs rounded-md border border-dashed border-border/60 px-3 py-1.5 hover:bg-white/5"
          >
            <Plus className="h-3.5 w-3.5" /> Add ingredient
          </button>
        )}

        <div className="mt-6 flex gap-2 justify-end">
          <button
            onClick={onClose}
            className="rounded-lg border border-border/60 px-4 py-2 text-sm hover:bg-white/5"
          >
            Cancel
          </button>
          <button
            disabled={saving}
            onClick={save}
            className="rounded-lg bg-primary/20 border border-primary/40 px-4 py-2 text-sm font-medium hover:bg-primary/30 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save recipe"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ReconResult({ diff }: { diff: number }) {
  const balanced = Math.abs(diff) < 0.005;
  const status = balanced ? "balanced" : diff < 0 ? "deficit" : "surplus";
  const color = balanced
    ? "text-muted-foreground"
    : status === "deficit"
      ? "text-destructive"
      : "text-success";
  const border = balanced
    ? "border-border/50"
    : status === "deficit"
      ? "border-destructive/40"
      : "border-success/40";
  const label =
    status === "deficit"
      ? "Short (عجز)"
      : status === "surplus"
        ? "Over (زيادة)"
        : "Balanced";
  return (
    <div className={`rounded-lg border ${border} p-4`}>
      <div className="text-xs uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className={`text-2xl font-bold font-mono-display mt-2 ${color}`}>
        {balanced
          ? "$0.00"
          : `${diff < 0 ? "-" : "+"}$${Math.abs(diff).toFixed(2)}`}
      </div>
    </div>
  );
}

function AddItemModal({
  inventory,
  onClose,
}: {
  inventory: { id: string; name: string; unit: string }[];
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [lines, setLines] = useState<RecipeLine[]>([]);
  const [picking, setPicking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function addIngredient(invId: string) {
    if (lines.some((l) => l.invId === invId)) return;
    setLines([...lines, { invId, qty: 1 }]);
    setPicking(false);
  }
  function updateQty(invId: string, qty: number) {
    setLines(lines.map((l) => (l.invId === invId ? { ...l, qty } : l)));
  }
  function removeLine(invId: string) {
    setLines(lines.filter((l) => l.invId !== invId));
  }

  async function save() {
    setError(null);
    setSaving(true);
    const res = await actions.addMenuItem(
      name,
      Number(price) || 0,
      lines.filter((l) => l.qty > 0),
    );
    setSaving(false);
    if (!res.ok) {
      setError(res.reason ?? "Failed to add item");
      return;
    }
    onClose();
  }

  const available = inventory.filter((i) => !lines.some((l) => l.invId === i.id));

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="glass-card p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground">
              New Menu Item
            </div>
            <h3 className="font-bold text-lg">Add New Item</h3>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-white/5"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_120px] gap-3 mb-4">
          <div>
            <label className="text-xs uppercase tracking-wider text-muted-foreground block mb-1">
              Item Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Cappuccino"
              className="w-full rounded-md bg-input border border-border/60 px-3 py-2 text-sm focus:outline-none focus:border-primary"
            />
          </div>
          <div>
            <label className="text-xs uppercase tracking-wider text-muted-foreground block mb-1">
              Price ($)
            </label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="0.00"
              className="w-full rounded-md bg-input border border-border/60 px-3 py-2 text-sm font-mono-display focus:outline-none focus:border-primary"
            />
          </div>
        </div>

        <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
          Recipe Ingredients
        </div>
        <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
          {lines.length === 0 && (
            <div className="text-sm text-muted-foreground italic">
              No ingredients yet. Add one below.
            </div>
          )}
          {lines.map((l) => {
            const inv = inventory.find((i) => i.id === l.invId);
            return (
              <div
                key={l.invId}
                className="grid grid-cols-[minmax(0,1fr)_90px_36px] items-center gap-2"
              >
                <div className="text-sm truncate">
                  {inv?.name ?? "—"}{" "}
                  <span className="text-muted-foreground text-xs">
                    ({inv?.unit})
                  </span>
                </div>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={l.qty}
                  onChange={(e) =>
                    updateQty(l.invId, Number(e.target.value) || 0)
                  }
                  className="w-full rounded-md bg-input border border-border/60 px-2 py-1 text-sm font-mono-display focus:outline-none focus:border-primary"
                />
                <button
                  onClick={() => removeLine(l.invId)}
                  className="grid place-items-center h-8 w-9 rounded-md border border-border/60 hover:bg-destructive/10 hover:border-destructive/40 text-muted-foreground hover:text-destructive"
                  aria-label="Remove ingredient"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })}
        </div>

        {picking ? (
          <div className="mt-3 rounded-lg border border-border/60 p-2 max-h-40 overflow-y-auto">
            {available.length === 0 ? (
              <div className="text-xs text-muted-foreground px-2 py-1">
                All inventory items already added.
              </div>
            ) : (
              available.map((inv) => (
                <button
                  key={inv.id}
                  onClick={() => addIngredient(inv.id)}
                  className="w-full text-left text-sm px-2 py-1.5 rounded hover:bg-primary/10"
                >
                  {inv.name}{" "}
                  <span className="text-muted-foreground text-xs">
                    ({inv.unit})
                  </span>
                </button>
              ))
            )}
          </div>
        ) : (
          <button
            onClick={() => setPicking(true)}
            className="mt-3 inline-flex items-center gap-1.5 text-xs rounded-md border border-dashed border-border/60 px-3 py-1.5 hover:bg-white/5"
          >
            <Plus className="h-3.5 w-3.5" /> Add ingredient
          </button>
        )}

        {error && (
          <div className="mt-3 text-sm text-destructive flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            {error}
          </div>
        )}

        <div className="mt-6 flex gap-2 justify-end">
          <button
            onClick={onClose}
            className="rounded-lg border border-border/60 px-4 py-2 text-sm hover:bg-white/5"
          >
            Cancel
          </button>
          <button
            disabled={saving || !name.trim()}
            onClick={save}
            className="rounded-lg bg-primary/20 border border-primary/40 px-4 py-2 text-sm font-medium hover:bg-primary/30 disabled:opacity-50"
          >
            {saving ? "Adding…" : "Add item"}
          </button>
        </div>
      </div>
    </div>
  );
}

async function downloadMonthlyReport(
  month: string,
  inventory: { id: string; name: string; unit: string; currentStock: number; minimumStockLevel: number }[],
) {
  // Snapshot the month first (idempotent), then fetch the snapshot rows.
  const snapRes = await actions.snapshotMonth(month);
  if (!snapRes.ok) {
    throw new Error(snapRes.reason ?? "Failed to snapshot inventory");
  }
  const snapshot = await actions.getMonthlySnapshot(month);
  if (!snapshot || snapshot.length === 0) {
    throw new Error("No inventory data to report for this month.");
  }

  const monthLabel = new Date(`${month}-01T00:00:00`).toLocaleDateString(
    "en-US",
    { month: "long", year: "numeric" },
  );

  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();

  // Header
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(20, 20, 30);
  doc.text("GLITCH Lounge — Monthly Inventory Report", 40, 50);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(90, 90, 100);
  doc.text(`Month: ${monthLabel}`, 40, 70);
  doc.text(
    `Generated: ${new Date().toLocaleString()}`,
    40,
    86,
  );

  // Summary line
  const totalItems = snapshot.length;
  const lowItems = snapshot.filter(
    (s: { stock_level: number; minimum_stock_level: number }) =>
      Number(s.stock_level) <= Number(s.minimum_stock_level),
  ).length;
  const totalConsumption = snapshot.reduce(
    (a: number, s: { used_this_month: number }) =>
      a + Number(s.used_this_month),
    0,
  );
  doc.setFontSize(10);
  doc.text(
    `Items tracked: ${totalItems}   |   Low-stock items: ${lowItems}   |   Total consumption: ${totalConsumption}`,
    40,
    102,
  );

  // Table
  autoTable(doc, {
    startY: 120,
    head: [["Item", "Unit", "Stock Level", "Min. Level", "Used (month)", "Status"]],
    body: (snapshot as Array<{
      name: string;
      unit: string;
      stock_level: number;
      minimum_stock_level: number;
      used_this_month: number;
    }>)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((s) => [
        s.name,
        s.unit,
        Number(s.stock_level).toFixed(0),
        Number(s.minimum_stock_level).toFixed(0),
        Number(s.used_this_month).toFixed(0),
        Number(s.stock_level) <= Number(s.minimum_stock_level)
          ? "LOW"
          : "OK",
      ]),
    theme: "striped",
    headStyles: {
      fillColor: [40, 40, 60],
      textColor: [255, 255, 255],
      fontStyle: "bold",
    },
    styles: { fontSize: 10, cellPadding: 6 },
    columnStyles: {
      2: { halign: "right" },
      3: { halign: "right" },
      4: { halign: "right" },
      5: { halign: "center" },
    },
    margin: { left: 40, right: 40 },
    didDrawPage: () => {
      // Footer
      const pageHeight = doc.internal.pageSize.getHeight();
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(150, 150, 160);
      doc.text(
        "GLITCH Lounge Manager — confidential",
        40,
        pageHeight - 20,
      );
      doc.text(
        `Page ${doc.getNumberOfPages()}`,
        pageWidth - 60,
        pageHeight - 20,
      );
    },
  });

  doc.save(`glitch-inventory-${month}.pdf`);
}
