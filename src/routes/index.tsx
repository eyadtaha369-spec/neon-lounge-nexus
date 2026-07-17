import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Activity as ActivityIcon,
  DollarSign,
  Gamepad2,
  AlertTriangle,
  TrendingUp,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useStore, roomTimeCost, roomOrdersCost } from "@/lib/store";

export const Route = createFileRoute("/")({
  component: Dashboard,
});

function useTicker(intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

function Dashboard() {
  const rooms = useStore((s) => s.rooms);
  const sessions = useStore((s) => s.sessions);
  const inventory = useStore((s) => s.inventory);
  const activity = useStore((s) => s.activity);
  const now = useTicker();

  const activeCount = rooms.filter((r) => r.status === "active").length;
  const availableCount = rooms.length - activeCount;

  const liveRevenue = rooms.reduce(
    (a, r) => a + roomTimeCost(r, now) + roomOrdersCost(r),
    0,
  );
  const completedRevenue = sessions.reduce((a, s) => a + s.total, 0);
  const totalRevenue = liveRevenue + completedRevenue;

  const alerts = inventory.filter(
    (i) => i.currentStock <= i.minimumStockLevel,
  );

  const chartData = rooms.map((r) => {
    const done = sessions
      .filter((s) => s.roomId === r.id)
      .reduce((a, s) => a + s.total, 0);
    const live = roomTimeCost(r, now) + roomOrdersCost(r);
    return { name: r.name, revenue: +(done + live).toFixed(2) };
  });

  return (
    <div className="max-w-7xl mx-auto space-y-8">
      <header>
        <div className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
          Overview
        </div>
        <h1 className="text-3xl md:text-4xl font-bold mt-1">
          <span className="neon-text-cyan">Dashboard</span>
        </h1>
        <p className="text-muted-foreground text-sm mt-2">
          Live status across all {rooms.length} rooms and inventory alerts.
        </p>
      </header>

      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          label="Active Rooms"
          value={`${activeCount}/${rooms.length}`}
          icon={<Gamepad2 className="h-5 w-5" />}
          accent="blue"
        />
        <MetricCard
          label="Revenue Today"
          value={`$${totalRevenue.toFixed(2)}`}
          icon={<DollarSign className="h-5 w-5" />}
          accent="cyan"
        />
        <MetricCard
          label="Available Rooms"
          value={String(availableCount)}
          icon={<TrendingUp className="h-5 w-5" />}
          accent="purple"
        />
        <MetricCard
          label="Stock Alerts"
          value={String(alerts.length)}
          icon={<AlertTriangle className="h-5 w-5" />}
          accent={alerts.length > 0 ? "warning" : "muted"}
        />
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="glass-card p-6 lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold">Revenue by Room</h2>
            <span className="text-xs text-muted-foreground">Live + completed</span>
          </div>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid stroke="oklch(1 0 0 / 0.06)" vertical={false} />
                <XAxis
                  dataKey="name"
                  tick={{ fill: "oklch(0.7 0.03 265)", fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: "oklch(0.7 0.03 265)", fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  cursor={{ fill: "oklch(1 0 0 / 0.04)" }}
                  contentStyle={{
                    background: "oklch(0.15 0.03 275)",
                    border: "1px solid oklch(0.5 0.05 280 / 0.4)",
                    borderRadius: 8,
                    color: "white",
                  }}
                />
                <Bar dataKey="revenue" fill="oklch(0.75 0.2 250)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="glass-card p-6">
          <div className="flex items-center gap-2 mb-4">
            <ActivityIcon className="h-4 w-4 text-neon-cyan" />
            <h2 className="font-semibold">Recent Activity</h2>
          </div>
          <ul className="space-y-3 max-h-72 overflow-y-auto pr-1">
            {activity.length === 0 && (
              <li className="text-sm text-muted-foreground">
                No activity yet — start a room to begin.
              </li>
            )}
            {activity.map((a) => (
              <li key={a.id} className="flex items-start gap-3 text-sm">
                <span
                  className={`mt-1.5 h-2 w-2 rounded-full shrink-0 ${
                    a.kind === "start"
                      ? "bg-success"
                      : a.kind === "end"
                        ? "bg-neon-blue"
                        : "bg-neon-purple"
                  }`}
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate">{a.text}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {new Date(a.ts).toLocaleTimeString()}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}

function MetricCard({
  label,
  value,
  icon,
  accent,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  accent: "blue" | "cyan" | "purple" | "warning" | "muted";
}) {
  const accentClass =
    accent === "blue"
      ? "text-neon-blue"
      : accent === "cyan"
        ? "text-neon-cyan"
        : accent === "purple"
          ? "text-neon-purple"
          : accent === "warning"
            ? "text-warning"
            : "text-muted-foreground";
  return (
    <div className="glass-card p-5 relative overflow-hidden">
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
        <span className={accentClass}>{icon}</span>
      </div>
      <div className={`mt-3 text-3xl font-bold font-mono-display ${accentClass}`}>
        {value}
      </div>
    </div>
  );
}
