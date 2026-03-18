"use client";

import React from "react";
import { AppShell, Card, Button, Badge, SearchInput, cn, APP_URLS, getAppUrl } from "@catest/ui";
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
    <div className="p-10 max-w-7xl mx-auto space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-1000">
      <h1 className="text-9xl font-black text-red-500 bg-white p-20 text-center animate-bounce z-50">SAAS VERSION V2 LOADED</h1>
      {/* Welcome & Search Bar */}
      <section className="flex flex-col xl:flex-row xl:items-center justify-between gap-8">
        <div className="space-y-1">
          <h1 className="text-4xl font-extrabold tracking-tight text-white capitalize">
            Good Morning, <span className="text-indigo-400">{userName}</span>
          </h1>
          <p className="text-zinc-500 text-sm font-medium">
            System status is <span className="text-emerald-500">optimal</span>. You have 3 projects pending review.
          </p>
        </div>
        
        <div className="flex flex-col sm:flex-row items-center gap-4 flex-1 max-w-2xl">
          <SearchInput placeholder="Search projects, documents, or nodes..." containerClassName="flex-1" />
          <div className="flex gap-2">
            <Button variant="secondary" size="md" onClick={() => window.location.href = getAppUrl('workspace', '/new')}>
              <Plus className="w-4 h-4 mr-2" />
              New
            </Button>
            <Button size="md" onClick={() => window.location.href = getAppUrl('workspace')}>
              Build
            </Button>
          </div>
        </div>
      </section>

      {/* Quick Actions Grid */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Upload Docs", icon: Plus, color: "text-indigo-400", bg: "bg-indigo-400/10", href: getAppUrl('workspace', '/upload') },
          { label: "Team Access", icon: Users, color: "text-violet-400", bg: "bg-violet-400/10", href: getAppUrl('team') },
          { label: "Security Audit", icon: Shield, color: "text-emerald-400", bg: "bg-emerald-400/10", href: getAppUrl('review') },
          { label: "Fast Analyze", icon: Zap, color: "text-amber-400", bg: "bg-amber-400/10", href: getAppUrl('rag') },
        ].map((action, i) => (
          <button 
            key={i} 
            onClick={() => window.location.href = action.href}
            className="flex items-center gap-3 p-4 rounded-2xl bg-zinc-900/40 border border-zinc-800/50 hover:bg-zinc-800/60 hover:border-zinc-700 transition-all group"
          >
            <div className={cn("p-2.5 rounded-xl group-hover:scale-110 transition-transform", action.bg, action.color)}>
              <action.icon className="w-4 h-4" />
            </div>
            <span className="text-sm font-semibold text-zinc-300 group-hover:text-white transition-colors">{action.label}</span>
          </button>
        ))}
      </section>

      {/* High-Level Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { label: "Verified Snippets", value: "142,803", icon: FileText, trend: "+12%" },
          { label: "Quality Audit Hits", value: "8,241", icon: Activity, trend: "+2.4%" },
          { label: "Safety Pipeline", value: "99.98%", icon: LayoutDashboard, trend: "Stable" },
          { label: "Review Nodes", value: "12 Pods", icon: Database, trend: "Healthy" },
        ].map((stat, i) => (
          <Card key={i} variant="glass" className="p-6 flex items-center justify-between group hover:border-indigo-500/30 transition-all shadow-xl shadow-black/20">
            <div>
              <p className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold mb-1.5">{stat.label}</p>
              <h3 className="text-2xl font-bold text-white tracking-tight">{stat.value}</h3>
              <p className="text-[10px] text-emerald-500 font-bold mt-1 bg-emerald-500/10 w-fit px-1.5 py-0.5 rounded italic">{stat.trend}</p>
            </div>
            <div className="p-3 rounded-2xl bg-white/[0.03] border border-white/5 text-indigo-400 group-hover:bg-indigo-500 group-hover:text-white transition-all duration-300">
              <stat.icon className="w-5 h-5" />
            </div>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
        {/* Main Section: Recent Projects Table-ish */}
        <div className="lg:col-span-2 space-y-6">
          <div className="flex items-center justify-between border-b border-zinc-900 pb-4">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <Clock className="w-5 h-5 text-indigo-500" />
              Active Projects
            </h2>
            <button className="text-sm font-semibold text-indigo-400 hover:text-indigo-300 transition-colors">View all</button>
          </div>
          <div className="space-y-3">
            {recentProjects.map((p) => (
              <Card 
                key={p.id} 
                variant="glass" 
                hoverable 
                className="p-4 flex items-center gap-6 group cursor-pointer"
                onClick={() => window.location.href = getAppUrl('workspace', `/projects/${p.id}`)}
              >
                <div className="w-12 h-12 rounded-2xl bg-indigo-600/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 group-hover:bg-indigo-600 group-hover:text-white transition-all duration-300">
                  <FileText className="w-6 h-6" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-1 min-w-0">
                    <span className="text-base font-bold text-zinc-100 truncate group-hover:text-indigo-400 transition-colors">{p.name}</span>
                    <Badge className={cn(
                      "px-2 py-0.5 rounded-lg text-[10px] font-bold border shrink-0",
                      p.status === "In Progress" ? "bg-indigo-500/10 text-indigo-400 border-indigo-500/20" :
                      p.status === "Review" ? "bg-amber-500/10 text-amber-500 border-amber-500/20" :
                      "bg-zinc-800 text-zinc-500 border-zinc-700"
                    )}>
                      {p.status}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-4 text-xs font-medium text-zinc-500">
                    <span className="flex items-center gap-1"><Database className="w-3 h-3" /> {p.type}</span>
                    <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> Updated 2h ago</span>
                  </div>
                </div>
                <div className="w-32 text-right space-y-2">
                   <div className="flex items-center justify-end gap-2">
                    <span className="text-xs text-zinc-400 font-mono font-bold">{p.progress}%</span>
                   </div>
                   <div className="w-full h-1.5 bg-zinc-800/50 rounded-full overflow-hidden">
                      <div className="h-full bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.5)] transition-all duration-1000" style={{ width: `${p.progress}%` }} />
                   </div>
                </div>
              </Card>
            ))}
          </div>
        </div>


        {/* Sidebar Section: System Health & Actions */}
        <div className="space-y-6">
          <div className="space-y-4">
            <h2 className="text-lg font-bold text-zinc-200">System Health</h2>
            <div className="space-y-3">
              {[
                { name: "Code Gateway", status: "Healthy", color: "bg-emerald-500" },
                { name: "PostgreSQL MB", status: "Healthy", color: "bg-emerald-500" },
                { name: "Neo4j Semantic", status: "Syncing", color: "bg-amber-500" },
                { name: "Qdrant TB", status: "Healthy", color: "bg-emerald-500" },
              ].map((svc, i) => (
                <div key={i} className="flex items-center justify-between p-3 rounded-2xl bg-white/[0.02] border border-white/5 backdrop-blur-sm">
                  <span className="text-xs text-zinc-300 font-bold">{svc.name}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-tight">{svc.status}</span>
                    <div className={cn("w-1.5 h-1.5 rounded-full shadow-[0_0_8px]", svc.color)} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <Card variant="glass" className="bg-indigo-600/5 border-indigo-500/20 p-6 relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-125 transition-transform duration-700">
               <AlertCircle className="w-16 h-16 text-indigo-400" />
            </div>
            <h3 className="text-sm font-black text-indigo-400 mb-1 uppercase tracking-tighter">Memory Base Update</h3>
            <p className="text-xs text-zinc-400 leading-relaxed mb-4 font-medium">
              42 new verified code snippets added to your Memory Base (MB) in the last 24 hours. Verification ready.
            </p>
            <Button 
              size="sm" 
              className="w-full bg-indigo-600 text-white hover:bg-indigo-500 font-black"
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
