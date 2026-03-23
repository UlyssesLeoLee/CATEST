"use client";

import { cn } from "../lib/utils";
import React from "react";
import { useSound } from "./SoundSystem";
import { ChippedScrew } from "./SteampunkDecor";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "secondary" | "ghost" | "vapor" | "copper" | "hollow-vapor" | "shabby";
  size?: "sm" | "md" | "lg";
}

/**
 * SteamSmokeRing — lightweight clustered vapor ring orbiting the button.
 * Optimized: 8 clouds × 5 particles = 40 total (was 160). Single blur filter.
 * All particles tiny (r ≤ 0.5), tightly clustered into cohesive puffs.
 */
let smokeIdCounter = 0;
function SteamSmokeRing() {
  const [filterId] = React.useState(() => `smoke-blur-${++smokeIdCounter}`);

  // 16 cloud clusters, 8 particles each = 128 total
  // Each particle r=1.5~2.5 (visible in viewBox), blur=1.2 (soft but not invisible)
  const cloudsCount = 16;
  const perCloud = 8;

  const particles = React.useMemo(() => {
    const result: { dur: number; r: number; delay: number; path: string; maxOpacity: number; fill: string }[] = [];

    for (let c = 0; c < cloudsCount; c++) {
      const cloudPhase = (c / cloudsCount) * Math.PI * 2;
      const cloudDur = 6.5 + (c % 4) * 0.7;
      const cloudDelay = -(c * 0.55);
      const band = c % 3;
      const bandOffset = (band - 1) * 2;

      const cx = 60, cy = 30;
      const rx = 56 + bandOffset;
      const ry = 28 + bandOffset * 0.5;

      const steps = 20;
      const centerPts: [number, number][] = [];
      for (let s = 0; s <= steps; s++) {
        const angle = cloudPhase + (s / steps) * Math.PI * 2;
        const wobble = 1 + Math.sin(angle * 3 + c) * 0.02;
        centerPts.push([
          cx + Math.cos(angle) * rx * wobble,
          cy + Math.sin(angle) * ry * wobble,
        ]);
      }

      for (let p = 0; p < perCloud; p++) {
        // Tight cluster offset — particles overlap to form visible cloud puffs
        const ox = Math.sin(p * 2.7 + c * 1.3) * 2.0 + Math.cos(p * 3.9) * 0.8;
        const oy = Math.cos(p * 1.9 + c * 0.7) * 1.5 + Math.sin(p * 4.3) * 0.5;

        const pts = centerPts.map(([x, y]) => `${(x + ox).toFixed(1)},${(y + oy).toFixed(1)}`);
        let path = `M ${pts[0]}`;
        for (let s = 1; s < pts.length - 1; s++) {
          const [cx1, cy1] = pts[s].split(',').map(Number);
          const [cx2, cy2] = pts[s + 1].split(',').map(Number);
          path += ` Q ${pts[s]} ${((cx1 + cx2) / 2).toFixed(1)},${((cy1 + cy2) / 2).toFixed(1)}`;
        }
        path += ` Q ${pts[pts.length - 1]} ${pts[0]} Z`;

        // Visible radius: 1.5~2.5 in viewBox (not too small to vanish in blur)
        const r = 1.5 + (p % 4) * 0.25;
        // Core band (band=1) is brightest, edges softer
        const maxOpacity = band === 1
          ? 0.8 + (p % 3) * 0.06
          : 0.55 + (p % 4) * 0.08;
        const fills = band === 1
          ? ["rgba(225,218,205,0.9)", "rgba(215,205,192,0.85)", "rgba(220,210,198,0.9)", "rgba(210,200,188,0.85)"]
          : ["rgba(200,190,178,0.7)", "rgba(195,185,172,0.65)", "rgba(205,195,182,0.7)", "rgba(190,180,168,0.6)"];

        result.push({ dur: cloudDur + (p % 3) * 0.2, r, delay: cloudDelay - p * 0.03, path, maxOpacity, fill: fills[p % fills.length] });
      }
    }
    return result;
  }, []);

  return (
    <div className="steam-smoke-ring">
      <svg width="100%" height="100%" viewBox="-10 -10 140 80" preserveAspectRatio="none" className="absolute inset-0 w-full h-full" style={{ overflow: 'visible' }}>
        <defs>
          <filter id={filterId}><feGaussianBlur stdDeviation="1.2" /></filter>
        </defs>
        {particles.map((p, i) => (
          <circle
            key={i}
            r={p.r}
            fill={p.fill}
            opacity="0"
            filter={`url(#${filterId})`}
          >
            <animateMotion
              dur={`${p.dur}s`}
              repeatCount="indefinite"
              begin={`${p.delay}s`}
              path={p.path}
            />
            <animate
              attributeName="opacity"
              values={`${p.maxOpacity * 0.5};${p.maxOpacity * 0.85};${p.maxOpacity};${p.maxOpacity * 0.92};${p.maxOpacity};${p.maxOpacity * 0.85};${p.maxOpacity * 0.5}`}
              dur={`${p.dur}s`}
              begin={`${p.delay}s`}
              repeatCount="indefinite"
            />
          </circle>
        ))}
      </svg>
    </div>
  );
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "md", onClick, children, ...props }, ref) => {
    const { play } = useSound();

    const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
      play("hammer");
      if (onClick) onClick(e);
    };

    const baseStyles = cn(
      "transition-all duration-300 active:scale-95 disabled:opacity-50 disabled:pointer-events-none relative h-auto self-center inline-flex items-center justify-center overflow-visible",
      {
        "default": "industrial-copper industrial-copper-btn text-[#e8d5b5] border-[#b87333]/40 shadow-lg",
        "copper": "master-industrial-plate master-industrial-plate-btn text-[#f0e4d0] border-[#c9a84c]/60 shadow-[0_5px_15px_rgba(0,0,0,0.8)]",
        "shabby": "cast-iron-shabby text-[#f0e4d0] border-[#3e1b0d]/80 shadow-[0_8px_25px_rgba(0,0,0,1)]",
        "secondary": "industrial-secondary text-[#c9a84c] border-[#3e1b0d] border-2 shadow-inner hover:border-[#b87333]/40",
        "vapor": "bg-transparent text-[#fff] border-transparent shadow-none hover:text-[#ffb347]",
        "hollow-vapor": "hollow-vapor text-[#fff] hover:text-[#ffb347]",
        "ghost": "bg-transparent text-[#b87333] border-transparent hover:bg-white/5",
      }[variant],
      {
        "sm": "px-2.5 py-1 text-[0.625rem] font-bold uppercase tracking-widest h-7 max-h-7",
        "md": "px-4 py-1.5 text-[0.7rem] font-bold uppercase tracking-widest h-9 max-h-9",
        "lg": "px-6 py-2 text-xs font-bold uppercase tracking-wider h-11 max-h-11",
      }[size],
      className
    );

    // Ghost buttons get no smoke ring
    const showSmokeRing = variant !== "ghost";

    return (
      <button className={cn(baseStyles, "group btn-steam-wrap")} ref={ref} onClick={handleClick} {...props}>
        {/* Persistent steam smoke ring — always visible, intensifies on hover */}
        {showSmokeRing && <SteamSmokeRing />}

        {variant === "shabby" && (
           <div className="absolute inset-0 peeling-red-paint opacity-40 pointer-events-none" />
        )}

        {/* Rivet corners for metal buttons */}
        {(variant === "copper" || variant === "default" || variant === "shabby") && (
          <>
            <ChippedScrew className="top-1 left-1" />
            <ChippedScrew className="top-1 right-1" />
            <ChippedScrew className="bottom-1 left-1" />
            <ChippedScrew className="bottom-1 right-1" />
            <div className="absolute inset-0 bg-gradient-to-tr from-white/10 to-transparent pointer-events-none mix-blend-overlay" />
            <div className="absolute inset-x-0 top-0 h-[1px] bg-white/20 z-30" />
            <div className="absolute inset-x-0 bottom-0 h-[1px] bg-black/60 z-30" />
          </>
        )}

        <span className="relative z-20 flex items-center justify-center gap-2 drop-shadow-[0_2px_4px_rgba(0,0,0,1)] font-black">
          {children}
        </span>
      </button>
    );
  }
);

Button.displayName = "Button";

export { Button };
