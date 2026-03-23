"use client";

import React from "react";
import { type PluginGroup } from "@catest/ui/plugins";
import { Badge, Button, cn } from "@catest/ui";
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

  const severityConfig: Record<string, { color: string; glowColor: string; borderColor: string; icon: any }> = {
    warning: { color: "text-[var(--amber-glow)]", glowColor: "rgba(255,179,71,0.4)", borderColor: "rgba(255,179,71,0.25)", icon: AlertTriangle },
    info:    { color: "text-[var(--brass)]", glowColor: "rgba(201,168,76,0.3)", borderColor: "rgba(201,168,76,0.2)", icon: Info },
    danger:  { color: "text-[var(--burgundy-light)]", glowColor: "rgba(139,34,82,0.4)", borderColor: "rgba(107,28,35,0.3)", icon: AlertCircle },
  };

  return (
    <ul className="space-y-4">
      {mockSuggestions.map((s) => {
        const config = severityConfig[s.severity];
        const Icon = config.icon;

        return (
          <li key={s.id} className="group relative">
            {/* Hover glow — warm forge edge */}
            <div
              className="absolute -inset-0.5 rounded-sm opacity-0 group-hover:opacity-100 transition duration-500 pointer-events-none"
              style={{
                background: `linear-gradient(135deg, ${config.borderColor}, transparent 60%)`,
                filter: `blur(4px)`,
              }}
            />
            <div
              className="relative flex flex-col gap-3 p-5 rounded-sm border-2 overflow-hidden transition-all duration-300 group-hover:border-opacity-60"
              style={{
                borderColor: config.borderColor,
                background: `
                  url("data:image/svg+xml,%3Csvg viewBox='0 0 128 128' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.7' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.06'/%3E%3C/svg%3E"),
                  linear-gradient(145deg, rgba(14,11,8,0.9) 0%, rgba(10,8,5,0.95) 100%)`,
                boxShadow: `
                  inset 0 1px 0 rgba(255,240,200,0.04),
                  inset 0 -1px 2px rgba(0,0,0,0.4),
                  0 2px 8px rgba(0,0,0,0.5)`,
              }}
            >
              {/* Forged metal grain */}
              <div className="absolute inset-0 pointer-events-none opacity-[0.08]"
                style={{
                  backgroundImage: "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='h'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.15' numOctaves='2' stitchTiles='stitch'/%3E%3CfeDiffuseLighting lighting-color='white' surfaceScale='1.5'%3E%3CfeDistantLight azimuth='135' elevation='55'/%3E%3C/feDiffuseLighting%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23h)' fill='white'/%3E%3C/svg%3E\")",
                  mixBlendMode: 'overlay',
                }} />
              {/* Top bevel highlight */}
              <div className="absolute inset-x-0 top-0 h-px pointer-events-none"
                style={{ background: `linear-gradient(90deg, transparent, rgba(255,240,200,0.08), transparent)` }} />
              {/* Bottom bevel shadow */}
              <div className="absolute inset-x-0 bottom-0 h-px bg-black/30 pointer-events-none" />

              {/* Header row */}
              <div className="flex items-center justify-between relative z-10">
                <div className={cn("flex items-center gap-2 text-[10px] font-black uppercase tracking-wider", config.color)}>
                  <Icon className="w-3.5 h-3.5" style={{ filter: `drop-shadow(0 0 4px ${config.glowColor})` }} />
                  {s.severity}
                </div>
                <Badge variant={s.severity === "danger" ? "danger" : s.severity === "warning" ? "warning" : "info"}>
                  {s.category}
                </Badge>
              </div>

              <p className="text-xs text-[var(--text-secondary)] leading-relaxed font-medium relative z-10">
                {s.message}
              </p>

              {/* Actions row — copper pipe divider */}
              <div className="flex items-center justify-between mt-1 pt-3 relative z-10"
                style={{ borderTop: '1px solid rgba(184,115,51,0.15)' }}>
                <Button variant="vapor" size="sm" className="!px-0 !py-0 !h-auto !min-h-0 gap-1">
                  Quick Fix
                  <ArrowRight className="w-2.5 h-2.5" />
                </Button>
                <Button variant="ghost" size="sm" className="!px-0 !py-0 !h-auto !min-h-0 !text-[var(--text-muted)]">
                  Dismiss
                </Button>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

// Plugin: Filter bar for suggestion severity — forged metal toggle buttons
function SeverityFilterPlugin() {
  const filters = [
    { id: "all", label: "All", icon: Filter, active: true },
    { id: "danger", label: "Critical", icon: AlertCircle, active: false },
    { id: "warning", label: "Warning", icon: AlertTriangle, active: false },
    { id: "info", label: "Advice", icon: Lightbulb, active: false },
  ];

  return (
    <div className="flex items-center gap-2 mb-5 overflow-x-auto pb-1">
      {filters.map((f) => (
        <button
          key={f.id}
          className={cn(
            "flex items-center gap-2 px-3 py-1.5 text-[10px] font-black uppercase tracking-wider rounded-sm border-2 transition-all whitespace-nowrap",
            f.active
              ? "text-[var(--text-primary)] border-[var(--copper)]/50"
              : "text-[var(--text-muted)] border-[var(--iron-dark)]/60 hover:border-[var(--copper)]/30 hover:text-[var(--text-secondary)]"
          )}
          style={f.active ? {
            background: `
              url("data:image/svg+xml,%3Csvg viewBox='0 0 64 64' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.05'/%3E%3C/svg%3E"),
              linear-gradient(135deg, #2a1608 0%, #4d3319 40%, #2a1608 100%)`,
            boxShadow: `
              inset 0 1px 0 rgba(255,240,200,0.1),
              inset 0 -1px 2px rgba(0,0,0,0.3),
              0 2px 6px rgba(0,0,0,0.5),
              0 0 8px rgba(184,115,51,0.1)`,
          } : {
            background: 'linear-gradient(180deg, #150e06, #0d0a04)',
            boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.5), 0 1px 0 rgba(255,240,200,0.03)',
          }}
        >
          <f.icon className="w-3 h-3" />
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
