import React from "react";
import { cn } from "../lib/utils";
import { CursorEffect } from "./CursorEffect";
import {
  Home,
  LayoutDashboard,
  Database,
  Code,
  Settings,
  User,
  ChevronRight,
  Users,
  Gauge,
  Cog
} from "lucide-react";

import { APP_URLS } from "../lib/navigation";

interface UserData {
  email: string;
  displayName?: string;
  role?: string;
}

interface AppShellProps {
  children: React.ReactNode;
  activeApp: "base" | "workspace" | "rag" | "review" | "team";
  user?: UserData;
}

const apps = [
  { id: "base",      name: "Hub Control",      href: APP_URLS.base, icon: Home },
  { id: "workspace", name: "Project Space",     href: APP_URLS.workspace, icon: LayoutDashboard },
  { id: "rag",       name: "Intelligence Hub",  href: APP_URLS.rag, icon: Database },
  { id: "review",    name: "Qual Review",       href: APP_URLS.review, icon: Code },
  { id: "team",      name: "Team & Collab",     href: APP_URLS.team, icon: Users },
];

export function AppShell({ children, activeApp, user }: AppShellProps) {
  const profileHref = `http://localhost:${process.env.NEXT_PUBLIC_PORT_WEB_BASE || "33000"}/profile`;
  return (
    <div className="flex h-screen bg-[#0a0806] text-[#e8d5b5] overflow-hidden font-sans relative" style={{ cursor: "none" }}>
      <CursorEffect />
      {/* Steampunk Background Layers */}
      <div className="bg-mesh absolute inset-0 pointer-events-none" />
      <div className="bg-grid absolute inset-0 pointer-events-none opacity-30" />

      {/* Floating Sidebar Navigation */}
      <aside className="w-72 m-4 mr-0 rounded-2xl glass-panel flex flex-col shrink-0 relative z-30 overflow-hidden gear-decoration">
        {/* Brass rivet decorations - top */}
        <div className="absolute top-3 left-3 w-2 h-2 rounded-full bg-gradient-to-br from-[#c9a84c] to-[#8b5a2b] shadow-[0_0_4px_rgba(184,115,51,0.4)] z-10" />
        <div className="absolute top-3 right-3 w-2 h-2 rounded-full bg-gradient-to-br from-[#c9a84c] to-[#8b5a2b] shadow-[0_0_4px_rgba(184,115,51,0.4)] z-10" />
        <div className="absolute bottom-3 left-3 w-2 h-2 rounded-full bg-gradient-to-br from-[#c9a84c] to-[#8b5a2b] shadow-[0_0_4px_rgba(184,115,51,0.4)] z-10" />
        <div className="absolute bottom-3 right-3 w-2 h-2 rounded-full bg-gradient-to-br from-[#c9a84c] to-[#8b5a2b] shadow-[0_0_4px_rgba(184,115,51,0.4)] z-10" />

        {/* Brand Header */}
        <div className="p-7 pb-5 relative z-10">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-[#1a1408] to-[#0d0a04] border border-[#b87333]/40 flex items-center justify-center shadow-[0_0_15px_rgba(184,115,51,0.15),inset_0_1px_0_rgba(201,168,76,0.1)] overflow-hidden shrink-0">
               <img src="/icon.png" alt="CATEST" className="w-6 h-6 object-contain" />
            </div>
            <div className="min-w-0">
              <div className="text-xl font-black tracking-tight text-[#e8d5b5] truncate" style={{ textShadow: '0 0 20px rgba(184,115,51,0.2)' }}>
                CATEST
              </div>
              <div className="text-[9px] uppercase tracking-[0.25em] text-[#c9a84c] font-bold truncate flex items-center gap-1">
                <Cog className="w-2.5 h-2.5 animate-spin" style={{ animationDuration: '8s' }} />
                Engine v4.2
              </div>
            </div>
          </div>
        </div>

        {/* Decorative pipe divider */}
        <div className="mx-6 mb-2 relative">
          <div className="h-px bg-gradient-to-r from-transparent via-[#b87333]/40 to-transparent" />
          <div className="absolute left-1/2 -translate-x-1/2 -top-1 w-2 h-2 rounded-full border border-[#b87333]/30 bg-[#0d0a04]" />
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 px-4 py-3 space-y-2 overflow-y-auto custom-scrollbar relative min-w-0 z-10">
          {apps.map((app) => {
            const Icon = app.icon;
            const isActive = activeApp === app.id;
            return (
              <a
                key={app.id}
                href={app.href}
                className={cn(
                  "group flex items-center justify-between px-6 py-4 text-sm font-semibold rounded-2xl transition-all duration-500 relative overflow-hidden min-w-0",
                  isActive
                    ? "bg-gradient-to-r from-[#b87333]/15 via-[#c9a84c]/10 to-[#b87333]/5 text-[#f5e6d0] border border-[#b87333]/40 shadow-[0_0_20px_rgba(184,115,51,0.12),inset_0_1px_0_rgba(201,168,76,0.15)]"
                    : "text-[#c4b49a] hover:text-[#e8d5b5] hover:bg-gradient-to-r hover:from-[#b87333]/8 hover:to-transparent border border-transparent hover:border-[#b87333]/15"
                )}
              >
                {/* Active steam indicator - left bar */}
                {isActive && (
                  <>
                    <div className="absolute inset-y-3 left-0 w-1 rounded-full bg-gradient-to-b from-[#c9a84c] via-[#b87333] to-[#c9a84c] shadow-[0_0_10px_rgba(184,115,51,0.7)]" />
                    <div className="absolute inset-0 bg-gradient-to-r from-[#b87333]/8 via-transparent to-transparent pointer-events-none" />
                    {/* Corner brass dots */}
                    <div className="absolute top-2 right-2 w-1 h-1 rounded-full bg-[#c9a84c]/30" />
                    <div className="absolute bottom-2 right-2 w-1 h-1 rounded-full bg-[#c9a84c]/30" />
                  </>
                )}

                <div className="flex items-center gap-4 relative z-10 min-w-0 flex-1">
                  <div className={cn(
                    "w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-all duration-300 border",
                    isActive
                      ? "bg-gradient-to-br from-[#b87333]/20 to-[#c9a84c]/10 border-[#b87333]/30 shadow-[0_0_12px_rgba(184,115,51,0.15)]"
                      : "bg-[#0d0a04]/40 border-[#b87333]/10 group-hover:border-[#b87333]/25 group-hover:bg-[#b87333]/10"
                  )}>
                    <Icon className={cn(
                      "w-[18px] h-[18px] transition-all duration-300",
                      isActive ? "text-[#c9a84c] drop-shadow-[0_0_8px_rgba(201,168,76,0.5)]" : "text-[#b8a080] group-hover:text-[#c9a84c]"
                    )} />
                  </div>
                  <span className="whitespace-nowrap font-bold tracking-wide">{app.name}</span>
                </div>
                {isActive && <ChevronRight className="w-4 h-4 text-[#c9a84c]/60 shrink-0" />}
              </a>
            );
          })}
        </nav>

        {/* Pressure gauge decoration */}
        <div className="px-6 py-3 relative z-10">
          <div className="flex items-center gap-3 px-4 py-2.5 rounded-lg bg-[#0d0a04]/60 border border-[#b87333]/10">
            <Gauge className="w-4 h-4 text-[#4caf50] gauge-active" style={{ filter: 'drop-shadow(0 0 4px rgba(76,175,80,0.4))' }} />
            <div className="flex-1">
              <div className="text-[9px] uppercase tracking-widest text-[#c4b49a] font-bold">System Pressure</div>
              <div className="mt-1 h-1.5 rounded-full bg-[#1a1408] overflow-hidden border border-[#b87333]/10">
                <div className="h-full w-[92%] rounded-full bg-gradient-to-r from-[#4caf50] via-[#8bc34a] to-[#c9a84c]" style={{ boxShadow: '0 0 8px rgba(76,175,80,0.3)' }} />
              </div>
            </div>
            <span className="text-[10px] font-bold text-[#4caf50]" style={{ textShadow: '0 0 6px rgba(76,175,80,0.3)' }}>92%</span>
          </div>
        </div>

        {/* Sidebar Footer - User Card */}
        <div className="p-4 pt-2 mt-auto border-t border-[#b87333]/10 relative z-10">
          <a
            href={profileHref}
            className="flex items-center gap-4 p-4 rounded-xl bg-[#0d0a04]/40 border border-[#b87333]/10 hover:border-[#b87333]/30 hover:bg-[#b87333]/5 transition-all cursor-pointer group min-w-0"
          >
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#1a1408] to-[#0d0a04] flex items-center justify-center border border-[#b87333]/20 group-hover:border-[#c9a84c]/40 transition-all shrink-0 shadow-[inset_0_1px_0_rgba(201,168,76,0.1)]">
              <User className="w-5 h-5 text-[#c9a84c]" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-[#e8d5b5] truncate">{user?.displayName || user?.email?.split('@')[0] || "Operator"}</p>
              <p className="text-[9px] font-semibold text-[#c4b49a] uppercase tracking-widest truncate">{user?.email || "System Node"}</p>
            </div>
            <Settings className="w-4 h-4 text-[#b8a080] group-hover:text-[#c9a84c] transition-colors shrink-0 group-hover:animate-spin" style={{ animationDuration: '3s' }} />
          </a>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col relative m-4 ml-4 min-w-0 min-h-0">
        {/* Steampunk Top Header */}
        <header className="h-16 rounded-2xl glass-panel flex items-center justify-between px-8 mb-4 shrink-0 relative z-20 min-w-0">
          <div className="flex items-center gap-4 min-w-0 flex-1">
             {/* Engine Status */}
             <div className="px-5 py-3 rounded-xl bg-[#4caf50]/5 border border-[#4caf50]/15 flex items-center gap-2.5 shrink-0 gauge-active">
                <div className="w-2 h-2 rounded-full bg-[#4caf50] shadow-[0_0_8px_#4caf50]" />
                <span className="text-[10px] font-bold text-[#4caf50] uppercase tracking-[0.15em] whitespace-nowrap" style={{ textShadow: '0 0 10px rgba(76,175,80,0.3)' }}>
                  Core Engine Online
                </span>
             </div>

             {/* Pipe divider */}
             <div className="h-6 w-px bg-gradient-to-b from-transparent via-[#b87333]/30 to-transparent shrink-0 hidden md:block" />

             {/* Shard Info */}
             <div className="text-[10px] font-bold text-[#c4b49a] uppercase tracking-widest flex items-center gap-2 whitespace-nowrap w-fit hidden md:flex">
                <Database className="w-3 h-3 text-[#b87333]/60" />
                <span>Neo4j Shard 4</span>
             </div>

             {/* Pipe divider */}
             <div className="h-6 w-px bg-gradient-to-b from-transparent via-[#b87333]/30 to-transparent shrink-0 hidden lg:block" />

             {/* Timestamp */}
             <div className="text-[10px] font-bold text-[#b8a080] uppercase tracking-widest hidden lg:flex items-center gap-2">
                <Cog className="w-3 h-3 text-[#b87333]/40 animate-spin" style={{ animationDuration: '10s' }} />
                <span>Steam Protocol v2.1</span>
             </div>
          </div>
        </header>

        {/* Content Scroll Area */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden rounded-2xl relative z-10 glass-panel particle-field min-w-0 min-h-0 steam-particles steam-scroll">
          <div className="p-8 sm:p-10 min-w-0 relative z-10">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
