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
 * SteamSmokeRing — always-visible foggy smoke ring that orbits the button.
 * Uses elliptical paths for organic, irregular steam cloud feel.
 */
let smokeIdCounter = 0;
function SteamSmokeRing() {
  const [filterId] = React.useState(() => `smoke-blur-${++smokeIdCounter}`);
  return (
    <div className="steam-smoke-ring">
      <svg width="100%" height="100%" viewBox="-10 -10 140 80" preserveAspectRatio="none" className="absolute inset-0 w-full h-full" style={{ overflow: 'visible' }}>
        <defs>
          <filter id={filterId}>
            <feGaussianBlur stdDeviation="4" />
          </filter>
        </defs>
        {/* Elliptical orbiting smoke puffs — organic irregular steam */}
        {[...Array(24)].map((_, i) => {
          const dur = 5 + (i % 6) * 1.5;
          const r = 3 + (i % 4) * 2;
          const delay = -(i * 0.4);
          // Wobble offsets for organic feel — each particle has slightly different ellipse
          const wobX = (i % 3 - 1) * 4;
          const wobY = (i % 5 - 2) * 3;
          // Elliptical path with organic wobble — NOT rectangular
          const path = `M 60,${-5 + wobY} C ${100 + wobX},${-8 + wobY} ${125 + wobX},${15 + wobY} ${120 + wobX},${30 + wobY} C ${118 + wobX},${50 + wobY} ${100 + wobX},${68 + wobY} 60,${65 + wobY} C ${20 - wobX},${68 - wobY} ${-5 - wobX},${50 - wobY} ${0 - wobX},${30 - wobY} C ${2 - wobX},${12 - wobY} ${20 - wobX},${-5 + wobY} 60,${-5 + wobY} Z`;
          return (
            <circle
              key={i}
              r={r}
              fill="rgba(255,255,255,0.8)"
              opacity="0"
              filter={`url(#${filterId})`}
            >
              <animateMotion
                dur={`${dur}s`}
                repeatCount="indefinite"
                begin={`${delay}s`}
                path={path}
                rotate="auto"
              />
              <animate
                attributeName="opacity"
                values="0;0.3;0.55;0.4;0.6;0.3;0"
                dur={`${dur}s`}
                begin={`${delay}s`}
                repeatCount="indefinite"
              />
              <animate
                attributeName="r"
                values={`${r};${r * 2};${r * 1.5};${r * 2.8};${r * 1.8};${r}`}
                dur={`${dur}s`}
                begin={`${delay}s`}
                repeatCount="indefinite"
              />
            </circle>
          );
        })}
      </svg>
      {/* CSS fog layers — soft glow around edges */}
      <div className="steam-fog-layer steam-fog-top" />
      <div className="steam-fog-layer steam-fog-bottom" />
      <div className="steam-fog-layer steam-fog-left" />
      <div className="steam-fog-layer steam-fog-right" />
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
        "secondary": "bg-[#1a1108] text-[#c9a84c] border-[#3e1b0d] hover:bg-[#2a1a11] border-2 shadow-inner hover:border-[#b87333]/40",
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
