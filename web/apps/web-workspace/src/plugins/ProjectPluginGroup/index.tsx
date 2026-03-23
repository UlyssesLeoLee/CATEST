"use client";

import React from "react";
import { type PluginGroup } from "@catest/ui/plugins";
import { Card, Badge, Button } from "@catest/ui";
import { 
  FolderPlus, 
  ExternalLink, 
  Play, 
  CheckCircle2, 
  Clock, 
  AlertCircle,
  Database
} from "lucide-react";

// Plugin: List of existing projects, calls Gateway API
function ProjectListPlugin() {
  const projects = [
    { id: "p1", name: "EU Legal Contracts 2025", status: "active", segments: 1204, lastSync: "2h ago" },
    { id: "p2", name: "Tech Manual DE→EN",       status: "review", segments: 450, lastSync: "5h ago" },
    { id: "p3", name: "Finance_Report_Q4",       status: "completed", segments: 89, lastSync: "Yesterday" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-widest flex items-center gap-2">
          <Database className="w-4 h-4" />
          Synchronized Repositories
        </h3>
        <span className="text-[10px] text-[var(--text-muted)] font-bold bg-black/40 px-2 py-0.5 rounded border border-[#3e1b0d]/40">3 TOTAL</span>
      </div>
      
      <div className="grid grid-cols-1 gap-3">
        {projects.map((p) => (
          <div key={p.id} className="group relative">
            <div className="absolute -inset-0.5 bg-gradient-to-r from-[#b87333]/15 to-[#c9a84c]/15 rounded-2xl opacity-0 group-hover:opacity-100 transition duration-500 blur" />
            <li className="relative flex items-center justify-between rounded-xl border border-[#3e1b0d]/30 bg-black/40 hover:bg-[#b87333]/[0.04] px-5 py-4 transition-all list-none">
              <div className="flex items-center gap-4">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center border ${
                  p.status === "active" ? "bg-[#4a8b6e]/10 border-[#4a8b6e]/20 text-[#4a8b6e]" :
                  p.status === "review" ? "bg-[#e67e22]/10 border-[#e67e22]/20 text-[#e67e22]" :
                  "bg-[#3e1b0d]/20 border-[#3e1b0d]/30 text-[var(--text-muted)]"
                }`}>
                  {p.status === "active" ? <CheckCircle2 className="w-5 h-5" /> : 
                   p.status === "review" ? <Clock className="w-5 h-5" /> : 
                   <CheckCircle2 className="w-5 h-5 opacity-40" />}
                </div>
                <div className="min-w-0 flex-1">
                  <h4 className="text-sm font-bold text-[var(--text-primary)] group-hover:text-[#c9a84c] transition-colors truncate">{p.name}</h4>
                  <div className="flex items-center gap-3 mt-1 text-[var(--text-muted)] font-medium">
                    <span className="text-[10px] flex items-center gap-1 shrink-0"><Database className="w-3 h-3" /> {p.segments} segments</span>
                    <span className="text-[10px] flex items-center gap-1 shrink-0"><Clock className="w-3 h-3" /> {p.lastSync}</span>
                  </div>
                </div>
              </div>
              
              <div className="flex items-center gap-3">
                <Badge className={`px-2 py-0.5 rounded-lg text-[9px] font-bold border ${
                  p.status === "active" ? "bg-[#4a8b6e]/10 text-[#4a8b6e] border-[#4a8b6e]/20" :
                  p.status === "review" ? "bg-[#e67e22]/10 text-[#e67e22] border-[#e67e22]/20" :
                  "bg-[#3e1b0d]/20 text-[var(--text-muted)] border-[#3e1b0d]/30"
                }`}>
                  {p.status.toUpperCase()}
                </Badge>
                <button className="p-2 rounded-lg bg-black/40 border border-[#3e1b0d]/30 text-[var(--text-muted)] hover:text-[#c9a84c] hover:bg-[#b87333]/10 transition-colors">
                  <ExternalLink className="w-4 h-4" />
                </button>
              </div>
            </li>
          </div>
        ))}
      </div>
    </div>
  );
}

// Plugin: Trigger ingestion job (calls catest-ingestion via Gateway)
function IngestionTriggerPlugin() {
  return (
    <div className="mt-8">
      <Card className="bg-[#b87333]/5 border-dashed border-[#b87333]/30 p-8 flex flex-col items-center text-center group hover:bg-[#b87333]/10 transition-all">
        <div className="w-16 h-16 rounded-full bg-[#b87333]/10 border border-[#b87333]/20 flex items-center justify-center text-[#c9a84c] mb-4 group-hover:scale-110 transition-transform">
          <FolderPlus className="w-8 h-8" />
        </div>
        <h3 className="text-lg font-bold text-white mb-2 tracking-tight">Import New Analytics Target</h3>
        <p className="text-sm text-zinc-500 mb-6 max-w-sm">
          Select a repository or directory to begin the ingestion process. We'll automatically build the dependency graph and vector index.
        </p>
        <Button variant="copper" className="px-8">
          <Play className="w-4 h-4 mr-2" />
          Run Ingestion Pipeline
        </Button>
        <div className="mt-6 flex items-center gap-4 text-[10px] text-zinc-600 font-bold uppercase tracking-widest">
          <span className="flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-[#4a8b6e]" /> Auto-Graph</span>
          <span className="flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-[#4a8b6e]" /> Vectorize</span>
          <span className="flex items-center gap-1.5"><AlertCircle className="w-3.5 h-3.5 text-[#e67e22]" /> Manual Sync</span>
        </div>
      </Card>
    </div>
  );
}

export const ProjectPluginGroup: PluginGroup = {
  id: "workspace-projects",
  name: "Project Manager",
  plugins: [
    { id: "project-list",       name: "Project List",       component: ProjectListPlugin as React.ComponentType<unknown> },
    { id: "ingestion-trigger",  name: "Ingestion Trigger",  component: IngestionTriggerPlugin as React.ComponentType<unknown> },
  ],
};

