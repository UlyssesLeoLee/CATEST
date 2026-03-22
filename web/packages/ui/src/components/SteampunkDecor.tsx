"use client";

import React, { useEffect, useState } from "react";
import { Settings, LifeBuoy, Cog } from "lucide-react";
import { cn } from "../lib/utils";

// ── Enhanced Copper Gear with patina and depth ────────────────────────
export const CopperGear = ({ className, size = 48, speed = 15, reverse = false, active = true }: { className?: string, size?: number, speed?: number, reverse?: boolean, active?: boolean }) => {
  return (
    <div
      className={cn("relative flex items-center justify-center pointer-events-none", className)}
      style={{
         width: size, height: size,
         animation: active ? `spin ${speed}s linear infinite ${reverse ? 'reverse' : ''}` : 'none',
         filter: 'drop-shadow(0 4px 6px rgba(0,0,0,0.8))'
      }}
    >
      <Settings size={size} className="text-[#c9a84c]" strokeWidth={2.5} style={{ filter: 'drop-shadow(inset 0 2px 4px rgba(255,255,255,0.3))' }} />
      {/* Center hub with 3D depth */}
      <div className="absolute w-[28%] h-[28%] rounded-full border-2 border-[#8b5a2b] shadow-[inset_0_2px_4px_rgba(0,0,0,0.9)]"
        style={{ background: 'radial-gradient(circle at 35% 35%, #2a1a0e, #1a1108)' }} />
      <div className="absolute w-[12%] h-[12%] rounded-full shadow-[0_1px_2px_black]"
        style={{ background: 'radial-gradient(circle at 35% 35%, #d4b854, #917b3c)' }} />
      {/* Verdigris patch */}
      <div className="absolute w-[20%] h-[15%] rounded-full opacity-20 top-[15%] right-[20%]"
        style={{ background: 'radial-gradient(circle, rgba(74,139,110,0.6), transparent)' }} />
    </div>
  );
};

// ── Cinematic Pressure Gauge — movie-quality mechanical dial ──────────
export const PressureGauge = ({ className, size = 64, value = 50, max = 100, label, dangerZone = 80 }: { className?: string, size?: number, value?: number, max?: number, label?: string, dangerZone?: number }) => {
  const [rotation, setRotation] = useState(-90);

  useEffect(() => {
    const targetAngle = ((value / max) * 240) - 120;
    setRotation(targetAngle);

    const interval = setInterval(() => {
      const twitch = (Math.random() * 4) - 2;
      setRotation(targetAngle + twitch);
    }, 800 + Math.random() * 1500);
    return () => clearInterval(interval);
  }, [value, max]);

  const dangerAngle = ((dangerZone / max) * 240) - 120;

  return (
    <div className={cn("relative rounded-full flex flex-col items-center justify-center frame-vibrate", className)} style={{
      width: size, height: size,
      background: 'radial-gradient(circle at 30% 30%, #2a1a11 0%, #0d0805 100%)',
      boxShadow: '0 8px 20px rgba(0,0,0,0.9), inset 0 4px 20px #000, 0 0 0 2px rgba(107,28,35,0.1)',
      animation: 'frame-vibrate 10s linear infinite'
    }}>
      {/* Outer brass ring — heavy 3D texture with Victorian engraving feel */}
      <div className="absolute inset-0 rounded-full border-[5px] border-[#8b5a2b]"
        style={{
          borderTopColor: '#d4af37',
          borderBottomColor: '#4a2c11',
          boxShadow: 'inset 0 2px 8px rgba(255,255,255,0.15), 0 1px 1px rgba(255,255,255,0.2), inset 0 -2px 4px rgba(0,0,0,0.6)'
        }} />

      {/* Precision ticks */}
      <div className="absolute rounded-full border border-dashed"
        style={{ inset: '12%', borderWidth: '2px', borderColor: 'rgba(240,228,208,0.08)' }} />

      {/* Inner dial rim */}
      <div className="absolute inset-[15%] rounded-full shadow-[inset_0_0_15px_black] pointer-events-none" />

      {/* Danger zone arc — burgundy red */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full overflow-hidden" style={{ width: size * 0.76, height: size * 0.76 }}>
         <div className="absolute top-0 right-0 w-1/2 h-1/2 border-t-[3px] border-r-[3px] rounded-tr-full"
           style={{ borderColor: 'rgba(107,28,35,0.6)', boxShadow: '0 0 8px rgba(107,28,35,0.4)' }} />
      </div>

      {/* Center pin hub */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[12%] h-[12%] rounded-full z-30 flex items-center justify-center border border-[#1a1108]"
        style={{ background: 'radial-gradient(circle at 40% 35%, #f0e4d0, #b87333)', boxShadow: '0 2px 6px rgba(0,0,0,0.9)' }}>
         <div className="w-[30%] h-[30%] rounded-full bg-[#1a1108]" />
      </div>

      {/* Dynamic needle */}
      <div
        className="absolute w-[3.5%] origin-bottom z-20"
        style={{
           height: size * 0.42,
           bottom: '50%',
           background: 'linear-gradient(to top, #3e1b0d 0%, #d35400 90%, #ff7b00 100%)',
           transform: `rotate(${rotation}deg) translateX(-50%)`,
           transition: 'transform 0.8s cubic-bezier(0.34, 1.56, 0.64, 1)',
           clipPath: 'polygon(50% 0%, 100% 100%, 0% 100%)',
           filter: 'drop-shadow(2px 4px 3px rgba(0,0,0,0.8))'
        }}
      />

      {/* Digital reading */}
      {label && <div className="absolute bottom-[18%] text-[0.16em] font-mono font-black text-[#e8d5b5] text-center uppercase tracking-widest leading-none z-10" style={{ textShadow: '0 0 6px rgba(232,213,181,0.6)' }}>{label}</div>}

      {/* Glass reflection lens */}
      <div className="absolute inset-0 rounded-full z-50 pointer-events-none flex items-start justify-center overflow-hidden">
        <div className="w-[80%] h-[40%] bg-gradient-to-b from-white/25 to-transparent rounded-full blur-[2px] translate-y-1" />
      </div>
    </div>
  );
};

// ── Steam Valve with Victorian wheel design ───────────────────────────
export const SteamValve = ({ className, size = 56, speed = 20, active = true }: { className?: string, size?: number, speed?: number, active?: boolean }) => {
  return (
    <div
      className={cn("relative flex items-center justify-center pointer-events-none z-10", className)}
      style={{
         width: size, height: size,
         animation: active ? `spin ${speed}s linear infinite` : 'none',
         filter: 'drop-shadow(0 5px 8px rgba(0,0,0,0.7))',
         color: '#cd7f32'
      }}
    >
      <LifeBuoy size={size} strokeWidth={3} style={{ filter: 'drop-shadow(inset 0 2px 2px rgba(255,255,255,0.4))' }} />
      <div className="absolute w-[20%] h-[20%] rounded-full bg-[#1a1108] border border-[#a06225]" />
      {/* Verdigris accent */}
      <div className="absolute w-[30%] h-[10%] rounded-full opacity-15 bottom-[25%] left-[15%]"
        style={{ background: 'radial-gradient(circle, rgba(74,139,110,0.8), transparent)' }} />
    </div>
  );
};

// ── Mechanical Piston with enhanced depth ─────────────────────────────
export function MechanicalPiston({ className, active = false }: { className?: string; active?: boolean }) {
  return (
    <div className={cn("w-12 h-20 flex flex-col items-center relative", className)}>
      {/* Piston cylinder head */}
      <div className="w-14 h-4 border border-[#1a1108] rounded-t-sm shadow-md"
        style={{ background: 'linear-gradient(to bottom, #d4af37, #c9a84c, #8b5a2b)' }} />
      {/* Cylinder body */}
      <div className="w-12 flex-1 border-x border-[#1a1108] relative overflow-hidden"
        style={{ background: 'linear-gradient(to right, #2a1a11, #3e1b0d, #2a1a11)' }}>
        {/* Cooling fins */}
        <div className="absolute inset-0 flex flex-col justify-around py-1">
          {[1,2,3,4,5].map(i => <div key={i} className="h-[1px] bg-[#1a1108]/40" />)}
        </div>
        {/* Internal piston rod */}
        <div
          className="absolute left-1/2 -translate-x-1/2 w-4 border-x border-black/30 transition-all duration-300"
          style={{
            height: '100%',
            top: active ? '20%' : '-10%',
            background: 'linear-gradient(to right, #6b6560, #c0c0c0, #e0e0e0, #c0c0c0, #6b6560)',
            boxShadow: '0 0 10px rgba(0,0,0,0.5)'
          }}
        />
      </div>
      {/* Base connector */}
      <div className="w-16 h-8 border border-[#1a1108] rounded-b-lg"
        style={{ background: 'linear-gradient(to bottom, #8b5a2b, #2a1a11)', boxShadow: 'inset 0 2px 4px black' }} />
    </div>
  );
}

// ── Relay Status — amber signal lights ────────────────────────────────
export function RelayStatus({ active = false }: { active?: boolean }) {
  return (
    <div className="flex gap-1.5 p-2 rounded-lg shadow-inner"
      style={{ background: 'rgba(10,6,4,0.6)', border: '1px solid rgba(184,115,51,0.2)' }}>
      {[1,2,3].map(i => (
        <div
          key={i}
          className={cn(
            "w-2.5 h-6 rounded-sm border border-black/40 transition-all duration-500",
            active ? "shadow-[0_0_12px_#ffae00,inset_0_0_4px_white]" : "shadow-inner"
          )}
          style={{
            background: active
              ? `linear-gradient(to bottom, #ffae00, #e67e22)`
              : '#1a1108',
            animation: active ? `pulse 2s infinite ${i * 0.3}s` : 'none'
          }}
        />
      ))}
    </div>
  );
}

// ── Mechanical Gearroom — background gear cluster ─────────────────────
export function MechanicalGearroom() {
  return (
    <div className="gear-room">
      <div className="absolute -top-20 -left-20 w-[400px] h-[400px] opacity-20">
        <Cog className="w-full h-full text-[#917b3c] animate-gear-rotate" style={{ animationDuration: '120s' }} />
      </div>
      <div className="absolute top-40 left-60 w-[300px] h-[300px] opacity-10">
        <Cog className="w-full h-full text-[#8b5a2b] animate-gear-rotate-reverse" style={{ animationDuration: '90s' }} />
      </div>
      <div className="absolute -bottom-40 right-20 w-[500px] h-[500px] opacity-15">
        <Cog className="w-full h-full text-[#3e1b0d] animate-gear-rotate" style={{ animationDuration: '180s' }} />
      </div>
    </div>
  );
}

// ── Steam Leak — pipe emission particles ──────────────────────────────
export function SteamLeak({ className }: { className?: string }) {
  return (
    <div className={cn("relative w-4 h-4 flex items-center justify-center", className)}>
      <div className="steam-puff-element" style={{ animationDelay: '0s' }} />
      <div className="steam-puff-element" style={{ animationDelay: '1.2s' }} />
      <div className="steam-puff-element" style={{ animationDelay: '2.5s' }} />
    </div>
  );
}

// ── Vapor Border — drifting clouds around elements ────────────────────
export function VaporBorder({ className }: { className?: string }) {
  return (
    <div className={cn("vapor-border-top", className)}>
      <div className="vapor-cloud w-16 h-16 top-0 left-0 animate-[vapor-drift-1_8s_infinite]" />
      <div className="vapor-cloud w-20 h-20 bottom-0 right-0 animate-[vapor-drift-2_6s_infinite]" style={{ animationDelay: '-2s' }} />
      <div className="vapor-cloud w-12 h-12 top-1/2 left-[-10px] animate-[vapor-drift-1_10s_infinite]" style={{ animationDelay: '-5s' }} />
      <div className="vapor-cloud w-14 h-14 bottom-1/4 right-[-10px] animate-[vapor-drift-2_12s_infinite]" style={{ animationDelay: '-1s' }} />
    </div>
  );
}

// ── Chipped Screw — 3D rivet with enhanced depth ──────────────────────
export function ChippedScrew({ className }: { className?: string }) {
  return (
    <div className={cn("chipped-rivet", className)} />
  );
}

// ── Vapor Ring — SVG particle ring ────────────────────────────────────
export function VaporRing({ className }: { className?: string }) {
  return (
    <div className={cn("absolute inset-[-20px] pointer-events-none z-[9999] overflow-visible", className)}>
      <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none" className="filter blur-[2px]">
        {[...Array(10)].map((_, i) => (
          <circle
            key={i}
            r={Math.random() * 2 + 1}
            fill="white"
            opacity="0.6"
          >
            <animateMotion
              dur={`${5 + Math.random() * 5}s`}
              repeatCount="indefinite"
              begin={`${-Math.random() * 5}s`}
              path="M 10,10 H 90 V 90 H 10 Z"
            />
            <animate
              attributeName="opacity"
              values="0;0.6;0"
              dur={`${2 + Math.random() * 2}s`}
              repeatCount="indefinite"
            />
            <animate
              attributeName="r"
              values="1;4;1"
              dur={`${3 + Math.random() * 3}s`}
              repeatCount="indefinite"
            />
          </circle>
        ))}
      </svg>
    </div>
  );
}

// ── Victorian Ornament Divider — decorative line separator ────────────
export function VictorianDivider({ className }: { className?: string }) {
  return (
    <div className={cn("relative flex items-center justify-center py-2", className)}>
      <div className="flex-1 h-px bg-gradient-to-r from-transparent via-[#b87333]/30 to-transparent" />
      <div className="mx-3 w-2 h-2 rotate-45 border border-[#917b3c]/40 bg-[#0e0b08]" />
      <div className="flex-1 h-px bg-gradient-to-r from-transparent via-[#b87333]/30 to-transparent" />
    </div>
  );
}

// ── Pressure Valve Indicator — status with gas lamp glow ──────────────
export function PressureValveIndicator({ value = 0, label, status = "nominal" }: { value?: number; label?: string; status?: "nominal" | "warning" | "critical" }) {
  const colors = {
    nominal: { bar: 'from-[#4caf50] to-[#2e8b57]', text: 'text-[#4caf50]', glow: 'rgba(76,175,80,0.3)' },
    warning: { bar: 'from-[#e67e22] to-[#ffb347]', text: 'text-[#e67e22]', glow: 'rgba(230,126,34,0.3)' },
    critical: { bar: 'from-[#6b1c23] to-[#8b2252]', text: 'text-[#8b2252]', glow: 'rgba(107,28,35,0.3)' },
  };
  const c = colors[status];

  return (
    <div className="flex items-center gap-3 px-3 py-2 rounded-lg"
      style={{ background: 'rgba(14,11,8,0.6)', border: '1px solid rgba(184,115,51,0.1)' }}>
      {/* Gas lamp indicator dot */}
      <div className="w-2 h-2 rounded-full gas-lamp-glow"
        style={{ background: status === 'nominal' ? '#4caf50' : status === 'warning' ? '#e67e22' : '#8b2252', boxShadow: `0 0 8px ${c.glow}` }} />
      <div className="flex-1">
        {label && <div className="text-[9px] uppercase tracking-widest text-[#8a7b6a] font-bold">{label}</div>}
        <div className="mt-1 h-1.5 rounded-full overflow-hidden" style={{ background: '#1a0e08', border: '1px solid rgba(184,115,51,0.1)' }}>
          <div className={cn("h-full rounded-full bg-gradient-to-r transition-all duration-1000", c.bar)}
            style={{ width: `${value}%`, boxShadow: `0 0 8px ${c.glow}` }} />
        </div>
      </div>
      <span className={cn("text-[10px] font-bold font-mono", c.text)} style={{ textShadow: `0 0 6px ${c.glow}` }}>{value}%</span>
    </div>
  );
}
