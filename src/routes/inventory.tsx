import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  AlertTriangle,
  Package,
  ChefHat,
  RefreshCw,
  X,
  Plus,
  Trash2,
} from "lucide-react";
import { actions, useStore, type RecipeLine } from "@/lib/store";

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

  const lowStock = inventory.filter((i) => i.currentStock <= i.minimumStockLevel);
  const [editRecipeFor, setEditRecipeFor] = useState<string | null>(null);

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
        <div className="flex items-center gap-2 mb-4">
          <ChefHat className="h-5 w-5 text-neon-purple" />
          <h2 className="font-semibold">Recipe Management</h2>
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
