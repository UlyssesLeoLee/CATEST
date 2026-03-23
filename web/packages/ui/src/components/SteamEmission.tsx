"use client";

import React, { useMemo } from "react";
import { cn } from "../lib/utils";

interface SteamEmissionProps {
  /** Number of cloud clusters (default 8) */
  count?: number;
  className?: string;
}

/**
 * SteamEmission — lightweight clustered vapor puffs around panel edges.
 * Uses CSS keyframes only (no SVG), particles are always small (max 6px),
 * grouped into tight clusters that drift as cohesive clouds.
 */
export function SteamEmission({ count = 8, className }: SteamEmissionProps) {
  const clouds = useMemo(() => {
    const colors = [
      "rgba(220,212,198,0.5)",
      "rgba(201,168,76,0.3)",
      "rgba(184,115,51,0.2)",
      "rgba(240,228,208,0.4)",
    ];

    // Generate cloud clusters along panel edges
    return Array.from({ length: count }, (_, c) => {
      // Place clouds along edges: top, right, bottom, left
      const edge = c % 4;
      const edgePos = (c / count) * 100 + (Math.random() * 15 - 7.5);
      let startX: number, startY: number, driftX: number, driftY: number;

      if (edge === 0) { startX = edgePos; startY = -2; driftX = (Math.random() - 0.5) * 30; driftY = -20 - Math.random() * 15; }
      else if (edge === 1) { startX = 102; startY = edgePos; driftX = 15 + Math.random() * 15; driftY = (Math.random() - 0.5) * 30; }
      else if (edge === 2) { startX = edgePos; startY = 102; driftX = (Math.random() - 0.5) * 30; driftY = 15 + Math.random() * 15; }
      else { startX = -2; startY = edgePos; driftX = -15 - Math.random() * 15; driftY = (Math.random() - 0.5) * 30; }

      // 3-5 tiny particles per cluster
      const pCount = 3 + Math.floor(Math.random() * 3);
      const particles = Array.from({ length: pCount }, (_, p) => ({
        ox: (Math.sin(p * 2.3 + c) * 1.5),
        oy: (Math.cos(p * 1.7 + c) * 1.2),
        size: 2 + Math.random() * 4, // 2-6px only
        opacity: 0.15 + Math.random() * 0.25,
        blur: 2 + Math.random() * 3,
        color: colors[(c + p) % colors.length],
      }));

      return {
        startX, startY, driftX, driftY,
        duration: 6 + Math.random() * 4,
        delay: Math.random() * 8,
        particles,
      };
    });
  }, [count]);

  return (
    <div className={cn("absolute inset-0 pointer-events-none z-0 overflow-visible", className)}>
      {clouds.map((cloud, ci) =>
        cloud.particles.map((p, pi) => (
          <div
            key={`${ci}-${pi}`}
            className="absolute rounded-full opacity-0"
            style={{
              width: p.size,
              height: p.size,
              left: `calc(${cloud.startX}% + ${p.ox}px)`,
              top: `calc(${cloud.startY}% + ${p.oy}px)`,
              background: `radial-gradient(circle, ${p.color} 0%, transparent 70%)`,
              filter: `blur(${p.blur}px)`,
              animation: `true-particle-drift ${cloud.duration}s ease-in-out infinite ${cloud.delay + pi * 0.15}s`,
              "--tx": `${cloud.driftX + p.ox}px`,
              "--ty": `${cloud.driftY + p.oy}px`,
            } as React.CSSProperties}
          />
        ))
      )}
    </div>
  );
}
