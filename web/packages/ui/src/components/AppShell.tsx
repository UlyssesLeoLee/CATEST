import React from "react";
import { cn } from "../lib/utils";
import { 
  Home, 
  LayoutDashboard, 
  Database, 
  Code, 
  Settings, 
  User,
  ChevronRight,
  ShieldCheck,
  Users
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
  { id: "review",    name: "Qual Review",      href: APP_URLS.review, icon: Code },
  { id: "team",      name: "Team & Collab",    href: APP_URLS.team, icon: Users },
];

export function AppShell({ children, activeApp, user }: AppShellProps) {
  const profileHref = `http://localhost:${process.env.NEXT_PUBLIC_PORT_WEB_BASE || "33000"}/profile`;
  return (
    <div className="flex h-screen bg-[#050505] text-zinc-100 overflow-hidden font-sans selection:bg-indigo-500/30 relative border-4 border-red-500">
      {/* Dynamic Background Layer */}
      <div className="bg-mesh absolute inset-0 pointer-events-none" />
      <div className="bg-grid absolute inset-0 pointer-events-none opacity-20" />
      
      {/* Floating Sidebar Navigation */}
      <aside className="w-72 m-4 mr-0 rounded-3xl glass-panel flex flex-col shrink-0 relative z-30 overflow-hidden">
        {/* Glossy Overlay effect for sidebar */}
        <div className="absolute inset-0 bg-gradient-to-b from-white/5 to-transparent pointer-events-none" />
        
        {/* Brand Header */}
        <div className="p-8 relative">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-white border border-white/20 flex items-center justify-center shadow-[0_0_20px_rgba(255,255,255,0.1)] overflow-hidden shrink-0">
               <img src="/icon.png" alt="CATEST" className="w-6 h-6 object-contain" />
            </div>
            <div className="min-w-0">
              <div className="text-xl font-black tracking-tighter text-white truncate">
                CATEST
              </div>
              <div className="text-[9px] uppercase tracking-[0.2em] text-zinc-500 font-black truncate">
                OS v4.2.0-GP
              </div>
            </div>
          </div>
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 px-4 py-2 space-y-2 overflow-y-auto custom-scrollbar relative min-w-0">
          {apps.map((app) => {
            const Icon = app.icon;
            const isActive = activeApp === app.id;
            return (
              <a
                key={app.id}
                href={app.href}
                className={cn(
                  "group flex items-center justify-between px-6 py-4 text-sm font-bold rounded-2xl transition-all duration-500 relative overflow-hidden min-w-0",
                  isActive
                    ? "bg-white/10 text-white shadow-[0_4px_12px_rgba(0,0,0,0.1)] border border-white/10"
                    : "text-zinc-500 hover:text-zinc-300 hover:bg-white/5 border border-transparent"
                )}
              >
                {/* Active Indicator Glow */}
                {isActive && (
                  <div className="absolute inset-y-2 left-0 w-1 bg-indigo-500 rounded-full shadow-[0_0_12px_rgba(99,102,241,0.8)]" />
                )}
                
                <div className="flex items-center gap-4 relative z-10 min-w-0 flex-1">
                  <Icon className={cn("w-5 h-5 shrink-0", isActive ? "text-indigo-400" : "text-zinc-600 group-hover:text-zinc-400")} />
                  <span className="whitespace-nowrap">{app.name}</span>
                </div>
                {isActive && <ChevronRight className="w-4 h-4 text-white/50 shrink-0" />}
              </a>
            );
          })}
        </nav>

        {/* Sidebar Footer */}
        <div className="p-8 mt-auto border-t border-white/5 bg-black/20 relative">
          <a 
            href={profileHref}
            className="flex items-center gap-5 p-5 rounded-3xl bg-white/[0.03] border border-white/5 hover:bg-white/[0.06] transition-all cursor-pointer group min-w-0"
          >
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-zinc-700 to-zinc-900 flex items-center justify-center border border-white/10 group-hover:scale-105 transition-transform shrink-0">
              <User className="w-6 h-6 text-indigo-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-black text-white truncate">{user?.displayName || user?.email?.split('@')[0] || "Guest"}</p>
              <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest truncate">{user?.email || "System Node"}</p>
            </div>
            <Settings className="w-5 h-5 text-zinc-700 group-hover:text-white transition-colors shrink-0" />
          </a>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col relative overflow-hidden m-4 ml-4 min-w-0">
        {/* Floating Top Header (Glass) */}
        <header className="h-20 rounded-3xl glass-panel flex items-center justify-between px-6 sm:px-10 mb-4 shrink-0 relative z-20 min-w-0">
          <div className="flex items-center gap-4 min-w-0 flex-1 lg:flex-none">
             <div className="px-6 py-3 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center gap-3 shadow-[0_0_15px_rgba(16,185,129,0.1)] shrink-0 w-fit">
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_10px_#10b981]" />
                <span className="text-[10px] font-black text-emerald-500 uppercase tracking-[0.1em] whitespace-nowrap">Core Engine Healthy</span>
             </div>
             <div className="h-4 w-px bg-white/10 shrink-0 hidden md:block" />
             <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-2 whitespace-nowrap w-fit">
                <Database className="w-3 h-3 shrink-0" />
                <span className="whitespace-nowrap hidden md:inline">Neo4j Shard 4</span>
             </div>
          </div>
          
          <div className="flex items-center gap-3 sm:gap-6 shrink-0 ml-4">
             <div className="hidden lg:flex -space-x-3">
               {[1, 2, 3].map(i => (
                 <div key={i} className="w-8 h-8 rounded-full border-2 border-[#0a0a0a] bg-zinc-800 flex items-center justify-center text-[10px] font-bold text-zinc-400">
                    JD
                 </div>
               ))}
               <div className="w-8 h-8 rounded-full border-2 border-[#0a0a0a] bg-indigo-600 flex items-center justify-center text-[10px] font-bold text-white shadow-lg">
                  +
               </div>
             </div>
             <button className="h-10 px-8 rounded-2xl bg-white text-black text-xs font-black hover:bg-zinc-200 transition-colors shadow-[0_10px_20px_rgba(255,255,255,0.1)] whitespace-nowrap min-w-fit">
                Launch Node
             </button>
          </div>
        </header>



        {/* Pure Content Scroll Area */}
        <div className="flex-1 overflow-x-hidden overflow-y-auto custom-scrollbar rounded-3xl relative z-10 glass-panel border-none shadow-none min-w-0">
          <div className="p-6 sm:p-10 min-w-0">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}

