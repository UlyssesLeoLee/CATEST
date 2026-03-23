"use client";

import React from "react";
import { type PluginGroup } from "@catest/ui/plugins";
import { Card, Badge, cn } from "@catest/ui";
import { 
  FileText, 
  Map, 
  Target, 
  ChevronRight,
  Sparkles,
  Link2
} from "lucide-react";

// Plugin: Results cards from Qdrant vector search
function SearchResultsPlugin() {
  const results = [
    { 
      id: "r1", 
      snippet: "Memory Base Pattern: 'handleRequest' must use 'validateAuthorization' as per security baseline 2026.0.4 to prevent token leakage.", 
      score: 0.9542,
      source: "SecurityPolicy_Baseline",
      tags: ["Policy", "Security"]
    },
    { 
      id: "r2", 
      snippet: "Termbase Match: Pattern 'getSession' is marked as 'Forbidden' for production services. Preferred pattern is 'validateAuthorization'.", 
      score: 0.8819,
      source: "Termbase_Global",
      tags: ["Lint", "Standard"]
    },
    { 
      id: "r3", 
      snippet: "Snippet match from project 'CoreAPI': Successful fix applied for 'unbounded-recursion' in identical recursive descent parser logic.", 
      score: 0.8210,
      source: "MB_Core_Fixes",
      tags: ["Debug", "Refactor"]
    },
  ];

  return (
    <div className="space-y-4">
      {results.map((r) => (
        <div key={r.id} className="group cursor-pointer">
          <li className="relative flex flex-col gap-4 rounded-2xl border border-[#3e1b0d]/20 bg-black/30 hover:bg-[#b87333]/[0.04] p-5 transition-all list-none">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0">
                <div className="p-1.5 rounded-lg bg-[#b87333]/10 text-[#c9a84c] border border-[#b87333]/20 shrink-0">
                  <FileText className="w-4 h-4" />
                </div>
                <span className="text-xs font-bold text-[var(--text-primary)] group-hover:text-[#c9a84c] transition-colors uppercase tracking-tight truncate">{r.source}</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-white/[0.03] border border-white/5">
                  <Target className="w-3 h-3 text-[#4a8b6e]" />
                  <span className="text-[10px] font-mono font-bold text-[#4a8b6e]">{(r.score * 100).toFixed(2)}% MATCH</span>
                </div>
                <button className="text-[var(--text-muted)] hover:text-[#c9a84c] transition-colors">
                  <Link2 className="w-4 h-4" />
                </button>
              </div>
            </div>

            <p className="text-sm text-[var(--text-secondary)] leading-relaxed font-medium line-clamp-2 italic border-l-2 border-[#b87333]/30 pl-4 py-1">
              "{r.snippet}"
            </p>

            <div className="flex items-center justify-between mt-1">
              <div className="flex gap-2">
                {r.tags.map(tag => (
                  <Badge key={tag} className="bg-[#b87333]/10 text-[var(--text-muted)] border-[#b87333]/20 text-[9px] font-bold px-1.5 py-0">{tag}</Badge>
                ))}
              </div>
              <ChevronRight className="w-4 h-4 text-[var(--text-muted)]/40 group-hover:text-[#c9a84c] group-hover:translate-x-1 transition-all" />
            </div>
          </li>
        </div>
      ))}
    </div>
  );
}

export const KnowledgeSearchPluginGroup: PluginGroup = {
  id: "rag-search",
  name: "Knowledge Search",
  plugins: [
    { id: "search-results", name: "Search Results", component: SearchResultsPlugin as React.ComponentType<unknown> },
  ],
};

