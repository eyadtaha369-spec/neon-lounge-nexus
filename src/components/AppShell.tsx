import { Link, useRouterState } from "@tanstack/react-router";
import { LayoutDashboard, Gamepad2, Package, Zap } from "lucide-react";
import type { ReactNode } from "react";

const nav = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/rooms", label: "Rooms", icon: Gamepad2 },
  { to: "/inventory", label: "Inventory", icon: Package },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <div className="min-h-screen flex flex-col md:flex-row text-foreground">
      {/* Sidebar (desktop) / topbar (mobile) */}
      <aside className="md:w-64 md:min-h-screen md:border-r border-b md:border-b-0 border-border/60 bg-sidebar/80 backdrop-blur-xl md:sticky md:top-0 no-print">
        <div className="p-6 flex items-center gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg neon-border-purple bg-black/40">
            <Zap className="h-5 w-5 text-neon-purple" />
          </div>
          <div className="min-w-0">
            <div className="font-bold text-lg tracking-wide">
              <span className="neon-text-cyan">GLITCH</span>
            </div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              Lounge Manager
            </div>
          </div>
        </div>
        <nav className="px-3 pb-6 flex md:flex-col gap-1 overflow-x-auto">
          {nav.map((n) => {
            const active =
              n.to === "/" ? pathname === "/" : pathname.startsWith(n.to);
            const Icon = n.icon;
            return (
              <Link
                key={n.to}
                to={n.to}
                className={`group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all shrink-0 ${
                  active
                    ? "bg-primary/15 text-foreground neon-border-blue"
                    : "text-muted-foreground hover:text-foreground hover:bg-white/5"
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span>{n.label}</span>
              </Link>
            );
          })}
        </nav>
      </aside>
      <main className="flex-1 min-w-0 p-4 md:p-8">{children}</main>
    </div>
  );
}