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
    <div className="relative h-full min-h-[400px] flex items-center justify-center bg-[#050505] rounded-xl border border-[#3e1b0d]/30 overflow-hidden group">
      {/* Mock Graph Visualization Background */}
      <div className="absolute inset-0 opacity-20 pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-32 h-32 rounded-full border border-[#b87333]/40 blur-sm" />
        <div className="absolute bottom-1/3 right-1/4 w-24 h-24 rounded-full border border-[#4a8b6e]/40 blur-sm" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 rounded-full border border-[#b87333]/25 blur-md" />
      </div>

      <div className="relative z-10 flex flex-col items-center gap-4 text-center p-8">
        <div className="w-16 h-16 rounded-full bg-[#b87333]/10 border border-[#b87333]/20 flex items-center justify-center text-[#c9a84c] animate-pulse">
           <GitBranch className="w-8 h-8" />
        </div>
        <div>
          <h4 className="text-sm font-bold text-[var(--text-primary)]">Neo4j Integration Layer</h4>
          <p className="text-[10px] text-[var(--text-muted)] font-bold uppercase tracking-widest mt-1">Real-time Entity Relationship Mapping</p>
        </div>
        <Badge className="bg-black/40 border-[#3e1b0d]/30 text-[var(--text-muted)] text-[10px]">CYPHER: MATCH (n)-[r]-{'>'}(m) RETURN n,r,m</Badge>
      </div>


      {/* Floating UI Elements */}
      <div className="absolute top-4 left-4 flex gap-2">
         <div className="px-2 py-1 rounded bg-black/60 border border-[#3e1b0d]/20 backdrop-blur-md text-[9px] font-bold text-[var(--text-muted)] uppercase">Clustering: ON</div>
         <div className="px-2 py-1 rounded bg-black/60 border border-[#3e1b0d]/20 backdrop-blur-md text-[9px] font-bold text-[var(--text-muted)] uppercase">Physics: Stable</div>
      </div>
    </div>
  );
}

// Plugin: Inspector panel showing properties of a selected node
function NodeInspectorPlugin() {
  const properties = [
    { label: "Label", value: "TranslationSegment", icon: Tag, color: "text-[#c9a84c]" },
    { label: "Internal ID", value: "a3f9-72b1-0c5e", icon: Fingerprint, color: "text-[var(--text-muted)]" },
    { label: "Confidence", value: "0.992", icon: Layers, color: "text-[#4a8b6e]" },
    { label: "Keywords", value: "Legal, Core, Contract", icon: Database, color: "text-[#b87333]" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 px-1">
        <Info className="w-3.5 h-3.5 text-[#c9a84c]" />
        <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest">Entity Inspector</span>
      </div>

      <div className="grid grid-cols-1 gap-2">
        {properties.map((prop, i) => (
          <div key={i} className="flex items-center justify-between p-3 rounded-xl bg-black/30 border border-[#3e1b0d]/20 hover:border-[#b87333]/30 transition-colors">
            <div className="flex items-center gap-3">
              <prop.icon className={cn("w-3.5 h-3.5", prop.color)} />
              <span className="text-[10px] text-[var(--text-muted)] font-bold uppercase tracking-tight">{prop.label}</span>
            </div>
            <span className="text-[10px] font-mono font-bold text-[var(--text-primary)]">{prop.value}</span>
          </div>
        ))}
      </div>

      <Button variant="secondary" size="sm" className="w-full h-8 text-[10px] font-bold border-[#3e1b0d]/30 bg-black/30 text-[var(--text-muted)] hover:text-[#c9a84c]">
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

