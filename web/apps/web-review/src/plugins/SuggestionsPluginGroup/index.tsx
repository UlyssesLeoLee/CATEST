"use client";

import React from "react";
import { type PluginGroup } from "@catest/ui/plugins";
import { Card, Badge, Button, cn } from "@catest/ui";
import { 
  AlertTriangle, 
  Info, 
  AlertCircle, 
  Lightbulb,
  ArrowRight,
  Filter
} from "lucide-react";

// Plugin: Renders the list of AI-generated review suggestions
function SuggestionsListPlugin() {
  const mockSuggestions = [
    { id: "s1", severity: "warning", message: "Inconsistent pattern usage: 'validateSession' at line 12 deviates from Termbase pattern 'validateAuthorization'.", category: "Terminology" },
    { id: "s2", severity: "info",    message: "Memory Base hit: Similar resource leak fix applied in 4 other projects. Suggest adding 'req.signal' to processTask.", category: "Pattern Match" },
    { id: "s3", severity: "danger",  message: "Architectural Rule violation: Unauthorized database access detected in service layer.", category: "Policy" },
  ];

  const severityConfig: Record<string, { color: string; bg: string; icon: any }> = {
    warning: { color: "text-amber-400", bg: "bg-amber-400/10", icon: AlertTriangle },
    info: { color: "text-indigo-400", bg: "bg-indigo-400/10", icon: Info },
    danger: { color: "text-rose-400", bg: "bg-rose-400/10", icon: AlertCircle },
  };

  return (
    <ul className="space-y-4">
      {mockSuggestions.map((s) => {
        const config = severityConfig[s.severity];
        const Icon = config.icon;
        
        return (
          <li key={s.id} className="group relative">
            <div className="absolute -inset-0.5 bg-gradient-to-r from-indigo-500/20 to-purple-500/0 rounded-2xl opacity-0 group-hover:opacity-100 transition duration-300" />
            <div className="relative flex flex-col gap-4 p-6 rounded-2xl border border-zinc-900 bg-zinc-950/40 hover:bg-zinc-900/60 transition-all">
              <div className="flex items-center justify-between">
                <div className={cn("flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider", config.color)}>
                  <Icon className="w-3.5 h-3.5" />
                  {s.severity}
                </div>
                <Badge className="bg-zinc-800 text-zinc-500 border-zinc-700 text-[9px] px-1.5 py-0">{s.category}</Badge>
              </div>
              
              <p className="text-xs text-zinc-300 leading-relaxed font-medium">
                {s.message}
              </p>
              
              <div className="flex items-center justify-between mt-1 pt-3 border-t border-zinc-900/50">
                <button className="text-[10px] font-bold text-indigo-400 hover:text-indigo-300 transition-colors flex items-center gap-1 group/btn">
                  Quick Fix
                  <ArrowRight className="w-2.5 h-2.5 group-hover/btn:translate-x-0.5 transition-transform" />
                </button>
                <button className="text-[10px] font-bold text-zinc-600 hover:text-zinc-400 transition-colors">Dismiss</button>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

// Plugin: Filter bar for suggestion severity
function SeverityFilterPlugin() {
  const filters = [
    { id: "all", label: "All", icon: Filter },
    { id: "danger", label: "Critical", icon: AlertCircle },
    { id: "warning", label: "Warning", icon: AlertTriangle },
    { id: "info", label: "Advice", icon: Lightbulb },
  ];

  return (
    <div className="flex items-center gap-2.5 mb-6 overflow-x-auto pb-2 custom-scrollbar">
      {filters.map((f) => (
        <button 
          key={f.id} 
          className={cn(
            "flex items-center gap-2.5 px-4 py-2 text-[10px] font-bold rounded-xl border transition-all whitespace-nowrap",
            f.id === "all" 
              ? "bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-500/20" 
              : "bg-zinc-950/50 border-zinc-800 text-zinc-500 hover:border-zinc-700 hover:text-zinc-300"
          )}
        >
          <f.icon className="w-3.5 h-3.5" />
          {f.label}
        </button>
      ))}
    </div>
  );
}

export const SuggestionsPluginGroup: PluginGroup = {
  id: "review-suggestions",
  name: "AI Suggestions",
  plugins: [
    { id: "severity-filter",   name: "Severity Filter",  component: SeverityFilterPlugin as React.ComponentType<unknown> },
    { id: "suggestions-list",  name: "Suggestions List", component: SuggestionsListPlugin as React.ComponentType<unknown> },
  ],
};

