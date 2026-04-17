"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@catest/ui";
import { Database, GitBranch } from "lucide-react";

const ITEMS = [
  {
    href: "/",
    label: "Intelligence Hub",
    icon: Database,
    description: "向量搜索 · 记忆库 · 术语库",
  },
  {
    href: "/graph",
    label: "Graph Operations",
    icon: GitBranch,
    description: "AI 代码 → Cypher · Memgraph",
  },
] as const;

export function IntelSidebarItems() {
  const pathname = usePathname();

  return (
    <div className="px-2 space-y-0.5">
      {/* Section label */}
      <div className="flex items-center gap-2 px-3 mb-2 mt-1">
        <div className="flex-1 h-px bg-gradient-to-r from-[#b87333]/30 to-transparent" />
        <span className="text-[8px] font-black uppercase tracking-[0.2em] text-[#b87333]/50">
          Intel Modules
        </span>
        <div className="flex-1 h-px bg-gradient-to-l from-[#b87333]/30 to-transparent" />
      </div>

      {ITEMS.map((item) => {
        const Icon = item.icon;
        const isActive = pathname === item.href;

        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "group flex items-center gap-3 pl-8 pr-4 py-2.5 rounded-xl transition-all duration-300 relative min-w-0",
              isActive
                ? "text-[var(--text-primary)]"
                : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
            )}
            style={
              isActive
                ? {
                    background: "linear-gradient(135deg, rgba(184,115,51,0.12), rgba(201,168,76,0.05))",
                    border: "1px solid rgba(184,115,51,0.25)",
                    boxShadow: "0 0 12px rgba(184,115,51,0.06), inset 0 1px 0 rgba(201,168,76,0.1)",
                  }
                : { border: "1px solid transparent" }
            }
          >
            {/* Connector line from left */}
            <div
              className="absolute left-5 top-1/2 -translate-y-1/2 w-3 h-px"
              style={{
                background: isActive
                  ? "rgba(184,115,51,0.4)"
                  : "rgba(184,115,51,0.15)",
              }}
            />

            {/* Active left accent */}
            {isActive && (
              <div
                className="absolute inset-y-2 left-0 w-0.5 rounded-full"
                style={{
                  background: "linear-gradient(to bottom, #d4b854, #b87333)",
                  boxShadow: "0 0 6px rgba(212,184,84,0.4)",
                }}
              />
            )}

            {/* Icon */}
            <div
              className={cn(
                "w-6 h-6 rounded-md flex items-center justify-center shrink-0 border transition-all duration-300",
                isActive
                  ? "border-[#b87333]/35"
                  : "border-[#3e1b0d]/30 group-hover:border-[#b87333]/20"
              )}
              style={{
                background: isActive
                  ? "linear-gradient(145deg, #2a1a0e, #0d0805)"
                  : "linear-gradient(145deg, #160e06, #0a0704)",
              }}
            >
              <Icon
                className={cn(
                  "w-3 h-3 transition-colors duration-300",
                  isActive
                    ? "text-[var(--text-brass)]"
                    : "text-[var(--text-muted)] group-hover:text-[#c9a84c]"
                )}
              />
            </div>

            {/* Labels */}
            <div className="min-w-0 flex-1">
              <div
                className={cn(
                  "text-[11px] font-bold tracking-wide leading-none truncate",
                  isActive ? "text-[var(--text-primary)]" : "text-[var(--text-muted)]"
                )}
              >
                {item.label}
              </div>
              <div className="text-[8px] font-mono text-[var(--text-muted)]/40 mt-0.5 truncate">
                {item.description}
              </div>
            </div>

            {/* Active dot */}
            {isActive && (
              <div
                className="w-1 h-1 rounded-full shrink-0"
                style={{
                  background: "#c9a84c",
                  boxShadow: "0 0 4px rgba(201,168,76,0.8)",
                }}
              />
            )}
          </Link>
        );
      })}
    </div>
  );
}
