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
        <span className="text-[10px] text-zinc-600 font-bold bg-zinc-900 px-2 py-0.5 rounded border border-zinc-800">3 TOTAL</span>
      </div>
      
      <div className="grid grid-cols-1 gap-3">
        {projects.map((p) => (
          <div key={p.id} className="group relative">
            <div className="absolute -inset-0.5 bg-gradient-to-r from-indigo-500/20 to-purple-500/20 rounded-2xl opacity-0 group-hover:opacity-100 transition duration-500 blur" />
            <li className="relative flex items-center justify-between rounded-xl border border-zinc-900 bg-zinc-950/50 hover:bg-zinc-900/80 px-5 py-4 transition-all list-none">
              <div className="flex items-center gap-4">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center border ${
                  p.status === "active" ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-500" :
                  p.status === "review" ? "bg-amber-500/10 border-amber-500/20 text-amber-500" :
                  "bg-zinc-500/10 border-zinc-500/20 text-zinc-500"
                }`}>
                  {p.status === "active" ? <CheckCircle2 className="w-5 h-5" /> : 
                   p.status === "review" ? <Clock className="w-5 h-5" /> : 
                   <CheckCircle2 className="w-5 h-5 opacity-40" />}
                </div>
                <div className="min-w-0 flex-1">
                  <h4 className="text-sm font-bold text-zinc-100 group-hover:text-indigo-400 transition-colors truncate">{p.name}</h4>
                  <div className="flex items-center gap-3 mt-1 text-zinc-500 font-medium">
                    <span className="text-[10px] flex items-center gap-1 shrink-0"><Database className="w-3 h-3" /> {p.segments} segments</span>
                    <span className="text-[10px] flex items-center gap-1 shrink-0"><Clock className="w-3 h-3" /> {p.lastSync}</span>
                  </div>
                </div>
              </div>
              
              <div className="flex items-center gap-3">
                <Badge className={`px-2 py-0.5 rounded-lg text-[9px] font-bold border ${
                  p.status === "active" ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" :
                  p.status === "review" ? "bg-amber-500/10 text-amber-500 border-amber-500/20" :
                  "bg-zinc-800 text-zinc-500 border-zinc-700"
                }`}>
                  {p.status.toUpperCase()}
                </Badge>
                <button className="p-2 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-500 hover:text-white hover:bg-zinc-800 transition-colors">
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
      <Card className="bg-indigo-600/5 border-dashed border-indigo-500/30 p-8 flex flex-col items-center text-center group hover:bg-indigo-600/10 transition-all">
        <div className="w-16 h-16 rounded-full bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 mb-4 group-hover:scale-110 transition-transform">
          <FolderPlus className="w-8 h-8" />
        </div>
        <h3 className="text-lg font-bold text-white mb-2 tracking-tight">Import New Analytics Target</h3>
        <p className="text-sm text-zinc-500 mb-6 max-w-sm">
          Select a repository or directory to begin the ingestion process. We'll automatically build the dependency graph and vector index.
        </p>
        <Button className="bg-indigo-600 hover:bg-indigo-500 text-white px-8 shadow-[0_0_20px_rgba(79,70,229,0.3)]">
          <Play className="w-4 h-4 mr-2" />
          Run Ingestion Pipeline
        </Button>
        <div className="mt-6 flex items-center gap-4 text-[10px] text-zinc-600 font-bold uppercase tracking-widest">
          <span className="flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> Auto-Graph</span>
          <span className="flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> Vectorize</span>
          <span className="flex items-center gap-1.5"><AlertCircle className="w-3.5 h-3.5 text-amber-500" /> Manual Sync</span>
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

