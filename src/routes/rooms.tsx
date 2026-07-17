import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Play, Square, Plus, Printer, Crown, Gamepad2, X } from "lucide-react";
import {
  actions,
  fmtDuration,
  roomElapsed,
  roomOrdersCost,
  roomTimeCost,
  useStore,
  type Room,
} from "@/lib/store";

export const Route = createFileRoute("/rooms")({
  head: () => ({
    meta: [
      { title: "Rooms — GLITCH Lounge Manager" },
      {
        name: "description",
        content: "Manage 9 gaming rooms with live timers, orders, and checkout.",
      },
    ],
  }),
  component: RoomsPage,
});

function useTicker() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

function RoomsPage() {
  const rooms = useStore((s) => s.rooms);
  const menu = useStore((s) => s.menu);
  const now = useTicker();
  const [printRoomId, setPrintRoomId] = useState<string | null>(null);
  const [addOrderRoomId, setAddOrderRoomId] = useState<string | null>(null);

  const printRoom = rooms.find((r) => r.id === printRoomId) || null;
  const orderRoom = rooms.find((r) => r.id === addOrderRoomId) || null;

  return (
    <div className="max-w-7xl mx-auto space-y-8">
      <header>
        <div className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
          Floor
        </div>
        <h1 className="text-3xl md:text-4xl font-bold mt-1">
          <span className="neon-text-cyan">Rooms</span>
        </h1>
        <p className="text-muted-foreground text-sm mt-2">
          9 stations · live timers · orders · split-bill checkout.
        </p>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
        {rooms.map((r) => (
          <RoomCard
            key={r.id}
            room={r}
            now={now}
            onPrint={() => setPrintRoomId(r.id)}
            onAddOrder={() => setAddOrderRoomId(r.id)}
          />
        ))}
      </div>

      {orderRoom && (
        <OrderModal
          room={orderRoom}
          menu={menu}
          onClose={() => setAddOrderRoomId(null)}
        />
      )}
      {printRoom && <PrintModal room={printRoom} now={now} onClose={() => setPrintRoomId(null)} />}
    </div>
  );
}

function RoomCard({
  room,
  now,
  onPrint,
  onAddOrder,
}: {
  room: Room;
  now: number;
  onPrint: () => void;
  onAddOrder: () => void;
}) {
  const active = room.status === "active";
  const elapsed = roomElapsed(room, now);
  const timeCost = roomTimeCost(room, now);
  const ordersCost = roomOrdersCost(room);
  const total = timeCost + ordersCost;

  return (
    <div
      className={`glass-card p-5 flex flex-col gap-4 transition-all ${
        room.isVIP ? "neon-border-gold" : active ? "neon-border-blue" : ""
      }`}
    >
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {room.isVIP ? (
              <Crown className="h-4 w-4 text-neon-gold shrink-0" />
            ) : (
              <Gamepad2 className="h-4 w-4 text-neon-blue shrink-0" />
            )}
            <h3 className="font-bold text-lg truncate">{room.name}</h3>
            {room.isVIP && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-neon-gold/15 text-neon-gold uppercase tracking-wider shrink-0">
                VIP
              </span>
            )}
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            ${room.hourlyRate.toFixed(2)}/hr
          </div>
        </div>
        <StatusBadge active={active} />
      </div>

      <div className="rounded-lg bg-black/30 border border-border/50 p-4 text-center">
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
          Session
        </div>
        <div
          className={`font-mono-display text-3xl font-bold mt-1 ${
            active ? "neon-text-cyan" : "text-muted-foreground"
          }`}
        >
          {fmtDuration(elapsed)}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm">
        <Stat label="Time cost" value={`$${timeCost.toFixed(2)}`} />
        <Stat label="Orders" value={`$${ordersCost.toFixed(2)}`} />
      </div>

      <div className="rounded-lg border border-border/50 p-3 flex items-center justify-between">
        <span className="text-xs uppercase tracking-wider text-muted-foreground">
          Total
        </span>
        <span className="text-xl font-bold font-mono-display neon-text-blue">
          ${total.toFixed(2)}
        </span>
      </div>

      {room.orders.length > 0 && (
        <ul className="text-xs space-y-1 max-h-24 overflow-y-auto">
          {room.orders.map((o) => (
            <li key={o.menuId} className="flex justify-between text-muted-foreground">
              <span className="truncate">
                {o.qty}× {o.name}
              </span>
              <span>${(o.price * o.qty).toFixed(2)}</span>
            </li>
          ))}
        </ul>
      )}

      <label className="flex items-center gap-2 text-xs text-muted-foreground select-none cursor-pointer">
        <input
          type="checkbox"
          checked={room.splitBill}
          onChange={() => actions.toggleSplit(room.id)}
          className="accent-[oklch(0.72_0.19_260)]"
        />
        Split bill (time vs orders)
      </label>

      <div className="flex flex-wrap gap-2">
        {!active ? (
          <button
            onClick={() => actions.startRoom(room.id)}
            className="flex-1 min-w-[100px] inline-flex items-center justify-center gap-2 rounded-lg bg-success/20 border border-success/40 px-3 py-2 text-sm font-medium text-success hover:bg-success/30 transition-all"
          >
            <Play className="h-4 w-4" /> Start
          </button>
        ) : (
          <button
            onClick={() => actions.endRoom(room.id)}
            className="flex-1 min-w-[100px] inline-flex items-center justify-center gap-2 rounded-lg bg-destructive/20 border border-destructive/40 px-3 py-2 text-sm font-medium text-destructive hover:bg-destructive/30 transition-all"
          >
            <Square className="h-4 w-4" /> End
          </button>
        )}
        <button
          onClick={onAddOrder}
          className="flex-1 min-w-[100px] inline-flex items-center justify-center gap-2 rounded-lg bg-primary/15 border border-primary/40 px-3 py-2 text-sm font-medium hover:bg-primary/25 transition-all"
        >
          <Plus className="h-4 w-4" /> Order
        </button>
        <button
          onClick={onPrint}
          disabled={elapsed === 0 && room.orders.length === 0}
          className="flex-1 min-w-[100px] inline-flex items-center justify-center gap-2 rounded-lg border border-border/60 px-3 py-2 text-sm font-medium hover:bg-white/5 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Printer className="h-4 w-4" /> Check
        </button>
      </div>
    </div>
  );
}

function StatusBadge({ active }: { active: boolean }) {
  return active ? (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-success/15 text-success text-[11px] font-medium px-2.5 py-1 pulse-active">
      <span className="h-1.5 w-1.5 rounded-full bg-success" />
      Active
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-muted text-muted-foreground text-[11px] font-medium px-2.5 py-1">
      <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground" />
      Available
    </span>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="font-mono-display font-semibold mt-0.5">{value}</div>
    </div>
  );
}

function OrderModal({
  room,
  menu,
  onClose,
}: {
  room: Room;
  menu: { id: string; name: string; price: number }[];
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="glass-card p-6 max-w-md w-full">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground">
              Add order
            </div>
            <h3 className="font-bold text-lg">{room.name}</h3>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-white/5"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {menu.map((m) => (
            <button
              key={m.id}
              onClick={() => actions.addOrder(room.id, m.id)}
              className="rounded-lg border border-border/60 p-3 text-left hover:bg-primary/10 hover:border-primary/40 transition-all"
            >
              <div className="font-medium">{m.name}</div>
              <div className="text-xs text-neon-cyan mt-1">${m.price.toFixed(2)}</div>
            </button>
          ))}
        </div>
        <div className="mt-4 text-xs text-muted-foreground text-center">
          Tap an item to add. Close when done.
        </div>
      </div>
    </div>
  );
}

function PrintModal({
  room,
  now,
  onClose,
}: {
  room: Room;
  now: number;
  onClose: () => void;
}) {
  const elapsed = roomElapsed(room, now);
  const timeCost = roomTimeCost(room, now);
  const ordersCost = roomOrdersCost(room);
  const total = timeCost + ordersCost;
  const ts = useMemo(() => new Date().toLocaleString(), []);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4 bg-black/70 backdrop-blur-sm print:bg-white print:p-0 print:static">
      <div className="print-receipt glass-card max-w-sm w-full p-6 print:shadow-none print:border-0 print:bg-white print:text-black">
        <div className="flex items-center justify-between mb-4 no-print">
          <h3 className="font-bold">Receipt Preview</h3>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-white/5">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="text-center border-b border-dashed border-border/60 pb-3 mb-3 print:border-black">
          <div className="font-bold tracking-widest">GLITCH LOUNGE</div>
          <div className="text-xs text-muted-foreground print:text-black">{ts}</div>
          <div className="text-xs mt-1 print:text-black">{room.name}</div>
        </div>
        <div className="font-mono-display text-sm space-y-1">
          <Row label="Duration" value={fmtDuration(elapsed)} />
          <Row label="Rate" value={`$${room.hourlyRate.toFixed(2)}/hr`} />
        </div>
        {room.orders.length > 0 && (
          <div className="mt-3 pt-3 border-t border-dashed border-border/60 print:border-black font-mono-display text-sm space-y-1">
            {room.orders.map((o) => (
              <Row
                key={o.menuId}
                label={`${o.qty}× ${o.name}`}
                value={`$${(o.price * o.qty).toFixed(2)}`}
              />
            ))}
          </div>
        )}
        <div className="mt-3 pt-3 border-t border-dashed border-border/60 print:border-black font-mono-display text-sm space-y-1">
          {room.splitBill ? (
            <>
              <Row label="Room / Time Cost" value={`$${timeCost.toFixed(2)}`} />
              <Row label="Drinks / Orders Cost" value={`$${ordersCost.toFixed(2)}`} />
              <div className="pt-2 mt-2 border-t border-border/60 print:border-black">
                <Row label="GRAND TOTAL" value={`$${total.toFixed(2)}`} bold />
              </div>
            </>
          ) : (
            <Row label="TOTAL" value={`$${total.toFixed(2)}`} bold />
          )}
        </div>
        <div className="text-center text-xs mt-4 text-muted-foreground print:text-black">
          Thank you for playing!
        </div>
        <div className="flex gap-2 mt-6 no-print">
          <button
            onClick={() => window.print()}
            className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-primary/20 border border-primary/40 px-3 py-2 text-sm font-medium hover:bg-primary/30"
          >
            <Printer className="h-4 w-4" /> Print
          </button>
          <button
            onClick={onClose}
            className="flex-1 rounded-lg border border-border/60 px-3 py-2 text-sm hover:bg-white/5"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  bold,
}: {
  label: string;
  value: string;
  bold?: boolean;
}) {
  return (
    <div
      className={`flex justify-between gap-3 ${bold ? "font-bold text-base" : ""}`}
    >
      <span className="truncate">{label}</span>
      <span>{value}</span>
    </div>
  );
}
