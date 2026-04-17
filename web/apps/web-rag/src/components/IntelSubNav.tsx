"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@catest/ui";
import { Database, GitBranch } from "lucide-react";

const TABS = [
  {
    href: "/",
    label: "Intelligence Hub",
    shortLabel: "MB / TB",
    icon: Database,
    description: "Vector search · Memory Base · Termbase",
  },
  {
    href: "/graph",
    label: "Graph Operations",
    shortLabel: "Graph Ops",
    icon: GitBranch,
    description: "AI code → Cypher · Memgraph console · Graph write",
  },
] as const;

export function IntelSubNav() {
  const pathname = usePathname();

  return (
    <nav className="flex items-center gap-1 shrink-0 relative">
      {/* Pipe backdrop */}
      <div
        className="absolute inset-0 rounded-2xl pointer-events-none"
        style={{
          background: "rgba(10,6,4,0.5)",
          border: "1px solid rgba(184,115,51,0.12)",
          backdropFilter: "blur(8px)",
        }}
      />

      <div className="relative flex items-center gap-1 p-1.5 w-full">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = pathname === tab.href;

          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                "group flex items-center gap-3 px-5 py-2.5 rounded-xl transition-all duration-300 relative overflow-hidden min-w-0",
                isActive
                  ? "text-[var(--text-primary)]"
                  : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
              )}
              style={
                isActive
                  ? {
                      background:
                        "linear-gradient(135deg, rgba(184,115,51,0.15), rgba(201,168,76,0.08))",
                      border: "1px solid rgba(184,115,51,0.35)",
                      boxShadow:
                        "0 0 16px rgba(184,115,51,0.08), inset 0 1px 0 rgba(201,168,76,0.12)",
                    }
                  : {
                      border: "1px solid transparent",
                    }
              }
            >
              {/* Active left bar */}
              {isActive && (
                <div
                  className="absolute inset-y-2 left-0 w-0.5 rounded-full"
                  style={{
                    background: "linear-gradient(to bottom, #d4b854, #b87333)",
                    boxShadow: "0 0 8px rgba(212,184,84,0.5)",
                  }}
                />
              )}

              {/* Icon badge */}
              <div
                className={cn(
                  "w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border transition-all duration-300",
                  isActive
                    ? "border-[#b87333]/40"
                    : "border-[#3e1b0d]/40 group-hover:border-[#b87333]/25"
                )}
                style={{
                  background: isActive
                    ? "linear-gradient(145deg, #2a1a0e, #0d0805)"
                    : "linear-gradient(145deg, #160e06, #0a0704)",
                  boxShadow: isActive
                    ? "inset 0 1px 0 rgba(201,168,76,0.15), 0 0 8px rgba(184,115,51,0.08)"
                    : "inset 0 1px 0 rgba(255,240,200,0.04)",
                }}
              >
                <Icon
                  className={cn(
                    "w-4 h-4 transition-colors duration-300",
                    isActive
                      ? "text-[var(--text-brass)] drop-shadow-[0_0_6px_rgba(212,184,84,0.4)]"
                      : "text-[var(--text-muted)] group-hover:text-[#c9a84c]"
                  )}
                />
              </div>

              {/* Labels */}
              <div className="min-w-0">
                <div
                  className={cn(
                    "text-xs font-black uppercase tracking-wide leading-none",
                    isActive ? "text-[var(--text-primary)]" : "text-[var(--text-muted)]"
                  )}
                >
                  {tab.label}
                </div>
                <div className="text-[9px] font-mono text-[var(--text-muted)]/50 mt-0.5 truncate hidden sm:block">
                  {tab.description}
                </div>
              </div>

              {/* Active dot */}
              {isActive && (
                <div
                  className="w-1.5 h-1.5 rounded-full ml-auto shrink-0"
                  style={{
                    background: "#c9a84c",
                    boxShadow: "0 0 6px rgba(201,168,76,0.8)",
                  }}
                />
              )}
            </Link>
          );
        })}

        {/* Right side — service badge */}
        <div className="ml-auto shrink-0 hidden md:flex items-center gap-2 pr-2">
          <div className="h-4 w-px bg-[#b87333]/20" />
          <span className="text-[9px] font-mono font-bold text-[var(--text-muted)]/40 uppercase tracking-widest">
            vector-ops :34085
          </span>
          <div
            className="w-1.5 h-1.5 rounded-full bg-[#4a8b6e]"
            style={{ boxShadow: "0 0 4px rgba(74,139,110,0.8)" }}
          />
        </div>
      </div>
    </nav>
  );
}
