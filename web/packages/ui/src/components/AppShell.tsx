"use client";

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
  Cog,
  Shield,
  Zap
} from "lucide-react";

import { APP_URLS } from "../lib/navigation";
import { CopperGear, SteamValve, MechanicalPiston, RelayStatus, SteamLeak, PressureValveIndicator, PressureGauge } from "./SteampunkDecor";
import { SoundProvider, useSound } from "./SoundSystem";
import { PluginGroupRenderer } from "../plugins";
import { SteampunkThemePluginGroup } from "../plugins/SteampunkThemePluginGroup";

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
  return (
    <SoundProvider>
      <AppShellContent activeApp={activeApp} user={user} children={children} />
    </SoundProvider>
  );
}

function AppShellContent({ children, activeApp, user }: AppShellProps) {
  const { play } = useSound();
  const profileHref = `http://localhost:${process.env.NEXT_PUBLIC_PORT_WEB_BASE || "33000"}/profile`;

  return (
    <div className="flex h-screen bg-[var(--background)] text-[var(--foreground)] overflow-hidden font-sans relative" style={{ cursor: "none" }}>
      <CursorEffect />
      {/* Unified Steampunk Theme — fog, particles, 3D textures, gas lamps */}
      <PluginGroupRenderer group={SteampunkThemePluginGroup} />

      {/* ── Floating Sidebar Navigation ─────────────────────── */}
      <aside className="w-[var(--side-pane-ratio)] max-w-[400px] min-w-[280px] m-[calc(1rem*var(--phi-inv))] mr-0 rounded-2xl industrial-copper flex flex-col shrink-0 relative z-30 overflow-hidden" style={{ maxHeight: 'none', height: '100%' }}>
        {/* Brass rivets — corners */}
        <div className="absolute top-3 left-3 w-2 h-2 rounded-full bg-gradient-to-br from-[#d4b854] to-[#8b5a2b] shadow-[0_0_4px_rgba(184,115,51,0.4)] z-10" />
        <div className="absolute top-3 right-3 w-2 h-2 rounded-full bg-gradient-to-br from-[#d4b854] to-[#8b5a2b] shadow-[0_0_4px_rgba(184,115,51,0.4)] z-10" />
        <div className="absolute bottom-3 left-3 w-2 h-2 rounded-full bg-gradient-to-br from-[#d4b854] to-[#8b5a2b] shadow-[0_0_4px_rgba(184,115,51,0.4)] z-10" />
        <div className="absolute bottom-3 right-3 w-2 h-2 rounded-full bg-gradient-to-br from-[#d4b854] to-[#8b5a2b] shadow-[0_0_4px_rgba(184,115,51,0.4)] z-10" />

        {/* Victorian corner filigree */}
        <div className="absolute top-5 left-5 w-5 h-5 pointer-events-none z-10">
          <div className="absolute top-0 left-0 w-4 h-px bg-[#917b3c]/30" />
          <div className="absolute top-0 left-0 w-px h-4 bg-[#917b3c]/30" />
        </div>
        <div className="absolute bottom-5 right-5 w-5 h-5 pointer-events-none z-10">
          <div className="absolute bottom-0 right-0 w-4 h-px bg-[#917b3c]/30" />
          <div className="absolute bottom-0 right-0 w-px h-4 bg-[#917b3c]/30" />
        </div>

        {/* Brand Header */}
        <div className="p-7 pb-5 relative z-10">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 overflow-hidden"
              style={{
                background: 'linear-gradient(135deg, #1a1408, #0d0a04)',
                border: '1px solid rgba(184,115,51,0.4)',
                boxShadow: '0 0 15px rgba(184,115,51,0.15), inset 0 1px 0 rgba(201,168,76,0.1)'
              }}>
               <img src="/icon.png" alt="CATEST" className="w-6 h-6 object-contain" />
            </div>
            <div className="min-w-0">
              <div className="text-xl font-black tracking-tight text-[var(--text-primary)] truncate" style={{ textShadow: '0 0 20px rgba(184,115,51,0.2)' }}>
                CATEST
              </div>
              <div className="text-[9px] uppercase tracking-[0.25em] text-[var(--brass)] font-bold truncate flex items-center gap-1">
                <Cog className="w-2.5 h-2.5 animate-spin" style={{ animationDuration: '8s' }} />
                Engine v4.2
              </div>
            </div>
          </div>
        </div>

        {/* Victorian ornament divider */}
        <div className="mx-6 mb-2 relative flex items-center">
          <div className="flex-1 h-px bg-gradient-to-r from-transparent via-[#b87333]/40 to-transparent" />
          <div className="mx-2 w-1.5 h-1.5 rotate-45 border border-[#917b3c]/30 bg-[#0e0b08]" />
          <div className="flex-1 h-px bg-gradient-to-r from-transparent via-[#b87333]/40 to-transparent" />
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
                onClick={() => play('impact')}
                className={cn(
                  "group flex items-center justify-between px-6 py-4 text-sm font-semibold rounded-2xl transition-all duration-500 relative overflow-hidden min-w-0",
                  isActive
                    ? "bg-gradient-to-r from-[#b87333]/15 via-[#c9a84c]/10 to-[#b87333]/5 text-[var(--text-primary)] border border-[#b87333]/40 shadow-[0_0_20px_rgba(184,115,51,0.12),inset_0_1px_0_rgba(201,168,76,0.15)]"
                    : "text-[var(--text-secondary)] hover:text-[#e8d5b5] hover:bg-gradient-to-r hover:from-[#b87333]/8 hover:to-transparent border border-transparent hover:border-[#b87333]/15"
                )}
              >
                {/* Active indicator — left bar with gas lamp glow */}
                {isActive && (
                  <>
                    <div className="absolute inset-y-3 left-0 w-1 rounded-full shadow-[0_0_10px_rgba(255,179,71,0.5)]"
                      style={{ background: 'linear-gradient(to bottom, #d4b854, #b87333, #d4b854)' }} />
                    <div className="absolute inset-0 bg-gradient-to-r from-[#b87333]/8 via-transparent to-transparent pointer-events-none" />
                    <div className="absolute top-2 right-2 w-1 h-1 rounded-full bg-[#917b3c]/30" />
                    <div className="absolute bottom-2 right-2 w-1 h-1 rounded-full bg-[#917b3c]/30" />
                  </>
                )}

                <div className="flex items-center gap-4 relative z-10 min-w-0 flex-1">
                  <div className={cn(
                    "w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-all duration-300 border",
                    isActive
                      ? "bg-gradient-to-br from-[#b87333]/20 to-[#c9a84c]/10 border-[#b87333]/30 shadow-[0_0_12px_rgba(255,179,71,0.15)]"
                      : "bg-[#0d0a04]/40 border-[#b87333]/10 group-hover:border-[#b87333]/25 group-hover:bg-[#b87333]/10"
                  )}>
                    <Icon className={cn(
                      "w-[18px] h-[18px] transition-all duration-300",
                      isActive ? "text-[var(--text-brass)] drop-shadow-[0_0_8px_rgba(212,184,84,0.5)]" : "text-[var(--text-muted)] group-hover:text-[#c9a84c]"
                    )} />
                  </div>
                  <span className="whitespace-nowrap font-bold tracking-wide">{app.name}</span>
                </div>
                {isActive && <ChevronRight className="w-4 h-4 text-[#917b3c]/60 shrink-0" />}
              </a>
            );
          })}
        </nav>

        {/* System pressure gauge */}
        <div className="px-5 py-3 relative z-10">
          <PressureValveIndicator value={92} label="System Pressure" status="nominal" />
        </div>

        {/* Sidebar Footer — User Card */}
        <div className="p-4 pt-2 mt-auto border-t border-[#b87333]/10 relative z-10">
          <a
            href={profileHref}
            className="flex items-center gap-4 p-4 rounded-xl bg-[#0d0a04]/40 border border-[#b87333]/10 hover:border-[#b87333]/30 hover:bg-[#b87333]/5 transition-all cursor-pointer group min-w-0"
          >
            <div className="w-10 h-10 rounded-xl flex items-center justify-center border border-[#b87333]/20 group-hover:border-[#c9a84c]/40 transition-all shrink-0"
              style={{ background: 'linear-gradient(135deg, #1a1408, #0d0a04)', boxShadow: 'inset 0 1px 0 rgba(201,168,76,0.1)' }}>
              <User className="w-5 h-5 text-[#c9a84c]" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-[var(--text-primary)] truncate">{user?.displayName || user?.email?.split('@')[0] || "Operator"}</p>
              <p className="text-[9px] font-semibold text-[var(--text-muted)] uppercase tracking-widest truncate">{user?.email || "System Node"}</p>
            </div>
            <Settings className="w-4 h-4 text-[var(--text-muted)] group-hover:text-[#c9a84c] transition-colors shrink-0 group-hover:animate-spin" style={{ animationDuration: '3s' }} />
          </a>
        </div>
      </aside>

      {/* ── Central Piping System with Gears & Valves ────────── */}
      <div className="flex flex-col h-screen pt-4 pb-4 relative z-20">
        {/* Top valve with steam leak */}
        <SteamValve size={28} speed={12} className="absolute -left-3 top-12 z-30 opacity-70" />
        <div className="pipe-joint -left-1.5 top-20">
           <SteamLeak className="-top-4 -left-4 scale-50 opacity-40 rotate-12" />
        </div>
        <div className="copper-pipe-v h-full" />
        {/* Mid-pipe gear cluster */}
        <CopperGear size={36} speed={18} className="absolute -left-4 top-1/3 z-30 opacity-50" />
        <CopperGear size={22} speed={12} reverse className="absolute left-3 top-[38%] z-30 opacity-40" />
        <SteamLeak className="absolute -left-3 top-[45%] scale-50 opacity-25 rotate-90" />
        {/* Bottom valve with steam */}
        <SteamValve size={24} speed={25} active={false} className="absolute -left-2.5 bottom-[30%] z-30 opacity-60" />
        <div className="pipe-joint -left-1.5 bottom-20">
           <SteamLeak className="-bottom-4 -left-4 scale-75 opacity-30 -rotate-45" />
        </div>
      </div>

      {/* ── Main Content Area ─────────────────────────────────── */}
      <main className="flex-1 flex flex-col relative m-4 ml-0 min-w-0 min-h-0">
        <div className="absolute -left-4 top-8 w-4">
           <div className="copper-pipe-h w-8 -ml-4" />
        </div>

        {/* Decorative corner gears on content area */}
        <CopperGear size={44} speed={30} className="absolute -right-3 -top-3 z-30 opacity-30" />
        <CopperGear size={28} speed={20} reverse className="absolute right-6 top-6 z-30 opacity-20" />
        <CopperGear size={32} speed={25} className="absolute -right-2 -bottom-2 z-30 opacity-25" />
        <SteamValve size={20} speed={15} className="absolute -left-2 bottom-12 z-30 opacity-35" />

        {/* Top Header Bar */}
        <header className="h-[var(--header-h)] rounded-2xl glass-panel flex items-center justify-between px-8 mb-4 shrink-0 relative z-20 min-w-0">
          <div className="flex items-center gap-4 min-w-0 flex-1">
             {/* Engine Status */}
             <div className="flex items-center gap-4 px-4 py-2 rounded-xl border shadow-[inset_0_2px_10px_black]"
               style={{ background: 'rgba(10,6,4,0.4)', borderColor: 'rgba(184,115,51,0.2)' }}>
                <RelayStatus active={true} />
                <div className="flex flex-col">
                  <span className="text-[10px] font-black text-[#4caf50] uppercase tracking-widest whitespace-nowrap" style={{ textShadow: '0 0 8px rgba(76,175,80,0.3)' }}>Core Engine</span>
                  <span className="text-[8px] font-bold text-[var(--text-ember)] uppercase opacity-60">Status: Optimal</span>
                </div>
                <div className="h-8 w-px bg-[#b87333]/20 mx-2" />
                <MechanicalPiston active={true} className="scale-[0.4] -my-6 -mx-4" />
             </div>

             <div className="h-6 w-px bg-gradient-to-b from-transparent via-[#b87333]/30 to-transparent shrink-0 hidden md:block" />

             {/* Shard Info */}
             <div className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest flex items-center gap-2 whitespace-nowrap w-fit hidden md:flex">
                <Database className="w-3 h-3 text-[#b87333]/60" />
                <span>Neo4j Shard 4</span>
             </div>

             <div className="h-6 w-px bg-gradient-to-b from-transparent via-[#b87333]/30 to-transparent shrink-0 hidden lg:block" />

             {/* Steam Protocol version */}
             <div className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest hidden lg:flex items-center gap-2">
                <Cog className="w-3 h-3 text-[#b87333]/40 animate-spin" style={{ animationDuration: '10s' }} />
                <span>Steam Protocol v2.1</span>
             </div>
          </div>

          {/* Header right — mini pressure gauge */}
          <div className="flex items-center gap-3 shrink-0">
            <PressureGauge size={38} value={87} label="PSI" className="hidden lg:flex" />
            <SteamValve size={18} speed={8} className="opacity-40 hidden xl:block" />
          </div>
        </header>

        {/* Content Scroll Area */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden rounded-2xl relative z-10 glass-panel particle-field min-w-0 min-h-0 steam-particles steam-scroll">
          {/* Ambient steam fog overlays — visible but doesn't block content */}
          <div className="absolute inset-0 pointer-events-none z-0">
            <div className="absolute top-0 left-0 right-0 h-24 bg-gradient-to-b from-white/[0.03] to-transparent" />
            <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-black/20 to-transparent" />
            <div className="absolute top-0 bottom-0 left-0 w-16 bg-gradient-to-r from-white/[0.02] to-transparent" />
            <div className="absolute top-0 bottom-0 right-0 w-16 bg-gradient-to-l from-white/[0.02] to-transparent" />
          </div>
          <div className="p-8 sm:p-10 min-w-0 relative z-10">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
