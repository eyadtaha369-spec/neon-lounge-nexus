import { useSyncExternalStore } from "react";
import { supabase } from "./supabase";

// ============ TYPES ============
export type MenuItem = { id: string; name: string; price: number };
export type OrderLine = {
  id: string;
  menuId: string;
  name: string;
  price: number;
  qty: number;
};
export type CompletedSession = {
  id: string;
  roomId: string;
  roomName: string;
  startedAt: number;
  endedAt: number;
  seconds: number;
  timeCost: number;
  ordersCost: number;
  total: number;
};
export type Room = {
  id: string;
  name: string;
  isVIP: boolean;
  hourlyRate: number;
  status: "available" | "active";
  startedAt: number | null;
  orders: OrderLine[];
  splitBill: boolean;
};
export type InventoryItem = {
  id: string;
  name: string;
  unit: string;
  currentStock: number;
  minimumStockLevel: number;
};
export type RecipeLine = { invId: string; qty: number };
export type Recipes = Record<string, RecipeLine[]>; // menuId -> lines
export type Activity = {
  id: string;
  ts: number;
  kind: "start" | "end" | "order";
  text: string;
};

export type State = {
  rooms: Room[];
  menu: MenuItem[];
  inventory: InventoryItem[];
  recipes: Recipes;
  sessions: CompletedSession[];
  activity: Activity[];
  salesLog: SalesLogEntry[];
  dailyCash: DailyCash | null;
};

// ============ DB ROW TYPES ============
type DbRoom = {
  id: string;
  name: string;
  is_vip: boolean;
  hourly_rate: number;
  status: "available" | "active";
  started_at: string | null;
  split_bill: boolean;
};
type DbOrder = {
  id: string;
  room_id: string;
  menu_item_id: string;
  name: string;
  price: number;
  qty: number;
};
type DbInventory = {
  id: string;
  name: string;
  unit: string;
  current_stock: number;
  minimum_stock_level: number;
};
type DbMenuItem = {
  id: string;
  name: string;
  price: number;
};
type DbRecipe = {
  id: string;
  menu_item_id: string;
  inventory_item_id: string;
  quantity_needed: number;
};
type DbSession = {
  id: string;
  room_id: string;
  room_name: string;
  started_at: string;
  ended_at: string;
  seconds: number;
  time_cost: number;
  orders_cost: number;
  total: number;
};
type DbSalesLog = {
  id: string;
  menu_item_id: string | null;
  menu_item_name: string;
  qty: number;
  unit_price: number;
  total: number;
  room_id: string | null;
  room_name: string;
  session_id: string | null;
  sold_at: string;
};
type DbDailyCash = {
  id: string;
  day: string;
  actual_cash: number;
  updated_at: string;
};
export type SalesLogEntry = {
  id: string;
  menuItemId: string | null;
  menuItemName: string;
  qty: number;
  unitPrice: number;
  total: number;
  roomName: string;
  soldAt: number; // epoch ms
};
export type DailyCash = {
  day: string; // YYYY-MM-DD
  actualCash: number;
};

// ============ REACTIVE STORE ============
let state: State = emptyState();
let loaded = false;
let loadingPromise: Promise<void> | null = null;
const listeners = new Set<() => void>();

function emptyState(): State {
  return {
    rooms: [],
    menu: [],
    inventory: [],
    recipes: {},
    sessions: [],
    activity: [],
    salesLog: [],
    dailyCash: null,
  };
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

function getSnapshot(): State {
  return state;
}

function getServerSnapshot(): State {
  return state;
}

function emit() {
  listeners.forEach((l) => l());
}

function setState(next: State) {
  state = next;
  emit();
}

// ============ LOAD ============
async function loadAll(): Promise<State> {
  const today = new Date().toISOString().slice(0, 10);
  const [roomsR, ordersR, menuR, invR, recipesR, sessionsR, salesR, cashR] =
    await Promise.all([
      supabase.from("rooms").select("*"),
      supabase.from("room_orders").select("*"),
      supabase.from("menu_items").select("*"),
      supabase.from("inventory_items").select("*"),
      supabase.from("menu_item_ingredients").select("*"),
      supabase
        .from("sessions")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("sales_log")
        .select("*")
        .gte("sold_at", `${today}T00:00:00`)
        .lte("sold_at", `${today}T23:59:59.999`)
        .order("sold_at", { ascending: false }),
      supabase.from("daily_cash").select("*").eq("day", today).maybeSingle(),
    ]);

  if (roomsR.error) throw roomsR.error;
  if (ordersR.error) throw ordersR.error;
  if (menuR.error) throw menuR.error;
  if (invR.error) throw invR.error;
  if (recipesR.error) throw recipesR.error;
  if (sessionsR.error) throw sessionsR.error;
  if (salesR.error) throw salesR.error;
  if (cashR.error) throw cashR.error;

  const rooms = (roomsR.data as DbRoom[]).map(mapRoom);
  const orders = ordersR.data as DbOrder[];
  const menu = (menuR.data as DbMenuItem[]).map((m) => ({
    id: m.id,
    name: m.name,
    price: Number(m.price),
  }));
  const inventory = (invR.data as DbInventory[]).map((i) => ({
    id: i.id,
    name: i.name,
    unit: i.unit,
    currentStock: Number(i.current_stock),
    minimumStockLevel: Number(i.minimum_stock_level),
  }));
  const recipes: Recipes = {};
  for (const r of recipesR.data as DbRecipe[]) {
    const arr = recipes[r.menu_item_id] ?? [];
    arr.push({ invId: r.inventory_item_id, qty: Number(r.quantity_needed) });
    recipes[r.menu_item_id] = arr;
  }
  const sessions = (sessionsR.data as DbSession[]).map((s) => ({
    id: s.id,
    roomId: s.room_id,
    roomName: s.room_name,
    startedAt: new Date(s.started_at).getTime(),
    endedAt: new Date(s.ended_at).getTime(),
    seconds: s.seconds,
    timeCost: Number(s.time_cost),
    ordersCost: Number(s.orders_cost),
    total: Number(s.total),
  }));

  for (const r of rooms) {
    r.orders = orders
      .filter((o) => o.room_id === r.id)
      .map((o) => ({
        id: o.id,
        menuId: o.menu_item_id,
        name: o.name,
        price: Number(o.price),
        qty: o.qty,
      }));
  }

  const salesLog = (salesR.data as DbSalesLog[] | null ?? []).map((s) => ({
    id: s.id,
    menuItemId: s.menu_item_id,
    menuItemName: s.menu_item_name,
    qty: s.qty,
    unitPrice: Number(s.unit_price),
    total: Number(s.total),
    roomName: s.room_name,
    soldAt: new Date(s.sold_at).getTime(),
  }));
  const dailyCash = cashR.data
    ? {
        day: (cashR.data as DbDailyCash).day,
        actualCash: Number((cashR.data as DbDailyCash).actual_cash),
      }
    : null;

  return {
    rooms,
    menu,
    inventory,
    recipes,
    sessions,
    activity: state.activity,
    salesLog,
    dailyCash,
  };
}

function mapRoom(r: DbRoom): Room {
  return {
    id: r.id,
    name: r.name,
    isVIP: r.is_vip,
    hourlyRate: Number(r.hourly_rate),
    status: r.status,
    startedAt: r.started_at ? new Date(r.started_at).getTime() : null,
    orders: [],
    splitBill: r.split_bill,
  };
}

async function ensureLoaded() {
  if (loaded) return;
  if (!loadingPromise) {
    loadingPromise = (async () => {
      try {
        state = await loadAll();
        loaded = true;
        emit();
      } catch (err) {
        console.error("Failed to load from Supabase:", err);
        loadingPromise = null;
        throw err;
      }
    })();
  }
  return loadingPromise;
}

if (typeof window !== "undefined") {
  ensureLoaded().catch(() => {
    /* surfaced in console */
  });
}

export function useStore<T>(selector: (s: State) => T): T {
  if (typeof window !== "undefined" && !loaded && !loadingPromise) {
    ensureLoaded().catch(() => {});
  }
  return useSyncExternalStore(
    subscribe,
    () => selector(getSnapshot()),
    () => selector(getServerSnapshot()),
  );
}

// ============ HELPERS (pure) ============
export function roomElapsed(r: Room, now: number): number {
  if (r.status !== "active" || !r.startedAt) return 0;
  return Math.floor((now - r.startedAt) / 1000);
}
export function fmtDuration(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  const p = (n: number) => n.toString().padStart(2, "0");
  return `${p(h)}:${p(m)}:${p(ss)}`;
}
export function roomTimeCost(r: Room, now: number): number {
  return (roomElapsed(r, now) / 3600) * r.hourlyRate;
}
export function roomOrdersCost(r: Room): number {
  return r.orders.reduce((a, o) => a + o.price * o.qty, 0);
}

// ============ STOCK VALIDATION ============
// Total demand for each inventory item given a candidate order (menuId + qty)
// on top of all currently in-flight active room orders.
export function computeOrderDemand(
  s: State,
  menuId: string,
  qty: number,
): Record<string, number> {
  const demand: Record<string, number> = {};
  const add = (invId: string, n: number) => {
    demand[invId] = (demand[invId] || 0) + n;
  };
  for (const r of s.rooms) {
    if (r.status !== "active") continue;
    for (const o of r.orders) {
      const recipe = s.recipes[o.menuId];
      if (!recipe) continue;
      for (const line of recipe) add(line.invId, line.qty * o.qty);
    }
  }
  const recipe = s.recipes[menuId];
  if (recipe) for (const line of recipe) add(line.invId, line.qty * qty);
  return demand;
}

export function findInsufficientStock(
  s: State,
  menuId: string,
  qty: number,
): { invId: string; name: string; need: number; have: number }[] {
  const demand = computeOrderDemand(s, menuId, qty);
  const out: { invId: string; name: string; need: number; have: number }[] = [];
  for (const [invId, need] of Object.entries(demand)) {
    const inv = s.inventory.find((i) => i.id === invId);
    if (!inv) continue;
    if (need > inv.currentStock) {
      out.push({ invId, name: inv.name, need, have: inv.currentStock });
    }
  }
  return out;
}

// ============ ACTIONS ============
function logActivity(text: string, kind: Activity["kind"]) {
  const a: Activity = {
    id: `${Date.now()}-${Math.random()}`,
    ts: Date.now(),
    text,
    kind,
  };
  state = { ...state, activity: [a, ...state.activity].slice(0, 30) };
  emit();
}

export const actions = {
  async startRoom(roomId: string) {
    const now = new Date().toISOString();
    const { error } = await supabase
      .from("rooms")
      .update({ status: "active", started_at: now })
      .eq("id", roomId);
    if (error) {
      console.error("startRoom failed", error);
      return;
    }
    const room = state.rooms.find((r) => r.id === roomId);
    setState({
      ...state,
      rooms: state.rooms.map((r) =>
        r.id === roomId
          ? { ...r, status: "active", startedAt: Date.now() }
          : r,
      ),
    });
    if (room) logActivity(`${room.name} session started`, "start");
  },

  async endRoom(roomId: string) {
    const room = state.rooms.find((r) => r.id === roomId);
    if (!room || !room.startedAt) return;
    const endedAt = Date.now();
    const seconds = Math.floor((endedAt - room.startedAt) / 1000);
    const timeCost = (seconds / 3600) * room.hourlyRate;
    const ordersCost = roomOrdersCost(room);
    const total = timeCost + ordersCost;

    // Inserting a session row fires the DB trigger, which atomically deducts
    // recipe ingredients from inventory and clears this room's orders.
    const { error } = await supabase.from("sessions").insert({
      room_id: roomId,
      room_name: room.name,
      started_at: new Date(room.startedAt).toISOString(),
      ended_at: new Date(endedAt).toISOString(),
      seconds,
      time_cost: timeCost,
      orders_cost: ordersCost,
      total,
    });

    if (error) {
      console.error("endRoom failed", error);
      return;
    }

    await supabase
      .from("rooms")
      .update({ status: "available", started_at: null, split_bill: false })
      .eq("id", roomId);

    await refreshAll();
    await actions.refreshSalesLog();
    logActivity(`${room.name} closed — $${total.toFixed(2)}`, "end");
  },

  async addOrder(
    roomId: string,
    menuId: string,
    qty = 1,
  ): Promise<{ ok: boolean; reason?: string }> {
    const item = state.menu.find((m) => m.id === menuId);
    if (!item) return { ok: false, reason: "Unknown menu item" };

    const insufficient = findInsufficientStock(state, menuId, qty);
    if (insufficient.length > 0) {
      const names = insufficient.map((i) => i.name).join(", ");
      return { ok: false, reason: `Insufficient stock: ${names}` };
    }

    const { data, error } = await supabase
      .from("room_orders")
      .insert({
        room_id: roomId,
        menu_item_id: menuId,
        name: item.name,
        price: item.price,
        qty,
      })
      .select("id")
      .single();

    if (error) {
      console.error("addOrder failed", error);
      return { ok: false, reason: error.message };
    }

    const orderLine: OrderLine = {
      id: data.id,
      menuId,
      name: item.name,
      price: item.price,
      qty,
    };
    setState({
      ...state,
      rooms: state.rooms.map((r) =>
        r.id === roomId ? { ...r, orders: [...r.orders, orderLine] } : r,
      ),
    });
    const room = state.rooms.find((r) => r.id === roomId);
    if (room) logActivity(`${room.name} + ${item.name}`, "order");
    return { ok: true };
  },

  async toggleSplit(roomId: string) {
    const room = state.rooms.find((r) => r.id === roomId);
    if (!room) return;
    const next = !room.splitBill;
    await supabase.from("rooms").update({ split_bill: next }).eq("id", roomId);
    setState({
      ...state,
      rooms: state.rooms.map((r) =>
        r.id === roomId ? { ...r, splitBill: next } : r,
      ),
    });
  },

  async setHourlyRate(roomId: string, rate: number) {
    await supabase.from("rooms").update({ hourly_rate: rate }).eq("id", roomId);
    setState({
      ...state,
      rooms: state.rooms.map((r) =>
        r.id === roomId ? { ...r, hourlyRate: rate } : r,
      ),
    });
  },

  async setInventoryStock(
    invId: string,
    currentStock: number,
    minimumStockLevel?: number,
  ) {
    const patch: Record<string, number> = { current_stock: currentStock };
    if (minimumStockLevel !== undefined)
      patch.minimum_stock_level = minimumStockLevel;
    await supabase.from("inventory_items").update(patch).eq("id", invId);
    setState({
      ...state,
      inventory: state.inventory.map((i) =>
        i.id === invId
          ? {
              ...i,
              currentStock,
              minimumStockLevel: minimumStockLevel ?? i.minimumStockLevel,
            }
          : i,
      ),
    });
  },

  async setMinimumStock(invId: string, minimumStockLevel: number) {
    await supabase
      .from("inventory_items")
      .update({ minimum_stock_level: minimumStockLevel })
      .eq("id", invId);
    setState({
      ...state,
      inventory: state.inventory.map((i) =>
        i.id === invId ? { ...i, minimumStockLevel } : i,
      ),
    });
  },

  async setRecipe(menuId: string, lines: RecipeLine[]) {
    await supabase
      .from("menu_item_ingredients")
      .delete()
      .eq("menu_item_id", menuId);
    if (lines.length > 0) {
      await supabase.from("menu_item_ingredients").insert(
        lines.map((l) => ({
          menu_item_id: menuId,
          inventory_item_id: l.invId,
          quantity_needed: l.qty,
        })),
      );
    }
    setState({ ...state, recipes: { ...state.recipes, [menuId]: lines } });
  },

  async refreshInventory() {
    const { data, error } = await supabase
      .from("inventory_items")
      .select("*");
    if (error || !data) return;
    const inv = (data as DbInventory[]).map((i) => ({
      id: i.id,
      name: i.name,
      unit: i.unit,
      currentStock: Number(i.current_stock),
      minimumStockLevel: Number(i.minimum_stock_level),
    }));
    setState({ ...state, inventory: inv });
  },

  async addMenuItem(
    name: string,
    price: number,
    recipeLines: RecipeLine[],
  ): Promise<{ ok: boolean; reason?: string; id?: string }> {
    if (!name.trim()) return { ok: false, reason: "Name is required" };
    if (price < 0) return { ok: false, reason: "Price must be ≥ 0" };

    const { data, error } = await supabase
      .from("menu_items")
      .insert({ name: name.trim(), price })
      .select("id, name, price")
      .single();

    if (error) {
      return { ok: false, reason: error.message };
    }

    const newMenu: MenuItem = {
      id: data.id,
      name: data.name,
      price: Number(data.price),
    };

    if (recipeLines.length > 0) {
      const { error: rErr } = await supabase
        .from("menu_item_ingredients")
        .insert(
          recipeLines.map((l) => ({
            menu_item_id: data.id,
            inventory_item_id: l.invId,
            quantity_needed: l.qty,
          })),
        );
      if (rErr) {
        return { ok: false, reason: rErr.message, id: data.id };
      }
    }

    setState({
      ...state,
      menu: [...state.menu, newMenu],
      recipes: { ...state.recipes, [data.id]: recipeLines },
    });
    return { ok: true, id: data.id };
  },

  async setActualCash(actualCash: number) {
    const today = new Date().toISOString().slice(0, 10);
    const { data, error } = await supabase
      .from("daily_cash")
      .upsert(
        { day: today, actual_cash: actualCash, updated_at: new Date().toISOString() },
        { onConflict: "day" },
      )
      .select("day, actual_cash")
      .single();

    if (error) {
      console.error("setActualCash failed", error);
      return;
    }
    setState({
      ...state,
      dailyCash: { day: data.day, actualCash: Number(data.actual_cash) },
    });
  },

  async snapshotMonth(month: string): Promise<{ ok: boolean; count?: number; reason?: string }> {
    const monthStart = `${month}-01`;
    const { data, error } = await supabase.rpc("snapshot_inventory_for_month", {
      p_month: monthStart,
    });
    if (error) return { ok: false, reason: error.message };
    return { ok: true, count: Number(data) };
  },

  async getMonthlySnapshot(month: string) {
    const monthStart = `${month}-01`;
    const { data, error } = await supabase
      .from("inventory_snapshots")
      .select("*")
      .eq("month", monthStart);
    if (error) return null;
    return data;
  },

  async refreshSalesLog() {
    const today = new Date().toISOString().slice(0, 10);
    const { data, error } = await supabase
      .from("sales_log")
      .select("*")
      .gte("sold_at", `${today}T00:00:00`)
      .lte("sold_at", `${today}T23:59:59.999`)
      .order("sold_at", { ascending: false });
    if (error || !data) return;
    const salesLog = (data as DbSalesLog[]).map((s) => ({
      id: s.id,
      menuItemId: s.menu_item_id,
      menuItemName: s.menu_item_name,
      qty: s.qty,
      unitPrice: Number(s.unit_price),
      total: Number(s.total),
      roomName: s.room_name,
      soldAt: new Date(s.sold_at).getTime(),
    }));
    setState({ ...state, salesLog });
  },
};

async function refreshAll() {
  try {
    state = await loadAll();
    emit();
  } catch (err) {
    console.error("refreshAll failed", err);
  }
}
