"use client";

import { KnowledgeSearchPluginGroup } from "@/plugins/KnowledgeSearchPluginGroup";
import { GraphExplorerPluginGroup }    from "@/plugins/GraphExplorerPluginGroup";
import { PluginGroupRenderer }          from "@catest/ui/plugins";
import { Card, Badge, Button, SearchInput } from "@catest/ui";
import { 
  Database, 
  GitBranch, 
  Search, 
  Filter, 
  Download,
  Terminal,
  Cpu
} from "lucide-react";

export default function RagPage() {
  return (
    <div className="flex flex-col h-full overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-1000">
      {/* Search Header */}
      <div className="px-8 py-8 rounded-3xl glass-panel mb-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-1">
            <h1 className="text-2xl font-bold text-[#f5e6d0] tracking-tight flex items-center gap-3">
              <Database className="w-6 h-6 text-[#c9a84c]" />
              Intelligence Hub (MB/TB)
            </h1>
            <p className="text-xs text-[#c4b49a] font-medium tracking-wide">Querying 82.4M code semantics across distributed Memory Base (MB) and Termbase (TB) shards.</p>
          </div>

          <div className="flex-1 max-w-3xl flex items-center gap-3">
            <SearchInput placeholder="Query cross-lingual embeddings..." containerClassName="flex-1" />
            <Button variant="secondary" size="md" className="border-[#b87333]/20">
              <Filter className="w-4 h-4 mr-2" />
              Filter
            </Button>
          </div>

          <div className="flex items-center gap-2">
            <Button size="md" className="bg-[#b87333] hover:bg-[#c9a84c] text-[#f5e6d0] font-bold">
              Index Documents
            </Button>
          </div>
        </div>
      </div>

      {/* Main Grid Layout */}
      <div className="flex flex-1 overflow-hidden p-8 gap-8">
        {/* Left Section: Search Results / Vector Ops */}
        <section className="flex-1 flex flex-col gap-6 overflow-hidden">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold text-[#c4b49a] uppercase tracking-widest flex items-center gap-2">
              <Search className="w-4 h-4" />
              Vector Results
            </h2>
            <div className="flex items-center gap-4 text-[10px] font-bold text-[#c4b49a]/60">
              <span className="flex items-center gap-1"><Cpu className="w-3 h-3" /> Latency: 42ms</span>
              <span className="flex items-center gap-1"><Terminal className="w-3 h-3" /> Precision: 0.992</span>
            </div>
          </div>
          
          <Card variant="glass" className="flex-1 border-[#b87333]/20 bg-[#b87333]/5 overflow-hidden flex flex-col">
            <div className="flex-1 overflow-auto">
              <PluginGroupRenderer group={KnowledgeSearchPluginGroup} />
            </div>
          </Card>
        </section>

        {/* Right Section: Graph Explorer */}
        <aside className="w-[30rem] flex flex-col gap-6 overflow-hidden">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold text-[#c4b49a] uppercase tracking-widest flex items-center gap-2">
              <GitBranch className="w-4 h-4" />
              Relation Graph
            </h2>
            <button className="text-[10px] font-bold text-[#c9a84c] hover:text-[#c9a84c]/80 flex items-center gap-1">
              <Download className="w-3 h-3" />
              Export
            </button>
          </div>

          <Card variant="glass" className="flex-1 border-[#c9a84c]/20 bg-[#c9a84c]/[0.02] overflow-hidden flex flex-col relative group">
            {/* Subtle background decoration */}
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_120%,rgba(201,168,76,0.05),transparent)] pointer-events-none" />
            
            <div className="flex-1 overflow-auto relative z-10">
              <PluginGroupRenderer group={GraphExplorerPluginGroup} />
            </div>

            <div className="p-4 border-t border-[#c9a84c]/10 bg-[#c9a84c]/5 relative z-10">
              <div className="flex items-center justify-between text-[10px] text-[#c9a84c]/80 font-bold uppercase tracking-tight">
                <span>Rendering 420 nodes</span>
                <span>Force-Directed Layout</span>
              </div>
            </div>
          </Card>
        </aside>
      </div>
    </div>
  );
}

