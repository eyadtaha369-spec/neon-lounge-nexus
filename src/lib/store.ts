import { useSyncExternalStore } from "react";

// ============ TYPES ============
export type MenuItem = { id: string; name: string; price: number };
export type OrderLine = { menuId: string; name: string; price: number; qty: number };
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
  initial: number;
  used: number; // from End-of-Day + room orders
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
  salesEntry: Record<string, number>; // menuId -> qty
  actualCash: number;
};

const STORAGE_KEY = "glitch-lounge-v1";

// ============ SEED ============
function seed(): State {
  const menu: MenuItem[] = [
    { id: "espresso", name: "Espresso", price: 3 },
    { id: "latte", name: "Latte", price: 4.5 },
    { id: "lemonade", name: "Lemonade", price: 3.5 },
    { id: "soda", name: "Soda", price: 2 },
    { id: "chips", name: "Chips", price: 3 },
    { id: "water", name: "Water", price: 1.5 },
  ];

  const rooms: Room[] = Array.from({ length: 8 }).map((_, i) => ({
    id: `room-${i + 1}`,
    name: `Room ${i + 1}`,
    isVIP: false,
    hourlyRate: 5,
    status: "available",
    startedAt: null,
    orders: [],
    splitBill: false,
  }));
  rooms.push({
    id: "room-vip",
    name: "VIP",
    isVIP: true,
    hourlyRate: 10,
    status: "available",
    startedAt: null,
    orders: [],
    splitBill: false,
  });

  const inventory: InventoryItem[] = [
    { id: "beans", name: "Espresso Beans", unit: "g", initial: 1000, used: 0 },
    { id: "milk", name: "Milk", unit: "ml", initial: 5000, used: 0 },
    { id: "sugar", name: "Sugar", unit: "g", initial: 2000, used: 0 },
    { id: "lemon", name: "Lemon", unit: "pcs", initial: 40, used: 0 },
    { id: "soda-cans", name: "Soda Cans", unit: "units", initial: 60, used: 0 },
    { id: "chips-bags", name: "Chips Bags", unit: "units", initial: 40, used: 0 },
    { id: "water-bottles", name: "Water Bottles", unit: "units", initial: 80, used: 0 },
  ];

  const recipes: Recipes = {
    espresso: [{ invId: "beans", qty: 18 }],
    latte: [
      { invId: "beans", qty: 18 },
      { invId: "milk", qty: 200 },
    ],
    lemonade: [
      { invId: "lemon", qty: 2 },
      { invId: "sugar", qty: 20 },
    ],
    soda: [{ invId: "soda-cans", qty: 1 }],
    chips: [{ invId: "chips-bags", qty: 1 }],
    water: [{ invId: "water-bottles", qty: 1 }],
  };

  return {
    rooms,
    menu,
    inventory,
    recipes,
    sessions: [],
    activity: [],
    salesEntry: {},
    actualCash: 0,
  };
}

// ============ REACTIVE STORE ============
let state: State = load();
const listeners = new Set<() => void>();

function load(): State {
  if (typeof window === "undefined") return seed();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return seed();
    const parsed = JSON.parse(raw) as Partial<State>;
    const s = seed();
    return { ...s, ...parsed };
  } catch {
    return seed();
  }
}

function persist() {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

function emit() {
  persist();
  listeners.forEach((l) => l());
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

export function useStore<T>(selector: (s: State) => T): T {
  return useSyncExternalStore(
    subscribe,
    () => selector(getSnapshot()),
    () => selector(getServerSnapshot()),
  );
}

function setState(mut: (s: State) => State) {
  state = mut(state);
  emit();
}

// ============ ACTIONS ============
function logActivity(text: string, kind: Activity["kind"]) {
  const a: Activity = { id: `${Date.now()}-${Math.random()}`, ts: Date.now(), text, kind };
  state.activity = [a, ...state.activity].slice(0, 30);
}

export const actions = {
  startRoom(roomId: string) {
    setState((s) => ({
      ...s,
      rooms: s.rooms.map((r) =>
        r.id === roomId ? { ...r, status: "active", startedAt: Date.now() } : r,
      ),
    }));
    const r = state.rooms.find((x) => x.id === roomId)!;
    logActivity(`${r.name} session started`, "start");
    emit();
  },
  endRoom(roomId: string) {
    const room = state.rooms.find((r) => r.id === roomId);
    if (!room || !room.startedAt) return;
    const endedAt = Date.now();
    const seconds = Math.floor((endedAt - room.startedAt) / 1000);
    const timeCost = (seconds / 3600) * room.hourlyRate;
    const ordersCost = room.orders.reduce((a, o) => a + o.price * o.qty, 0);
    const session: CompletedSession = {
      id: `s-${endedAt}-${roomId}`,
      roomId,
      roomName: room.name,
      startedAt: room.startedAt,
      endedAt,
      seconds,
      timeCost,
      ordersCost,
      total: timeCost + ordersCost,
    };
    // deduct inventory for orders in this session
    const invDelta: Record<string, number> = {};
    for (const o of room.orders) {
      const recipe = state.recipes[o.menuId];
      if (!recipe) continue;
      for (const line of recipe) {
        invDelta[line.invId] = (invDelta[line.invId] || 0) + line.qty * o.qty;
      }
    }
    setState((s) => ({
      ...s,
      sessions: [session, ...s.sessions],
      inventory: s.inventory.map((i) =>
        invDelta[i.id] ? { ...i, used: i.used + invDelta[i.id] } : i,
      ),
      rooms: s.rooms.map((r) =>
        r.id === roomId
          ? { ...r, status: "available", startedAt: null, orders: [], splitBill: false }
          : r,
      ),
    }));
    logActivity(`${room.name} closed — $${session.total.toFixed(2)}`, "end");
    emit();
  },
  addOrder(roomId: string, menuId: string) {
    const item = state.menu.find((m) => m.id === menuId);
    if (!item) return;
    setState((s) => ({
      ...s,
      rooms: s.rooms.map((r) => {
        if (r.id !== roomId) return r;
        const existing = r.orders.find((o) => o.menuId === menuId);
        const orders = existing
          ? r.orders.map((o) => (o.menuId === menuId ? { ...o, qty: o.qty + 1 } : o))
          : [...r.orders, { menuId, name: item.name, price: item.price, qty: 1 }];
        return { ...r, orders };
      }),
    }));
    const r = state.rooms.find((x) => x.id === roomId)!;
    logActivity(`${r.name} + ${item.name}`, "order");
    emit();
  },
  toggleSplit(roomId: string) {
    setState((s) => ({
      ...s,
      rooms: s.rooms.map((r) => (r.id === roomId ? { ...r, splitBill: !r.splitBill } : r)),
    }));
  },
  setHourlyRate(roomId: string, rate: number) {
    setState((s) => ({
      ...s,
      rooms: s.rooms.map((r) => (r.id === roomId ? { ...r, hourlyRate: rate } : r)),
    }));
  },
  setInitialStock(invId: string, initial: number) {
    setState((s) => ({
      ...s,
      inventory: s.inventory.map((i) => (i.id === invId ? { ...i, initial } : i)),
    }));
  },
  setRecipe(menuId: string, lines: RecipeLine[]) {
    setState((s) => ({ ...s, recipes: { ...s.recipes, [menuId]: lines } }));
  },
  setSalesQty(menuId: string, qty: number) {
    setState((s) => ({ ...s, salesEntry: { ...s.salesEntry, [menuId]: qty } }));
  },
  submitEndOfDay() {
    // deduct inventory based on salesEntry
    const invDelta: Record<string, number> = {};
    for (const [menuId, qty] of Object.entries(state.salesEntry)) {
      if (!qty) continue;
      const recipe = state.recipes[menuId];
      if (!recipe) continue;
      for (const line of recipe) {
        invDelta[line.invId] = (invDelta[line.invId] || 0) + line.qty * qty;
      }
    }
    setState((s) => ({
      ...s,
      inventory: s.inventory.map((i) =>
        invDelta[i.id] ? { ...i, used: i.used + invDelta[i.id] } : i,
      ),
      salesEntry: {},
    }));
  },
  setActualCash(v: number) {
    setState((s) => ({ ...s, actualCash: v }));
  },
  resetInventoryUsage() {
    setState((s) => ({ ...s, inventory: s.inventory.map((i) => ({ ...i, used: 0 })) }));
  },
};

// ============ HELPERS ============
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