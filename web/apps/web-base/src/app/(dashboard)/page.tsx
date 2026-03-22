"use client";

import React from "react";
import { AppShell, Card, Button, Badge, SearchInput, cn, APP_URLS, getAppUrl, PressureGauge, CopperGear, SteamValve, VictorianDivider, PressureValveIndicator } from "@catest/ui";
import {
  LayoutDashboard,
  Database,
  Search,
  Code,
  Clock,
  Activity,
  ArrowUpRight,
  Plus,
  FileText,
  AlertCircle,
  Zap,
  Users,
  Shield
} from "lucide-react";

export default function HubPage() {
  const [userName, setUserName] = React.useState("Administrator");

  React.useEffect(() => {
    const userStr = localStorage.getItem('user');
    if (userStr) {
      const u = JSON.parse(userStr);
      setUserName(u.email.split('@')[0]);
    }
  }, []);

  const recentProjects = [
    { id: "1", name: "EU_Legal_v2_DE-EN", status: "In Progress", progress: 65, type: "Legal" },
    { id: "2", name: "TechManual_2025_Final", status: "Review", progress: 90, type: "Technical" },
    { id: "3", name: "Marketing_Campaign_Q1", status: "Draft", progress: 20, type: "Marketing" },
  ];

  return (
    <div className="max-w-7xl mx-auto space-y-[var(--section-gap)] animate-in fade-in slide-in-from-bottom-4 duration-1000">
      {/* ── Welcome & Search ────────────────────────────────── */}
      <section className="app-page-header flex flex-col xl:flex-row xl:items-center justify-between gap-6">
        <div className="space-y-1">
          <h1 className="text-2xl font-extrabold tracking-tight text-[var(--text-primary)] capitalize">
            Good Morning, <span className="text-[var(--text-brass)]">{userName}</span>
          </h1>
          <p className="text-[var(--text-secondary)] text-sm font-medium">
            System status is <span className="text-emerald-400">optimal</span>. You have 3 projects pending review.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-4 flex-1 max-w-2xl">
          <SearchInput placeholder="Search projects, documents, or nodes..." containerClassName="flex-1" />
          <div className="flex gap-4">
            <Button variant="copper" size="sm" onClick={() => window.location.href = getAppUrl('workspace', '/new')}>
              <Plus className="w-3 h-3 mr-1.5" />
              New Project
            </Button>
            <Button variant="hollow-vapor" size="sm" onClick={() => window.location.href = getAppUrl('workspace')}>
              <Zap className="w-3 h-3 mr-1.5 text-[var(--amber-glow)]" />
              Build Engine
            </Button>
          </div>
        </div>
      </section>

      {/* ── Quick Actions Grid ──────────────────────────────── */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Upload Docs", icon: Plus, color: "text-[var(--text-brass)]", bg: "bg-[#c9a84c]/10", href: getAppUrl('workspace', '/upload') },
          { label: "Team Access", icon: Users, color: "text-[var(--copper-light)]", bg: "bg-[#d4956a]/10", href: getAppUrl('team') },
          { label: "Security Audit", icon: Shield, color: "text-[var(--verdigris)]", bg: "bg-[#4a8b6e]/10", href: getAppUrl('review') },
          { label: "Fast Analyze", icon: Zap, color: "text-[var(--text-ember)]", bg: "bg-[#e8a050]/10", href: getAppUrl('rag') },
        ].map((action, i) => (
          <button
            key={i}
            onClick={() => window.location.href = action.href}
            className="flex items-center gap-3 p-4 rounded-2xl glass-card hover:border-[#b87333]/40 transition-all group"
          >
            <div className={cn("p-2.5 rounded-xl group-hover:scale-110 transition-transform", action.bg, action.color)}>
              <action.icon className="w-4 h-4" />
            </div>
            <span className="text-sm font-semibold text-[var(--text-primary)] group-hover:text-[var(--text-brass)] transition-colors">{action.label}</span>
          </button>
        ))}
      </section>

      {/* ── High-Level Overview Cards ──────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { label: "Verified Snippets", value: "142,803", current: 142, max: 150, icon: FileText, trend: "+12%" },
          { label: "Quality Audit Hits", value: "8,241", current: 8.2, max: 10, icon: Activity, trend: "+2.4%" },
          { label: "Safety Pipeline", value: "99.98%", current: 99.98, max: 100, icon: LayoutDashboard, trend: "Stable" },
          { label: "Review Nodes", value: "12 Pods", current: 12, max: 20, icon: Database, trend: "Healthy" },
        ].map((stat, i) => (
          <Card key={i} className="group hover:border-[#b87333]/60 transition-all stat-card overflow-hidden">
            {/* Background gauge */}
            <div className="absolute -right-6 -bottom-6 opacity-20 group-hover:opacity-80 transition-opacity duration-1000 z-0">
               <PressureGauge size={120} value={stat.current} max={stat.max} />
            </div>

            <div className="relative z-10 flex w-full items-start justify-between pointer-events-none">
              <div>
                <p className="text-[10px] uppercase tracking-widest text-[var(--text-muted)] font-bold mb-1.5">{stat.label}</p>
                <h3 className="text-2xl font-black text-[var(--text-primary)] tracking-tight drop-shadow-md">{stat.value}</h3>
                <p className="text-[10px] text-emerald-400 font-bold mt-1 bg-emerald-500/10 w-fit px-1.5 py-0.5 rounded border border-emerald-500/20 shadow-sm">{stat.trend}</p>
              </div>
              <div className="p-3 rounded-2xl border border-[#b87333]/30 text-[#c9a84c] group-hover:text-[var(--text-primary)] transition-all duration-300 backdrop-blur-sm"
                style={{ background: 'linear-gradient(135deg, rgba(184,115,51,0.15), rgba(0,0,0,0.4))' }}>
                <stat.icon className="w-5 h-5 drop-shadow-md" />
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* ── Main Content Grid ──────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-[var(--main-pane-ratio)_var(--side-pane-ratio)] gap-[calc(2rem*var(--phi-inv))]">
        {/* Active Projects */}
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-[var(--text-primary)] flex items-center gap-2">
              <Clock className="w-5 h-5 text-[var(--text-brass)]" />
              Active Projects
            </h2>
            <button className="text-sm font-semibold text-[var(--text-brass)] hover:text-[var(--text-primary)] transition-colors">View all</button>
          </div>
          <VictorianDivider />
          <div className="space-y-3">
            {recentProjects.map((p) => (
              <Card
                key={p.id}
                variant="glass"
                hoverable
                className="p-4 flex items-center gap-6 group cursor-pointer"
                onClick={() => window.location.href = getAppUrl('workspace', `/projects/${p.id}`)}
              >
                <div className="relative w-12 h-12 rounded-xl border border-[#b87333]/30 flex items-center justify-center text-[#c9a84c] overflow-hidden shrink-0"
                  style={{ background: 'linear-gradient(135deg, rgba(184,115,51,0.15), rgba(0,0,0,0.6))', boxShadow: 'inset 0 2px 4px rgba(255,255,255,0.05)' }}>
                  {p.status === "In Progress" ? (
                    <CopperGear size={36} speed={12} className="opacity-100" />
                  ) : p.status === "Draft" ? (
                    <SteamValve size={32} speed={30} className="opacity-70" active={false} />
                  ) : (
                    <FileText className="w-5 h-5 drop-shadow-[0_2px_2px_black]" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-1 min-w-0">
                    <span className="text-base font-bold text-[var(--text-primary)] truncate group-hover:text-[var(--text-brass)] transition-colors">{p.name}</span>
                    <Badge className={cn(
                      "px-2 py-0.5 rounded-lg text-[10px] font-bold border shrink-0",
                      p.status === "In Progress" ? "bg-[#c9a84c]/10 text-[#c9a84c] border-[#c9a84c]/20" :
                      p.status === "Review" ? "bg-[var(--verdigris)]/10 text-[var(--verdigris)] border-[var(--verdigris)]/20" :
                      "bg-[#1a0e08] text-[var(--text-secondary)] border-[#b87333]/20"
                    )}>
                      {p.status}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-4 text-xs font-medium text-[var(--text-muted)]">
                    <span className="flex items-center gap-1"><Database className="w-3 h-3" /> {p.type}</span>
                    <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> Updated 2h ago</span>
                  </div>
                </div>
                <div className="w-32 text-right space-y-2">
                   <div className="flex items-center justify-end gap-2">
                    <span className="text-xs text-[var(--text-secondary)] font-mono font-bold">{p.progress}%</span>
                   </div>
                   <div className="w-full h-1.5 bg-[#1a0e08] rounded-full overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-[#b87333] to-[#c9a84c] shadow-[0_0_8px_rgba(184,115,51,0.5)] transition-all duration-1000" style={{ width: `${p.progress}%` }} />
                   </div>
                </div>
              </Card>
            ))}
          </div>
        </div>

        {/* System Health Sidebar */}
        <div className="space-y-6">
          <div className="space-y-4">
            <h2 className="text-lg font-bold text-[var(--text-primary)]">System Health</h2>
            <VictorianDivider />
            <div className="space-y-3">
              {[
                { name: "Code Gateway", status: "nominal" as const, val: 85 },
                { name: "PostgreSQL MB", status: "nominal" as const, val: 60 },
                { name: "Neo4j Semantic", status: "warning" as const, val: 92 },
                { name: "Qdrant TB", status: "nominal" as const, val: 40 },
              ].map((svc, i) => (
                <div key={i} className="flex items-center gap-4 p-3 rounded-xl glass-card transition-all hover:bg-[#b87333]/10">
                  <div className="shrink-0 relative">
                     <PressureGauge size={36} value={svc.val} max={120} />
                  </div>
                  <div className="flex-1 flex items-center justify-between">
                    <span className="text-xs text-[var(--text-primary)] font-bold">{svc.name}</span>
                    <span className={cn("text-[10px] font-black uppercase tracking-widest",
                      svc.status === "nominal" ? "text-emerald-400" : svc.status === "warning" ? "text-[var(--gas-lamp)]" : "text-[var(--burgundy-light)]"
                    )}>{svc.status === "nominal" ? "Healthy" : svc.status === "warning" ? "Syncing" : "Alert"}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <Card variant="glass" className="bg-[var(--burgundy)]/5 border-[var(--burgundy)]/20 p-6 relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-125 transition-transform duration-700">
               <AlertCircle className="w-16 h-16 text-[var(--text-brass)]" />
            </div>
            <h3 className="text-sm font-black text-[var(--text-brass)] mb-1 uppercase tracking-tighter">Memory Base Update</h3>
            <p className="text-xs text-[var(--text-secondary)] leading-relaxed mb-4 font-medium">
              42 new verified code snippets added to your Memory Base (MB) in the last 24 hours. Verification ready.
            </p>
            <Button
              size="sm"
              className="w-full steam-btn font-black"
              onClick={() => window.location.href = getAppUrl('review')}
            >
              Run Review Now
            </Button>
          </Card>
        </div>
      </div>
    </div>
  );
}

