"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ConnectButton, useCurrentAccount } from "@mysten/dapp-kit";
import { useAuth } from "@/hooks/use-auth";

const NAV_ITEMS = [
  { path: "/", label: "Dashboard", icon: "M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z" },
  { path: "/map", label: "Tactical Map", icon: "M12 2v20M2 12h20M12 2l3 3M12 2l-3 3M12 22l3-3M12 22l-3-3M2 12l3-3M2 12l3 3M22 12l-3-3M22 12l-3 3" },
  { path: "/submit", label: "Submit Intel", icon: "M12 19V5M5 12l7-7 7 7" },
  { path: "/bounties", label: "Bounties", icon: "M12 2a10 10 0 100 20 10 10 0 000-20zM12 6a6 6 0 100 12 6 6 0 000-12zM12 10a2 2 0 100 4 2 2 0 000-4z" },
  { path: "/subscribe", label: "Membership", icon: "M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 16.8l-6.2 4.5 2.4-7.4L2 9.4h7.6z" },
  { path: "/store", label: "Plugin Store", icon: "M3 3h5v5H3zM10 3h5v5h-5zM17 3h5v5h-5zM3 10h5v5H3zM10 10h5v5h-5zM17 10h5v5h-5zM3 17h5v5H3zM10 17h5v5h-5zM17 17h5v5h-5z" },
] as const;

interface SidebarProps {
  collapsed: boolean;
  onToggle?: () => void;
}

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const pathname = usePathname();
  const account = useCurrentAccount();
  const auth = useAuth();

  return (
    <nav
      className={`fixed top-0 left-0 h-screen bg-eve-panel border-r border-eve-panel-border flex flex-col z-40 transition-all duration-200 ${
        collapsed ? "w-14" : "w-[200px]"
      }`}
    >
      {/* Brand */}
      <div className="px-3 py-4 border-b border-eve-panel-border">
        {!collapsed && (
          <span className="text-[0.66rem] tracking-widest uppercase text-eve-cold border border-eve-panel-border px-1.5 py-0.5">
            FEH
          </span>
        )}
        {collapsed && (
          <span className="text-xs text-eve-cold font-bold block text-center">F</span>
        )}
      </div>

      {/* Nav Items */}
      <div className="flex-1 py-2 flex flex-col gap-0.5">
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.path;
          return (
            <Link
              key={item.path}
              href={item.path}
              className={`flex items-center gap-2.5 px-3 py-2.5 text-xs tracking-wide transition-colors ${
                active
                  ? "text-eve-text bg-[rgba(16,22,31,0.9)] border-r-2 border-eve-danger/50"
                  : "text-eve-muted hover:text-eve-text hover:bg-[rgba(16,22,31,0.5)]"
              }`}
              title={collapsed ? item.label : undefined}
            >
              <svg
                viewBox="0 0 24 24"
                className={`w-4 h-4 shrink-0 ${active ? "animate-pulse-dot" : ""}`}
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                <path d={item.icon} />
              </svg>
              {!collapsed && <span>{item.label}</span>}
            </Link>
          );
        })}
      </div>

      {/* Wallet Section */}
      <div className="border-t border-eve-panel-border p-3">
        {account ? (
          <div className={collapsed ? "text-center" : ""}>
            <p className="text-[0.6rem] text-eve-muted truncate">
              {collapsed
                ? account.address.slice(0, 4)
                : `${account.address.slice(0, 6)}...${account.address.slice(-4)}`}
            </p>
            {!collapsed && (
              <span
                className={`text-[0.58rem] border px-1 py-0.5 mt-1 inline-block ${
                  auth.isPremium
                    ? "border-eve-gold/60 text-eve-gold"
                    : "border-eve-panel-border text-eve-muted"
                }`}
              >
                {auth.isPremium ? "PREMIUM" : "FREE"}
              </span>
            )}
          </div>
        ) : (
          <ConnectButton />
        )}
      </div>

      {/* Collapse Toggle */}
      <button
        onClick={onToggle}
        className="border-t border-eve-panel-border p-2 text-eve-muted hover:text-eve-text text-xs text-center"
      >
        {collapsed ? ">" : "<"}
      </button>
    </nav>
  );
}
