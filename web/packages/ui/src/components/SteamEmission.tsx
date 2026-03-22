"use client";

import React, { useMemo } from "react";
import { cn } from "../lib/utils";

interface Particle {
  id: number;
  startX: number;
  startY: number;
  tx: number;
  ty: number;
  size: number;
  duration: number;
  delay: number;
  color: string;
  blur: number;
  layer: number; // 0=near, 1=mid, 2=far — creates parallax depth
}

interface SteamEmissionProps {
  /** Number of particles (default 48) */
  count?: number;
  /** Restrict to edges only, or allow full-area emission */
  fullArea?: boolean;
  className?: string;
}

export function SteamEmission({ count = 48, fullArea = false, className }: SteamEmissionProps) {
  const particles = useMemo(() => {
    const colors = [
      "rgba(255,255,255,0.6)",   // white steam
      "rgba(201,168,76,0.4)",    // brass glow
      "rgba(184,115,51,0.3)",    // copper tint
      "rgba(245,230,208,0.5)",   // parchment
    ];

    return Array.from({ length: count }, (_, i) => {
      const layer = i % 3;
      const isLeft = Math.random() > 0.5;

      let startX: number, startY: number;
      if (fullArea) {
        startX = Math.random() * 100;
        startY = Math.random() * 100;
      } else {
        startX = isLeft ? Math.random() * 15 - 5 : Math.random() * 70 + 15;
        startY = isLeft ? Math.random() * 70 + 15 : Math.random() * 15 + 82;
      }

      return {
        id: i,
        startX,
        startY,
        tx: isLeft ? Math.random() * -100 - 30 : (Math.random() - 0.5) * 120,
        ty: -Math.random() * 120 - 20,
        // Layered sizing: near=small+sharp, far=large+soft
        size: layer === 0 ? Math.random() * 12 + 6 : layer === 1 ? Math.random() * 25 + 15 : Math.random() * 45 + 30,
        duration: Math.random() * 5 + 4 + layer * 2,
        delay: Math.random() * 6,
        color: colors[Math.floor(Math.random() * colors.length)],
        blur: layer === 0 ? 3 : layer === 1 ? 8 : 14,
        layer,
      };
    });
  }, [count, fullArea]);

  return (
    <div className={cn("absolute inset-0 pointer-events-none z-0 overflow-visible", className)}>
      {particles.map((p) => (
        <div
          key={p.id}
          className="absolute rounded-full opacity-0 mix-blend-screen"
          style={{
            width: p.size,
            height: p.size,
            left: `${p.startX}%`,
            top: `${p.startY}%`,
            background: `radial-gradient(circle, ${p.color} 0%, transparent 70%)`,
            filter: `blur(${p.blur}px)`,
            animation: `true-particle-drift ${p.duration}s ease-in-out infinite ${p.delay}s`,
            "--tx": `${p.tx}px`,
            "--ty": `${p.ty}px`,
            zIndex: 2 - p.layer,
          } as React.CSSProperties}
        />
      ))}
    </div>
  );
}
