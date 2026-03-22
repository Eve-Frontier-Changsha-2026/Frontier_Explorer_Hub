"use client";

import type { ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { ToastContainer } from "./ToastContainer";
import { useUIStore } from "@/stores/ui-store";

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const collapsed = useUIStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);

  return (
    <>
      {/* Scanline overlay */}
      <div className="fixed inset-0 z-50 pointer-events-none opacity-[0.04]">
        <div className="w-full h-px bg-eve-cold/40 animate-scanline" />
      </div>

      {/* Noise overlay */}
      <div className="fixed inset-0 -z-10 pointer-events-none opacity-[0.18] bg-eve-noise" />

      <Sidebar collapsed={collapsed} onToggle={toggleSidebar} />

      <main
        className={`min-h-screen transition-all duration-200 ${
          collapsed ? "ml-14" : "ml-[200px]"
        }`}
      >
        <div className="max-w-[1300px] mx-auto p-4">
          {children}
        </div>
      </main>

      <ToastContainer />
    </>
  );
}
