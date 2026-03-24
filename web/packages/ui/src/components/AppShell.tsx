"use client";

import React, { useState } from "react";
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
  Cog,
  Menu,
  X,
} from "lucide-react";

import { APP_URLS } from "../lib/navigation";
import { useBoolCookieState } from "../hooks/useCookieState";
import { COOKIE_KEYS } from "../lib/cookies";
import { CopperGear, SteamValve, MechanicalPiston, RelayStatus, SteamLeak, PressureValveIndicator, PressureGauge } from "./SteampunkDecor";
import { ScrollValve } from "./ScrollValve";
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
  { id: "base",      name: "Hub Control",      shortName: "Hub",    href: APP_URLS.base, icon: Home },
  { id: "workspace", name: "Project Space",     shortName: "Space",  href: APP_URLS.workspace, icon: LayoutDashboard },
  { id: "rag",       name: "Intelligence Hub",  shortName: "Intel",  href: APP_URLS.rag, icon: Database },
  { id: "review",    name: "Qual Review",       shortName: "Review", href: APP_URLS.review, icon: Code },
  { id: "team",      name: "Team & Collab",     shortName: "Team",   href: APP_URLS.team, icon: Users },
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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useBoolCookieState(COOKIE_KEYS.SIDEBAR_COLLAPSED, false);
  const scrollRef = React.useRef<HTMLDivElement>(null);

  return (
    <div className="flex flex-col md:flex-row h-screen bg-[var(--background)] text-[var(--foreground)] overflow-hidden font-sans relative appshell-root">
      {/* Custom cursor — desktop only */}
      <div className="hidden md:block"><CursorEffect /></div>

      {/* Unified Steampunk Theme — fog, particles, 3D textures, gas lamps */}
      <PluginGroupRenderer group={SteampunkThemePluginGroup} />

      {/* ══════════════════════════════════════════════════════════
          MOBILE TOP BAR — visible only on small screens
          ══════════════════════════════════════════════════════════ */}
      <header className="md:hidden flex items-center justify-between px-4 py-3 glass-panel relative z-40 shrink-0 border-b border-[#b87333]/20">
        {/* Brand */}
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
            style={{
              background: 'linear-gradient(135deg, #1a1408, #0d0a04)',
              border: '1px solid rgba(184,115,51,0.4)',
              boxShadow: '0 0 10px rgba(184,115,51,0.15)'
            }}>
            <img src="/icon.png" alt="CATEST" className="w-5 h-5 object-contain" />
          </div>
          <div>
            <div className="text-base font-black text-[var(--text-primary)]">CATEST</div>
            <div className="text-[7px] uppercase tracking-[0.2em] text-[var(--brass)] font-bold flex items-center gap-0.5">
              <Cog className="w-2 h-2 animate-spin" style={{ animationDuration: '8s' }} />
              Engine v4.2
            </div>
          </div>
        </div>

        {/* Mobile header decorations */}
        <div className="flex items-center gap-3">
          <RelayStatus active={true} />
          <PressureGauge size={32} value={87} label="" />
          <button
            onClick={() => { setMobileMenuOpen(!mobileMenuOpen); play('impact'); }}
            className="w-9 h-9 rounded-lg flex items-center justify-center border border-[#3e1b0d]/60 relative overflow-hidden"
            style={{ background: 'linear-gradient(145deg, #1a1008, #0d0805)', boxShadow: 'inset 0 1px 0 rgba(255,240,200,0.06), inset 0 -1px 2px rgba(0,0,0,0.4)' }}
          >
            <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 36 36">
              <defs><filter id="menu-grain"><feTurbulence type="fractalNoise" baseFrequency="1.5" numOctaves="3" stitchTiles="stitch" /><feDiffuseLighting surfaceScale="1" lightingColor="#8b7355"><feDistantLight azimuth="135" elevation="55" /></feDiffuseLighting></filter></defs>
              <rect width="36" height="36" filter="url(#menu-grain)" opacity="0.08" rx="6" />
            </svg>
            {mobileMenuOpen ? <X className="w-5 h-5 text-[#c9a84c] relative z-10" /> : <Menu className="w-5 h-5 text-[#c9a84c] relative z-10" />}
          </button>
        </div>
      </header>

      {/* ══════════════════════════════════════════════════════════
          MOBILE DRAWER OVERLAY — slides down on menu open
          ══════════════════════════════════════════════════════════ */}
      {mobileMenuOpen && (
        <div className="md:hidden fixed inset-0 z-50" onClick={() => setMobileMenuOpen(false)}>
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
          <div
            className="absolute top-0 left-0 right-0 industrial-copper rounded-b-2xl p-5 pt-16 animate-in slide-in-from-top duration-300"
            style={{ maxHeight: '80vh', overflowY: 'auto' }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drawer corner gears */}
            <CopperGear size={32} speed={20} className="absolute top-3 right-3 opacity-30" />
            <SteamValve size={20} speed={15} className="absolute bottom-3 left-3 opacity-25" />

            <nav className="space-y-2 mb-4">
              {apps.map((app) => {
                const Icon = app.icon;
                const isActive = activeApp === app.id;
                return (
                  <a
                    key={app.id}
                    href={app.href}
                    onClick={() => { play('impact'); setMobileMenuOpen(false); }}
                    className={cn(
                      "flex items-center gap-4 px-5 py-3.5 rounded-xl transition-all",
                      isActive
                        ? "bg-gradient-to-r from-[#b87333]/15 to-[#c9a84c]/5 text-[var(--text-primary)] border border-[#b87333]/40"
                        : "text-[var(--text-secondary)] border border-transparent"
                    )}
                  >
                    <Icon className={cn("w-5 h-5", isActive ? "text-[var(--text-brass)]" : "text-[var(--text-muted)]")} />
                    <span className="font-bold">{app.name}</span>
                    {isActive && <ChevronRight className="w-4 h-4 text-[#917b3c]/60 ml-auto" />}
                  </a>
                );
              })}
            </nav>

            {/* Drawer footer — pressure + user */}
            <div className="border-t border-[#b87333]/20 pt-3 space-y-3">
              <PressureValveIndicator value={92} label="System Pressure" status="nominal" />
              <a href={profileHref} className="flex items-center gap-3 p-3 rounded-xl bg-[#0d0a04]/40 border border-[#b87333]/10">
                <User className="w-5 h-5 text-[#c9a84c]" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-[var(--text-primary)] truncate">{user?.displayName || user?.email?.split('@')[0] || "Operator"}</p>
                  <p className="text-[9px] text-[var(--text-muted)] uppercase tracking-widest truncate">{user?.email || "System Node"}</p>
                </div>
                <Settings className="w-4 h-4 text-[var(--text-muted)]" />
              </a>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════
          DESKTOP SIDEBAR — hidden on mobile, collapsible
          ══════════════════════════════════════════════════════════ */}
      <aside className={cn(
        "hidden md:flex m-[calc(1rem*var(--phi-inv))] mr-0 rounded-2xl industrial-copper flex-col shrink-0 relative z-30 overflow-hidden transition-all duration-500 ease-in-out",
        sidebarCollapsed ? "w-[60px] min-w-[60px] max-w-[60px]" : "w-[var(--side-pane-ratio)] max-w-[400px] min-w-[280px]"
      )} style={{ maxHeight: 'none', height: 'auto' }}>
        {/* ── Collapse/Expand toggle — top edge, steam-wrapped ── */}
        <button
          onClick={() => { setSidebarCollapsed(!sidebarCollapsed); play('impact'); }}
          title={sidebarCollapsed ? "Expand sidebar (show navigation)" : "Collapse sidebar (more workspace)"}
          className={cn(
            "absolute top-3 z-50 group transition-all duration-500",
            sidebarCollapsed ? "right-1/2 translate-x-1/2" : "right-3"
          )}
        >
          <div className="relative">
            {/* Steam ring — animated glow pulse */}
            <div className="absolute -inset-2 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
              style={{
                background: 'radial-gradient(circle, rgba(184,115,51,0.25) 0%, rgba(255,179,71,0.1) 40%, transparent 70%)',
                animation: 'pulse 2s ease-in-out infinite',
              }} />
            {/* Steam wisps — top and bottom */}
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 w-4 h-3 pointer-events-none opacity-0 group-hover:opacity-60 transition-opacity duration-500"
              style={{
                background: 'radial-gradient(ellipse at 50% 100%, rgba(200,180,140,0.3) 0%, transparent 70%)',
                filter: 'blur(2px)',
                animation: 'float-up 2s ease-out infinite',
              }} />
            <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-3 h-2 pointer-events-none opacity-0 group-hover:opacity-40 transition-opacity duration-500"
              style={{
                background: 'radial-gradient(ellipse at 50% 0%, rgba(200,180,140,0.2) 0%, transparent 70%)',
                filter: 'blur(1.5px)',
              }} />
            {/* Main button — brass valve look */}
            <div className="w-7 h-7 rounded-full flex items-center justify-center border-2 transition-all duration-300 relative overflow-hidden"
              style={{
                borderColor: 'rgba(184,115,51,0.5)',
                background: 'linear-gradient(145deg, #2a1a0e, #0d0805)',
                boxShadow: '0 0 12px rgba(184,115,51,0.2), inset 0 1px 0 rgba(201,168,76,0.15), inset 0 -1px 2px rgba(0,0,0,0.5)',
              }}>
              {/* Metal grain texture */}
              <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 28 28">
                <defs>
                  <filter id="toggle-grain">
                    <feTurbulence type="fractalNoise" baseFrequency="2" numOctaves="3" stitchTiles="stitch" />
                    <feDiffuseLighting surfaceScale="0.8" lightingColor="#c9a84c">
                      <feDistantLight azimuth="135" elevation="55" />
                    </feDiffuseLighting>
                  </filter>
                </defs>
                <rect width="28" height="28" filter="url(#toggle-grain)" opacity="0.1" rx="14" />
              </svg>
              <ChevronRight className={cn(
                "w-3.5 h-3.5 relative z-10 transition-all duration-500 group-hover:scale-110",
                sidebarCollapsed
                  ? "rotate-0 text-[#c9a84c] drop-shadow-[0_0_4px_rgba(201,168,76,0.6)]"
                  : "rotate-180 text-[var(--text-muted)] group-hover:text-[#c9a84c] group-hover:drop-shadow-[0_0_4px_rgba(201,168,76,0.4)]"
              )} />
            </div>
            {/* Brass ring highlight */}
            <div className="absolute inset-0 rounded-full pointer-events-none"
              style={{
                border: '1px solid transparent',
                backgroundImage: 'linear-gradient(135deg, rgba(212,184,84,0.3), transparent 50%, rgba(184,115,51,0.2))',
                backgroundOrigin: 'border-box',
                backgroundClip: 'border-box',
                WebkitMaskImage: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
                WebkitMaskComposite: 'xor',
                maskComposite: 'exclude',
                padding: '1px',
              }} />
          </div>
        </button>

        {/* Brass rivets — all four corners */}
        {['top-3 left-3', 'top-3 right-3', 'bottom-3 left-3', 'bottom-3 right-3'].map((pos, i) => (
          <div key={i} className={`absolute ${pos} w-2 h-2 rounded-full bg-gradient-to-br from-[#d4b854] to-[#8b5a2b] shadow-[0_0_4px_rgba(184,115,51,0.4)] z-10`} />
        ))}

        {/* Victorian corner filigree — top-left & bottom-right (hidden when collapsed) */}
        {!sidebarCollapsed && (
          <>
            <div className="absolute top-5 left-5 w-5 h-5 pointer-events-none z-10">
              <div className="absolute top-0 left-0 w-4 h-px bg-[#917b3c]/30" />
              <div className="absolute top-0 left-0 w-px h-4 bg-[#917b3c]/30" />
            </div>
            <div className="absolute bottom-5 right-5 w-5 h-5 pointer-events-none z-10">
              <div className="absolute bottom-0 right-0 w-4 h-px bg-[#917b3c]/30" />
              <div className="absolute bottom-0 right-0 w-px h-4 bg-[#917b3c]/30" />
            </div>
            <div className="absolute top-5 right-5 w-5 h-5 pointer-events-none z-10">
              <div className="absolute top-0 right-0 w-4 h-px bg-[#917b3c]/20" />
              <div className="absolute top-0 right-0 w-px h-4 bg-[#917b3c]/20" />
            </div>
            <div className="absolute bottom-5 left-5 w-5 h-5 pointer-events-none z-10">
              <div className="absolute bottom-0 left-0 w-4 h-px bg-[#917b3c]/20" />
              <div className="absolute bottom-0 left-0 w-px h-4 bg-[#917b3c]/20" />
            </div>
          </>
        )}

        {/* ── Sidebar decorative gears & steam (hidden when collapsed) ── */}
        {!sidebarCollapsed && (
          <>
            <CopperGear size={50} speed={45} className="absolute -top-4 -right-4 z-0 opacity-15" />
            <CopperGear size={30} speed={30} reverse className="absolute top-8 -right-2 z-0 opacity-10" />
            <SteamValve size={22} speed={35} className="absolute top-[55%] -left-2 z-0 opacity-12" />
            <CopperGear size={40} speed={55} className="absolute -bottom-3 -left-3 z-0 opacity-12" />
            <CopperGear size={24} speed={35} reverse className="absolute bottom-10 -right-1 z-0 opacity-10" />
            <SteamLeak className="absolute top-[25%] -right-2 scale-75 opacity-20 rotate-180" />
            <SteamLeak className="absolute bottom-[35%] -left-2 scale-50 opacity-15 rotate-45" />
          </>
        )}

        {/* Furnace underglow */}
        <div className="absolute bottom-0 left-0 right-0 h-32 pointer-events-none z-0"
          style={{ background: 'radial-gradient(ellipse at 50% 100%, rgba(255,107,26,0.06) 0%, rgba(184,115,51,0.03) 40%, transparent 70%)' }} />

        {/* ── Wabi-sabi overlays (hidden when collapsed) ── */}
        {!sidebarCollapsed && (
          <>
            <div className="absolute top-0 right-[22%] w-[3px] h-[35%] pointer-events-none z-[1] opacity-60"
              style={{ background: 'linear-gradient(180deg, rgba(139,69,19,0.25) 0%, rgba(139,69,19,0.08) 60%, transparent 100%)', filter: 'blur(0.5px)' }} />
            <div className="absolute top-0 right-[55%] w-[2px] h-[22%] pointer-events-none z-[1] opacity-40"
              style={{ background: 'linear-gradient(180deg, rgba(160,82,45,0.20) 0%, rgba(160,82,45,0.05) 70%, transparent 100%)', filter: 'blur(0.3px)' }} />
            <div className="absolute top-[15%] left-[8%] w-[2px] h-[18%] pointer-events-none z-[1] opacity-35"
              style={{ background: 'linear-gradient(180deg, rgba(139,69,19,0.15) 0%, transparent 100%)' }} />
            <div className="absolute top-[40%] left-[5%] w-12 h-8 rounded-full pointer-events-none z-[1] opacity-30"
              style={{ background: 'radial-gradient(ellipse, rgba(74,139,110,0.2) 0%, transparent 70%)', filter: 'blur(3px)' }} />
            <div className="absolute bottom-[25%] right-[10%] w-8 h-6 rounded-full pointer-events-none z-[1] opacity-25"
              style={{ background: 'radial-gradient(ellipse, rgba(62,120,95,0.15) 0%, transparent 65%)', filter: 'blur(2px)' }} />
            <div className="absolute top-0 left-0 w-16 h-16 pointer-events-none z-[1]"
              style={{ background: 'radial-gradient(circle at 0% 0%, rgba(0,0,0,0.15) 0%, transparent 70%)' }} />
            <div className="absolute bottom-0 right-0 w-20 h-20 pointer-events-none z-[1]"
              style={{ background: 'radial-gradient(circle at 100% 100%, rgba(0,0,0,0.12) 0%, transparent 60%)' }} />
            <svg className="absolute inset-0 w-full h-full pointer-events-none z-[1] opacity-[0.07]" preserveAspectRatio="none" viewBox="0 0 100 300">
              <path d="M 72 0 L 70 25 L 73 40 L 68 55 L 71 70" stroke="rgba(0,0,0,0.8)" strokeWidth="0.3" fill="none" />
              <path d="M 15 120 L 18 140 L 14 155 L 20 170" stroke="rgba(0,0,0,0.6)" strokeWidth="0.2" fill="none" />
              <path d="M 85 200 L 82 220 L 86 235 L 80 250" stroke="rgba(0,0,0,0.5)" strokeWidth="0.25" fill="none" />
            </svg>
          </>
        )}

        {/* Soot deposit at bottom */}
        <div className="absolute bottom-0 left-0 right-0 h-6 pointer-events-none z-[1]"
          style={{ background: 'linear-gradient(0deg, rgba(10,6,3,0.25) 0%, transparent 100%)' }} />

        {/* Brand Header */}
        <div className={cn("relative z-10 transition-all duration-500", sidebarCollapsed ? "p-2 pb-2" : "p-7 pb-5")}>
          <div className="flex items-center gap-3">
            <div className={cn(
              "rounded-xl flex items-center justify-center shrink-0 overflow-hidden transition-all duration-500",
              sidebarCollapsed ? "w-9 h-9" : "w-11 h-11"
            )}
              style={{
                background: 'linear-gradient(135deg, #1a1408, #0d0a04)',
                border: '1px solid rgba(184,115,51,0.4)',
                boxShadow: '0 0 15px rgba(184,115,51,0.15), inset 0 1px 0 rgba(201,168,76,0.1)'
              }}>
               <img src="/icon.png" alt="CATEST" className={cn("object-contain transition-all duration-500", sidebarCollapsed ? "w-5 h-5" : "w-6 h-6")} />
            </div>
            {!sidebarCollapsed && (
              <div className="min-w-0 flex-1">
                <div className="text-xl font-black tracking-tight text-[var(--text-primary)] truncate" style={{ textShadow: '0 0 20px rgba(184,115,51,0.2)' }}>
                  CATEST
                </div>
                <div className="text-[9px] uppercase tracking-[0.25em] text-[var(--brass)] font-bold truncate flex items-center gap-1">
                  <Cog className="w-2.5 h-2.5 animate-spin" style={{ animationDuration: '8s' }} />
                  Engine v4.2
                </div>
              </div>
            )}
            {!sidebarCollapsed && <PressureGauge size={34} value={92} max={100} className="shrink-0 opacity-60" />}
          </div>
        </div>

        {/* Victorian ornament divider (hidden when collapsed) */}
        {!sidebarCollapsed && (
          <div className="mx-6 mb-2 relative flex items-center">
            <div className="flex-1 h-px bg-gradient-to-r from-transparent via-[#b87333]/40 to-transparent" />
            <CopperGear size={14} speed={20} className="mx-1 opacity-40" />
            <div className="mx-1 w-1.5 h-1.5 rotate-45 border border-[#917b3c]/30 bg-[#0e0b08]" />
            <CopperGear size={14} speed={20} reverse className="mx-1 opacity-40" />
            <div className="flex-1 h-px bg-gradient-to-r from-transparent via-[#b87333]/40 to-transparent" />
          </div>
        )}
        {sidebarCollapsed && (
          <div className="mx-2 mb-1 h-px bg-gradient-to-r from-transparent via-[#b87333]/30 to-transparent" />
        )}

        {/* Navigation Links */}
        <nav className={cn(
          "flex-1 py-2 space-y-1 overflow-y-auto custom-scrollbar relative min-w-0 z-10 transition-all duration-500",
          sidebarCollapsed ? "px-1.5" : "px-4 space-y-2 py-3"
        )}>
          {apps.map((app, index) => {
            const Icon = app.icon;
            const isActive = activeApp === app.id;

            if (sidebarCollapsed) {
              return (
                <a
                  key={app.id}
                  href={app.href}
                  onClick={() => play('impact')}
                  title={app.name}
                  className={cn(
                    "group flex items-center justify-center w-full py-2.5 rounded-xl transition-all duration-300 relative overflow-hidden",
                    isActive
                      ? "bg-gradient-to-b from-[#b87333]/15 to-[#c9a84c]/5 border border-[#b87333]/40 shadow-[0_0_12px_rgba(184,115,51,0.12)]"
                      : "border border-transparent hover:bg-[#b87333]/8 hover:border-[#b87333]/15"
                  )}
                >
                  {isActive && (
                    <div className="absolute inset-y-2 left-0 w-0.5 rounded-full shadow-[0_0_6px_rgba(255,179,71,0.5)]"
                      style={{ background: 'linear-gradient(to bottom, #d4b854, #b87333)' }} />
                  )}
                  <Icon className={cn(
                    "w-[18px] h-[18px] transition-all duration-300",
                    isActive ? "text-[var(--text-brass)] drop-shadow-[0_0_8px_rgba(212,184,84,0.5)]" : "text-[var(--text-muted)] group-hover:text-[#c9a84c]"
                  )} />
                </a>
              );
            }

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
                    "w-9 h-9 rounded-lg flex items-center justify-center shrink-0 transition-all duration-300 border relative overflow-hidden",
                    isActive
                      ? "border-[#b87333]/50"
                      : "border-[#3e1b0d]/60 group-hover:border-[#b87333]/40"
                  )}
                  style={{
                    background: isActive
                      ? 'linear-gradient(145deg, #2a1a0e 0%, #1a0f06 50%, #0d0805 100%)'
                      : 'linear-gradient(145deg, #1a1008 0%, #0d0a04 50%, #080503 100%)',
                    boxShadow: isActive
                      ? 'inset 0 1px 0 rgba(201,168,76,0.2), inset 0 -1px 2px rgba(0,0,0,0.5), 0 0 12px rgba(255,179,71,0.1)'
                      : 'inset 0 1px 0 rgba(255,240,200,0.05), inset 0 -1px 2px rgba(0,0,0,0.4)',
                  }}>
                    {/* Forged metal grain */}
                    <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 36 36">
                      <defs>
                        <filter id={`nav-grain-${index}`}>
                          <feTurbulence type="fractalNoise" baseFrequency="1.5" numOctaves="3" stitchTiles="stitch" />
                          <feDiffuseLighting surfaceScale="1" lightingColor={isActive ? "#c9a84c" : "#8b7355"}>
                            <feDistantLight azimuth="135" elevation="55" />
                          </feDiffuseLighting>
                        </filter>
                      </defs>
                      <rect width="36" height="36" filter={`url(#nav-grain-${index})`} opacity={isActive ? "0.12" : "0.07"} rx="6" />
                    </svg>
                    <Icon className={cn(
                      "w-[18px] h-[18px] transition-all duration-300 relative z-10",
                      isActive ? "text-[var(--text-brass)] drop-shadow-[0_0_8px_rgba(212,184,84,0.5)]" : "text-[var(--text-muted)] group-hover:text-[#c9a84c]"
                    )} />
                  </div>
                  <span className="whitespace-nowrap font-bold tracking-wide">{app.name}</span>
                </div>
                {isActive && <ChevronRight className="w-4 h-4 text-[#917b3c]/60 shrink-0" />}
              </a>
            );
          })}

          {/* Decorative valve (hidden when collapsed) */}
          {!sidebarCollapsed && (
            <div className="flex items-center justify-center py-2 opacity-30">
              <div className="flex-1 h-px bg-gradient-to-r from-transparent via-[#b87333]/30 to-transparent" />
              <SteamValve size={16} speed={30} className="mx-2" />
              <div className="flex-1 h-px bg-gradient-to-r from-transparent via-[#b87333]/30 to-transparent" />
            </div>
          )}
        </nav>

        {/* System pressure gauge (hidden when collapsed) */}
        {!sidebarCollapsed && (
          <div className="px-5 py-3 relative z-10">
            <PressureValveIndicator value={92} label="System Pressure" status="nominal" />
          </div>
        )}

        {/* Sidebar Footer — User Card */}
        <div className={cn("mt-auto border-t border-[#b87333]/10 relative z-10 transition-all duration-500", sidebarCollapsed ? "p-1.5 pt-1.5" : "p-4 pt-2")}>
          {sidebarCollapsed ? (
            <a
              href={profileHref}
              title={user?.displayName || user?.email?.split('@')[0] || "Operator"}
              className="flex items-center justify-center py-2 rounded-xl bg-[#0d0a04]/40 border border-[#b87333]/10 hover:border-[#b87333]/30 hover:bg-[#b87333]/5 transition-all"
            >
              <User className="w-4.5 h-4.5 text-[#c9a84c]" />
            </a>
          ) : (
            <a
              href={profileHref}
              className="flex items-center gap-4 p-4 rounded-xl bg-[#0d0a04]/40 border border-[#b87333]/10 hover:border-[#b87333]/30 hover:bg-[#b87333]/5 transition-all cursor-pointer group min-w-0"
            >
              <div className="w-10 h-10 rounded-xl flex items-center justify-center border border-[#3e1b0d]/60 group-hover:border-[#b87333]/40 transition-all shrink-0 relative overflow-hidden"
                style={{ background: 'linear-gradient(145deg, #1a1008, #0d0805)', boxShadow: 'inset 0 1px 0 rgba(255,240,200,0.06), inset 0 -1px 2px rgba(0,0,0,0.4)' }}>
                <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 40 40">
                  <defs><filter id="user-grain"><feTurbulence type="fractalNoise" baseFrequency="1.5" numOctaves="3" stitchTiles="stitch" /><feDiffuseLighting surfaceScale="1" lightingColor="#8b7355"><feDistantLight azimuth="135" elevation="55" /></feDiffuseLighting></filter></defs>
                  <rect width="40" height="40" filter="url(#user-grain)" opacity="0.08" rx="8" />
                </svg>
                <User className="w-5 h-5 text-[#c9a84c] relative z-10" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-[var(--text-primary)] truncate">{user?.displayName || user?.email?.split('@')[0] || "Operator"}</p>
                <p className="text-[9px] font-semibold text-[var(--text-muted)] uppercase tracking-widest truncate">{user?.email || "System Node"}</p>
              </div>
              <Settings className="w-4 h-4 text-[var(--text-muted)] group-hover:text-[#c9a84c] transition-colors shrink-0 group-hover:animate-spin" style={{ animationDuration: '3s' }} />
            </a>
          )}
        </div>
      </aside>

      {/* ══════════════════════════════════════════════════════════
          CENTRAL PIPING SYSTEM — desktop only (hidden when collapsed)
          ══════════════════════════════════════════════════════════ */}
      <div className={cn("hidden md:flex flex-col h-screen pt-4 pb-4 relative z-20 transition-all duration-500", sidebarCollapsed && "opacity-0 w-0 overflow-hidden pointer-events-none")}>
        {/* Wabi-sabi: verdigris drip on pipe column */}
        <div className="absolute left-[2px] top-[25%] w-[6px] h-[8%] pointer-events-none z-[1] opacity-40"
          style={{ background: 'radial-gradient(ellipse at 50% 0%, rgba(74,139,110,0.25) 0%, transparent 70%)', filter: 'blur(1px)' }} />
        <div className="absolute left-[1px] top-[60%] w-[8px] h-[5%] pointer-events-none z-[1] opacity-30"
          style={{ background: 'radial-gradient(ellipse at 50% 0%, rgba(74,139,110,0.18) 0%, transparent 65%)', filter: 'blur(1px)' }} />
        {/* Top valve with steam leak */}
        <SteamValve size={28} speed={12} className="absolute -left-3 top-12 z-30 opacity-70" />
        <div className="pipe-joint -left-1.5 top-20">
           <SteamLeak className="-top-4 -left-4 scale-50 opacity-40 rotate-12" />
        </div>
        <div className="copper-pipe-v h-full" />
        {/* Mid-pipe gear cluster — enhanced */}
        <CopperGear size={36} speed={18} className="absolute -left-4 top-1/4 z-30 opacity-50" />
        <CopperGear size={22} speed={12} reverse className="absolute left-3 top-[30%] z-30 opacity-40" />
        <SteamLeak className="absolute -left-3 top-[35%] scale-50 opacity-25 rotate-90" />
        {/* Second gear cluster — mid section */}
        <SteamValve size={20} speed={20} className="absolute -left-2 top-[50%] z-30 opacity-50" />
        <CopperGear size={28} speed={22} className="absolute -left-3 top-[58%] z-30 opacity-35" />
        <CopperGear size={18} speed={14} reverse className="absolute left-2.5 top-[62%] z-30 opacity-30" />
        <SteamLeak className="absolute -left-2 top-[55%] scale-40 opacity-20 -rotate-30" />
        {/* Bottom valve with steam */}
        <SteamValve size={24} speed={25} active={false} className="absolute -left-2.5 bottom-[25%] z-30 opacity-60" />
        <CopperGear size={20} speed={16} className="absolute -left-2 bottom-[18%] z-30 opacity-30" />
        <div className="pipe-joint -left-1.5 bottom-20">
           <SteamLeak className="-bottom-4 -left-4 scale-75 opacity-30 -rotate-45" />
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════
          MAIN CONTENT AREA
          ══════════════════════════════════════════════════════════ */}
      <main className="flex-1 flex flex-col relative m-2 md:m-4 md:ml-0 min-w-0 min-h-0">
        {/* Horizontal pipe connector — desktop only */}
        <div className="absolute -left-4 top-8 w-4 hidden md:block">
           <div className="copper-pipe-h w-8 -ml-4" />
        </div>

        {/* Decorative corner gears — desktop only */}
        <div className="hidden md:block">
          <CopperGear size={44} speed={30} className="absolute -right-3 -top-3 z-30 opacity-30" />
          <CopperGear size={28} speed={20} reverse className="absolute right-6 top-6 z-30 opacity-20" />
          <CopperGear size={32} speed={25} className="absolute -right-2 -bottom-2 z-30 opacity-25" />
          <SteamValve size={20} speed={15} className="absolute -left-2 bottom-12 z-30 opacity-35" />
          {/* Extra decorations — left side */}
          <CopperGear size={24} speed={20} reverse className="absolute -left-3 top-[40%] z-30 opacity-20" />
          <SteamLeak className="absolute right-0 top-[30%] scale-50 opacity-15 -rotate-90" />
          {/* Extra bottom-right cluster */}
          <SteamValve size={16} speed={18} className="absolute right-8 -bottom-1 z-30 opacity-20" />
          <CopperGear size={20} speed={28} reverse className="absolute right-16 bottom-4 z-30 opacity-15" />
        </div>

        {/* Top Header Bar */}
        <header className="hidden md:flex h-[var(--header-h)] rounded-2xl glass-panel items-center justify-between px-4 lg:px-8 mb-4 shrink-0 relative z-20 min-w-0 overflow-hidden">
          {/* Wabi-sabi: header edge wear & soot */}
          <div className="absolute bottom-0 left-0 right-0 h-[1px] pointer-events-none z-30"
            style={{ background: 'linear-gradient(90deg, rgba(10,6,3,0.3), transparent 15%, transparent 70%, rgba(139,69,19,0.08), transparent)' }} />
          <div className="absolute top-0 left-[80%] w-[2px] h-[60%] pointer-events-none z-30 opacity-25"
            style={{ background: 'linear-gradient(180deg, rgba(139,69,19,0.15) 0%, transparent 100%)' }} />
          <div className="flex items-center gap-4 min-w-0 flex-1">
             {/* Engine Status */}
             <div className="flex items-center gap-4 px-4 py-2 rounded-xl border shadow-[inset_0_2px_10px_black]"
               style={{ background: 'rgba(10,6,4,0.4)', borderColor: 'rgba(184,115,51,0.2)' }}>
                <RelayStatus active={true} />
                <div className="flex flex-col">
                  <span className="text-[10px] font-black text-[#4caf50] uppercase tracking-widest whitespace-nowrap" style={{ textShadow: '0 0 8px rgba(76,175,80,0.3)' }}>Core Engine</span>
                  <span className="text-[8px] font-bold text-[var(--text-ember)] uppercase opacity-60">Status: Optimal</span>
                </div>
                <div className="h-8 w-px bg-[#b87333]/20 mx-2 hidden lg:block" />
                <MechanicalPiston active={true} className="scale-[0.4] -my-6 -mx-4 hidden lg:block" />
             </div>

             <div className="h-6 w-px bg-gradient-to-b from-transparent via-[#b87333]/30 to-transparent shrink-0 hidden lg:block" />

             {/* Shard Info */}
             <div className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest flex items-center gap-2 whitespace-nowrap w-fit hidden lg:flex">
                <Database className="w-3 h-3 text-[#b87333]/60" />
                <span>Neo4j Shard 4</span>
             </div>

             <div className="h-6 w-px bg-gradient-to-b from-transparent via-[#b87333]/30 to-transparent shrink-0 hidden xl:block" />

             {/* Steam Protocol version */}
             <div className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest hidden xl:flex items-center gap-2">
                <Cog className="w-3 h-3 text-[#b87333]/40 animate-spin" style={{ animationDuration: '10s' }} />
                <span>Steam Protocol v2.1</span>
             </div>
          </div>

          {/* Header right — gauges & valves */}
          <div className="flex items-center gap-3 shrink-0">
            <CopperGear size={18} speed={25} className="opacity-25 hidden xl:flex" />
            <PressureGauge size={38} value={87} label="PSI" className="hidden lg:flex" />
            <SteamValve size={18} speed={8} className="opacity-40 hidden xl:block" />
          </div>
        </header>

        {/* Content Scroll Area */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto overflow-x-hidden rounded-none md:rounded-2xl relative z-10 glass-panel particle-field min-w-0 min-h-0 steam-particles steam-scroll">
          {/* Valve decoration at top-right of scroll area */}
          <ScrollValve scrollContainerRef={scrollRef} />
          {/* Ambient steam fog overlays */}
          <div className="absolute inset-0 pointer-events-none z-0">
            <div className="absolute top-0 left-0 right-0 h-24 bg-gradient-to-b from-white/[0.03] to-transparent" />
            <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-black/20 to-transparent" />
            <div className="absolute top-0 bottom-0 left-0 w-16 bg-gradient-to-r from-white/[0.02] to-transparent hidden md:block" />
            <div className="absolute top-0 bottom-0 right-0 w-16 bg-gradient-to-l from-white/[0.02] to-transparent hidden md:block" />
          </div>
          {/* Wabi-sabi: content area weathering */}
          <div className="absolute inset-0 pointer-events-none z-[1] hidden md:block">
            {/* Corner grime — dark age stains */}
            <div className="absolute top-0 left-0 w-24 h-24" style={{ background: 'radial-gradient(circle at 0% 0%, rgba(0,0,0,0.08) 0%, transparent 60%)' }} />
            <div className="absolute bottom-0 right-0 w-32 h-32" style={{ background: 'radial-gradient(circle at 100% 100%, rgba(0,0,0,0.06) 0%, transparent 50%)' }} />
            {/* Rust drip — upper right corner water ingress */}
            <div className="absolute top-0 right-[15%] w-[2px] h-[12%] opacity-40"
              style={{ background: 'linear-gradient(180deg, rgba(139,69,19,0.18) 0%, transparent 100%)' }} />
            {/* Water stain ring — faint circular mark */}
            <div className="absolute top-[60%] left-[70%] w-10 h-10 rounded-full opacity-20"
              style={{ background: 'radial-gradient(circle, transparent 35%, rgba(139,69,19,0.06) 40%, rgba(139,69,19,0.06) 45%, transparent 50%)' }} />
          </div>
          <div className="p-4 sm:p-6 md:p-8 lg:p-10 min-w-0 relative z-10">
            {children}
          </div>
        </div>
      </main>

      {/* ══════════════════════════════════════════════════════════
          MOBILE BOTTOM TAB BAR — persistent nav on mobile
          ══════════════════════════════════════════════════════════ */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 glass-panel border-t border-[#b87333]/30 px-1 pb-[env(safe-area-inset-bottom)] overflow-hidden"
        style={{ background: 'rgba(8,6,4,0.95)', backdropFilter: 'blur(20px)' }}>
        {/* Wabi-sabi: edge wear on mobile nav */}
        <div className="absolute top-0 left-0 right-0 h-[1px] pointer-events-none"
          style={{ background: 'linear-gradient(90deg, rgba(139,69,19,0.15), transparent 20%, transparent 40%, rgba(139,69,19,0.08), transparent 70%, rgba(74,139,110,0.06), transparent)' }} />
        <div className="absolute top-0 left-[12%] w-[2px] h-full pointer-events-none opacity-20"
          style={{ background: 'linear-gradient(180deg, rgba(139,69,19,0.2) 0%, transparent 40%)' }} />
        <div className="flex items-center justify-around py-1.5">
          {apps.map((app) => {
            const Icon = app.icon;
            const isActive = activeApp === app.id;
            return (
              <a
                key={app.id}
                href={app.href}
                onClick={() => play('impact')}
                className={cn(
                  "flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl transition-all min-w-0 relative",
                  isActive ? "text-[var(--text-brass)]" : "text-[var(--text-muted)]"
                )}
              >
                {/* Active glow */}
                {isActive && (
                  <div className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-6 h-0.5 rounded-full"
                    style={{ background: 'linear-gradient(90deg, transparent, #c9a84c, transparent)', boxShadow: '0 0 8px rgba(201,168,76,0.5)' }} />
                )}
                <Icon className={cn("w-5 h-5", isActive && "drop-shadow-[0_0_6px_rgba(212,184,84,0.5)]")} />
                <span className="text-[9px] font-bold uppercase tracking-wider">{app.shortName}</span>
              </a>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
