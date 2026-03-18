"use client";

import React from "react";
import { type PluginGroup } from "@catest/ui/plugins";
import { Card, Badge, Button, cn } from "@catest/ui";
import { 
  GitBranch, 
  Info, 
  Database, 
  Search, 
  Layers,
  Fingerprint,
  Tag
} from "lucide-react";

// Plugin: Shows relationships of a selected entity from the Neo4j graph
function RelationshipMapPlugin() {
  return (
    <div className="relative h-full min-h-[400px] flex items-center justify-center bg-[#050505] rounded-xl border border-zinc-900 overflow-hidden group">
      {/* Mock Graph Visualization Background */}
      <div className="absolute inset-0 opacity-20 pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-32 h-32 rounded-full border border-indigo-500/50 blur-sm" />
        <div className="absolute bottom-1/3 right-1/4 w-24 h-24 rounded-full border border-purple-500/50 blur-sm" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 rounded-full border border-indigo-500/30 blur-md" />
      </div>

      <div className="relative z-10 flex flex-col items-center gap-4 text-center p-8">
        <div className="w-16 h-16 rounded-full bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 animate-pulse">
           <GitBranch className="w-8 h-8" />
        </div>
        <div>
          <h4 className="text-sm font-bold text-zinc-300">Neo4j Integration Layer</h4>
          <p className="text-[10px] text-zinc-600 font-bold uppercase tracking-widest mt-1">Real-time Entity Relationship Mapping</p>
        </div>
        <Badge className="bg-zinc-900 border-zinc-800 text-zinc-500 text-[10px]">CYPHER: MATCH (n)-[r]-{'>'}(m) RETURN n,r,m</Badge>
      </div>


      {/* Floating UI Elements */}
      <div className="absolute top-4 left-4 flex gap-2">
         <div className="px-2 py-1 rounded bg-black/60 border border-white/5 backdrop-blur-md text-[9px] font-bold text-zinc-500 uppercase">Clustering: ON</div>
         <div className="px-2 py-1 rounded bg-black/60 border border-white/5 backdrop-blur-md text-[9px] font-bold text-zinc-500 uppercase">Physics: Stable</div>
      </div>
    </div>
  );
}

// Plugin: Inspector panel showing properties of a selected node
function NodeInspectorPlugin() {
  const properties = [
    { label: "Label", value: "TranslationSegment", icon: Tag, color: "text-indigo-400" },
    { label: "Internal ID", value: "a3f9-72b1-0c5e", icon: Fingerprint, color: "text-zinc-500" },
    { label: "Confidence", value: "0.992", icon: Layers, color: "text-emerald-500" },
    { label: "Keywords", value: "Legal, Core, Contract", icon: Database, color: "text-purple-400" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 px-1">
        <Info className="w-3.5 h-3.5 text-indigo-400" />
        <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Entity Inspector</span>
      </div>

      <div className="grid grid-cols-1 gap-2">
        {properties.map((prop, i) => (
          <div key={i} className="flex items-center justify-between p-3 rounded-xl bg-zinc-950/50 border border-zinc-900/50 hover:border-zinc-800 transition-colors">
            <div className="flex items-center gap-3">
              <prop.icon className={cn("w-3.5 h-3.5", prop.color)} />
              <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-tight">{prop.label}</span>
            </div>
            <span className="text-[10px] font-mono font-bold text-zinc-200">{prop.value}</span>
          </div>
        ))}
      </div>

      <Button variant="secondary" size="sm" className="w-full h-8 text-[10px] font-bold border-zinc-800 bg-zinc-900/50 text-zinc-500 hover:text-indigo-400">
        <Search className="w-3 h-3 mr-2" />
        Find Similar Entities
      </Button>
    </div>
  );
}

export const GraphExplorerPluginGroup: PluginGroup = {
  id: "rag-graph",
  name: "Knowledge Graph Explorer",
  plugins: [
    { id: "relationship-map",  name: "Relationship Map",  component: RelationshipMapPlugin as React.ComponentType<unknown> },
    { id: "node-inspector",    name: "Node Inspector",    component: NodeInspectorPlugin as React.ComponentType<unknown> },
  ],
};

