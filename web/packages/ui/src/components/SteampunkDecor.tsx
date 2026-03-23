"use client";

import React, { useEffect, useState } from "react";
import { Settings, LifeBuoy, Cog } from "lucide-react";
import { cn } from "../lib/utils";

// ── Metallic 3D Copper Gear — SVG with forged metal gradients ────────
export const CopperGear = ({ className, size = 48, speed = 15, reverse = false, active = true, teeth = 12 }: { className?: string, size?: number, speed?: number, reverse?: boolean, active?: boolean, teeth?: number }) => {
  const id = React.useId().replace(/:/g, '');
  const cx = 50, cy = 50;
  const outerR = 44, innerR = 34, hubR = 16, axleR = 7;
  const toothWidth = 0.45; // fraction of tooth arc

  // Generate gear tooth polygon path
  const pts: string[] = [];
  for (let i = 0; i < teeth; i++) {
    const a0 = (i / teeth) * Math.PI * 2;
    const a1 = ((i + toothWidth) / teeth) * Math.PI * 2;
    const a2 = ((i + 0.5) / teeth) * Math.PI * 2;
    const a3 = ((i + 0.5 + toothWidth) / teeth) * Math.PI * 2;
    pts.push(`${cx + outerR * Math.cos(a0)},${cy + outerR * Math.sin(a0)}`);
    pts.push(`${cx + outerR * Math.cos(a1)},${cy + outerR * Math.sin(a1)}`);
    pts.push(`${cx + innerR * Math.cos(a2)},${cy + innerR * Math.sin(a2)}`);
    pts.push(`${cx + innerR * Math.cos(a3)},${cy + innerR * Math.sin(a3)}`);
  }

  return (
    <div
      className={cn("relative flex items-center justify-center pointer-events-none", className)}
      style={{
        width: size, height: size,
        animation: active ? `spin ${speed}s linear infinite ${reverse ? 'reverse' : ''}` : 'none',
        filter: `drop-shadow(0 ${size * 0.06}px ${size * 0.1}px rgba(0,0,0,0.85))`,
      }}
    >
      <svg viewBox="0 0 100 100" width={size} height={size} xmlns="http://www.w3.org/2000/svg">
        <defs>
          {/* Forged copper metal gradient — directional light from top-left */}
          <radialGradient id={`gm-${id}`} cx="35%" cy="30%" r="65%">
            <stop offset="0%" stopColor="#e8c878" />
            <stop offset="25%" stopColor="#d4956a" />
            <stop offset="50%" stopColor="#b87333" />
            <stop offset="75%" stopColor="#8b5a2b" />
            <stop offset="100%" stopColor="#5a3518" />
          </radialGradient>
          {/* Specular highlight sweep */}
          <linearGradient id={`gs-${id}`} x1="20%" y1="0%" x2="80%" y2="100%">
            <stop offset="0%" stopColor="rgba(255,240,200,0.45)" />
            <stop offset="40%" stopColor="rgba(255,240,200,0)" />
            <stop offset="60%" stopColor="rgba(255,240,200,0)" />
            <stop offset="100%" stopColor="rgba(255,240,200,0.15)" />
          </linearGradient>
          {/* Hub dark gradient */}
          <radialGradient id={`gh-${id}`} cx="40%" cy="35%">
            <stop offset="0%" stopColor="#3a2a18" />
            <stop offset="100%" stopColor="#0d0805" />
          </radialGradient>
          {/* Axle brass gradient */}
          <radialGradient id={`ga-${id}`} cx="38%" cy="32%">
            <stop offset="0%" stopColor="#f0e4d0" />
            <stop offset="50%" stopColor="#c9a84c" />
            <stop offset="100%" stopColor="#8b5a2b" />
          </radialGradient>
          {/* Noise filter for metal texture */}
          <filter id={`fn-${id}`}>
            <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="4" stitchTiles="stitch" result="noise" />
            <feColorMatrix type="saturate" values="0" in="noise" result="grayNoise" />
            <feBlend in="SourceGraphic" in2="grayNoise" mode="overlay" result="textured" />
            <feComposite in="textured" in2="SourceGraphic" operator="in" />
          </filter>
          {/* Inner shadow for depth */}
          <filter id={`fi-${id}`}>
            <feGaussianBlur in="SourceAlpha" stdDeviation="2" result="blur" />
            <feOffset dx="1" dy="2" result="offsetBlur" />
            <feFlood floodColor="#000" floodOpacity="0.6" result="black" />
            <feComposite in="black" in2="offsetBlur" operator="in" result="shadow" />
            <feMerge>
              <feMergeNode in="shadow" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Gear body — forged metal with texture */}
        <polygon points={pts.join(' ')} fill={`url(#gm-${id})`} stroke="#4a2c11" strokeWidth="0.8" filter={`url(#fn-${id})`} />

        {/* Specular highlight overlay */}
        <polygon points={pts.join(' ')} fill={`url(#gs-${id})`} />

        {/* Rim edge bevel — light on top, dark on bottom */}
        <polygon points={pts.join(' ')} fill="none" stroke="rgba(255,240,200,0.2)" strokeWidth="0.5" />

        {/* Hub recess */}
        <circle cx={cx} cy={cy} r={hubR} fill={`url(#gh-${id})`} stroke="#1a0f0a" strokeWidth="1.5" filter={`url(#fi-${id})`} />
        {/* Hub inner ring */}
        <circle cx={cx} cy={cy} r={hubR - 3} fill="none" stroke="rgba(184,115,51,0.25)" strokeWidth="0.5" />

        {/* Axle pin — polished brass */}
        <circle cx={cx} cy={cy} r={axleR} fill={`url(#ga-${id})`} stroke="#5a3518" strokeWidth="0.8" />
        {/* Axle slot */}
        <line x1={cx - 3} y1={cy} x2={cx + 3} y2={cy} stroke="#2a1a0e" strokeWidth="1.2" strokeLinecap="round" />

        {/* ── Wabi-sabi: Verdigris patina — heavy oxidation patches ── */}
        <circle cx={cx + 14} cy={cy - 16} r="6" fill="rgba(74,139,110,0.18)" />
        <circle cx={cx - 18} cy={cy + 10} r="4" fill="rgba(74,139,110,0.14)" />
        <circle cx={cx + 22} cy={cy + 8} r="3.5" fill="rgba(74,139,110,0.12)" />
        <ellipse cx={cx - 10} cy={cy - 20} rx="5" ry="3" fill="rgba(62,120,95,0.13)" />
        <circle cx={cx - 28} cy={cy - 5} r="2.5" fill="rgba(74,139,110,0.10)" />

        {/* ── Wabi-sabi: Rust spots — iron oxide bleed ── */}
        <circle cx={cx + 20} cy={cy + 15} r="4" fill="rgba(139,69,19,0.20)" />
        <circle cx={cx - 25} cy={cy - 12} r="3" fill="rgba(160,82,45,0.18)" />
        <ellipse cx={cx + 8} cy={cy + 25} rx="5" ry="2.5" fill="rgba(139,69,19,0.15)" />
        <circle cx={cx - 5} cy={cy - 28} r="2" fill="rgba(160,82,45,0.12)" />
        <circle cx={cx + 30} cy={cy - 8} r="2.5" fill="rgba(139,69,19,0.16)" />

        {/* ── Wabi-sabi: Chipped paint / edge damage ── */}
        <path d={`M ${cx - 30} ${cy - 25} l 4 -2 l 2 3 l -3 2 z`} fill="rgba(26,15,10,0.35)" />
        <path d={`M ${cx + 25} ${cy + 20} l -3 2 l -2 -4 l 4 -1 z`} fill="rgba(26,15,10,0.30)" />
        <path d={`M ${cx + 18} ${cy - 28} l 2 3 l -4 1 l 0 -3 z`} fill="rgba(26,15,10,0.25)" />

        {/* ── Wabi-sabi: Surface pitting / micro-damage ── */}
        <circle cx={cx - 15} cy={cy + 18} r="1" fill="rgba(10,6,3,0.4)" />
        <circle cx={cx + 28} cy={cy + 3} r="0.8" fill="rgba(10,6,3,0.35)" />
        <circle cx={cx - 22} cy={cy - 18} r="1.2" fill="rgba(10,6,3,0.3)" />
        <circle cx={cx + 12} cy={cy - 22} r="0.7" fill="rgba(10,6,3,0.35)" />
        <circle cx={cx - 8} cy={cy + 30} r="0.9" fill="rgba(10,6,3,0.3)" />

        {/* ── Wabi-sabi: Deep scratches & wear grooves ── */}
        <line x1={cx - 20} y1={cy - 12} x2={cx - 10} y2={cy - 6} stroke="rgba(255,255,255,0.10)" strokeWidth="0.4" />
        <line x1={cx + 10} y1={cy + 18} x2={cx + 20} y2={cy + 12} stroke="rgba(255,255,255,0.08)" strokeWidth="0.3" />
        <line x1={cx - 28} y1={cy + 2} x2={cx - 18} y2={cy + 6} stroke="rgba(200,180,150,0.06)" strokeWidth="0.5" />
        <line x1={cx + 5} y1={cy - 30} x2={cx + 15} y2={cy - 22} stroke="rgba(200,180,150,0.07)" strokeWidth="0.3" />
        <path d={`M ${cx - 12} ${cy + 8} q 5 -3 10 1 q 4 3 8 -1`} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="0.4" />
      </svg>
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

      {/* Metal grain texture overlay */}
      <svg className="absolute inset-0 w-full h-full rounded-full z-40 pointer-events-none" viewBox="0 0 100 100">
        <defs>
          <filter id={`gauge-grain-${size}`}>
            <feTurbulence type="fractalNoise" baseFrequency="1.2" numOctaves="4" stitchTiles="stitch" />
            <feDiffuseLighting surfaceScale="1.5" lightingColor="#c9a84c">
              <feDistantLight azimuth="135" elevation="50" />
            </feDiffuseLighting>
            <feComposite in2="SourceGraphic" operator="in" />
          </filter>
          <clipPath id={`gauge-clip-${size}`}><circle cx="50" cy="50" r="50" /></clipPath>
        </defs>
        <rect width="100" height="100" filter={`url(#gauge-grain-${size})`} clipPath={`url(#gauge-clip-${size})`} opacity="0.08" />
      </svg>
      {/* Glass reflection lens — subtle */}
      <div className="absolute inset-0 rounded-full z-50 pointer-events-none flex items-start justify-center overflow-hidden">
        <div className="w-[70%] h-[35%] bg-gradient-to-b from-white/12 to-transparent rounded-full blur-[2px] translate-y-1" />
      </div>
    </div>
  );
};

// ── Metallic Steam Valve — SVG with forged iron wheel ─────────────────
export const SteamValve = ({ className, size = 56, speed = 20, active = true }: { className?: string, size?: number, speed?: number, active?: boolean }) => {
  const id = React.useId().replace(/:/g, '');
  const cx = 50, cy = 50;
  const spokes = 6;

  return (
    <div
      className={cn("relative flex items-center justify-center pointer-events-none z-10", className)}
      style={{
        width: size, height: size,
        animation: active ? `spin ${speed}s linear infinite` : 'none',
        filter: `drop-shadow(0 ${size * 0.08}px ${size * 0.12}px rgba(0,0,0,0.75))`,
      }}
    >
      <svg viewBox="0 0 100 100" width={size} height={size} xmlns="http://www.w3.org/2000/svg">
        <defs>
          <radialGradient id={`vm-${id}`} cx="35%" cy="30%" r="65%">
            <stop offset="0%" stopColor="#d4956a" />
            <stop offset="40%" stopColor="#b87333" />
            <stop offset="80%" stopColor="#6b4226" />
            <stop offset="100%" stopColor="#3e1b0d" />
          </radialGradient>
          <linearGradient id={`vs-${id}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="rgba(255,240,200,0.35)" />
            <stop offset="50%" stopColor="rgba(255,240,200,0)" />
            <stop offset="100%" stopColor="rgba(255,240,200,0.1)" />
          </linearGradient>
          <filter id={`vn-${id}`}>
            <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="3" stitchTiles="stitch" result="n" />
            <feColorMatrix type="saturate" values="0" in="n" result="gn" />
            <feBlend in="SourceGraphic" in2="gn" mode="overlay" result="t" />
            <feComposite in="t" in2="SourceGraphic" operator="in" />
          </filter>
        </defs>

        {/* Outer ring — thick forged rim */}
        <circle cx={cx} cy={cy} r="42" fill="none" stroke={`url(#vm-${id})`} strokeWidth="7" filter={`url(#vn-${id})`} />
        <circle cx={cx} cy={cy} r="42" fill="none" stroke={`url(#vs-${id})`} strokeWidth="7" />
        {/* Ring edge highlights */}
        <circle cx={cx} cy={cy} r="45" fill="none" stroke="rgba(255,240,200,0.12)" strokeWidth="0.5" />
        <circle cx={cx} cy={cy} r="39" fill="none" stroke="rgba(0,0,0,0.3)" strokeWidth="0.5" />

        {/* Spokes — radiating from center */}
        {Array.from({ length: spokes }, (_, i) => {
          const a = (i / spokes) * Math.PI * 2;
          const x1 = cx + 14 * Math.cos(a);
          const y1 = cy + 14 * Math.sin(a);
          const x2 = cx + 38 * Math.cos(a);
          const y2 = cy + 38 * Math.sin(a);
          return (
            <g key={i}>
              <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#6b4226" strokeWidth="5" strokeLinecap="round" />
              <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="rgba(212,149,106,0.6)" strokeWidth="3" strokeLinecap="round" />
              <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="rgba(255,240,200,0.15)" strokeWidth="1" strokeLinecap="round" />
            </g>
          );
        })}

        {/* Center hub */}
        <circle cx={cx} cy={cy} r="14" fill={`url(#vm-${id})`} stroke="#3e1b0d" strokeWidth="1.5" filter={`url(#vn-${id})`} />
        <circle cx={cx} cy={cy} r="14" fill={`url(#vs-${id})`} />
        {/* Hub recess */}
        <circle cx={cx} cy={cy} r="8" fill="#1a0f0a" stroke="#3e1b0d" strokeWidth="1" />
        <circle cx={cx} cy={cy} r="8" fill="none" stroke="rgba(184,115,51,0.2)" strokeWidth="0.5" />
        {/* Axle bolt */}
        <circle cx={cx} cy={cy} r="4" fill="url(#vm-${id})" stroke="#2a1608" strokeWidth="0.8" />
        {/* Bolt cross slot */}
        <line x1={cx - 2.5} y1={cy} x2={cx + 2.5} y2={cy} stroke="#0d0805" strokeWidth="1" strokeLinecap="round" />
        <line x1={cx} y1={cy - 2.5} x2={cx} y2={cy + 2.5} stroke="#0d0805" strokeWidth="1" strokeLinecap="round" />

        {/* ── Wabi-sabi: Verdigris patina — heavy oxidation ── */}
        <circle cx={cx + 22} cy={cy - 30} r="5" fill="rgba(74,139,110,0.15)" />
        <circle cx={cx - 20} cy={cy + 25} r="3.5" fill="rgba(74,139,110,0.12)" />
        <ellipse cx={cx + 30} cy={cy + 15} rx="4" ry="2.5" fill="rgba(62,120,95,0.10)" />

        {/* ── Wabi-sabi: Rust bleed on rim ── */}
        <circle cx={cx - 30} cy={cy - 18} r="3" fill="rgba(139,69,19,0.18)" />
        <circle cx={cx + 15} cy={cy + 30} r="2.5" fill="rgba(160,82,45,0.15)" />
        <ellipse cx={cx - 10} cy={cy - 35} rx="4" ry="2" fill="rgba(139,69,19,0.12)" />

        {/* ── Wabi-sabi: Chipped edges on rim ── */}
        <path d={`M ${cx + 35} ${cy - 20} l -3 2 l -1 -3 l 3 -1 z`} fill="rgba(26,15,10,0.30)" />
        <path d={`M ${cx - 32} ${cy + 15} l 2 3 l -4 0 l 1 -3 z`} fill="rgba(26,15,10,0.25)" />

        {/* ── Wabi-sabi: Surface pitting ── */}
        <circle cx={cx + 25} cy={cy - 10} r="0.8" fill="rgba(10,6,3,0.4)" />
        <circle cx={cx - 18} cy={cy + 15} r="1" fill="rgba(10,6,3,0.35)" />
        <circle cx={cx + 8} cy={cy + 28} r="0.7" fill="rgba(10,6,3,0.3)" />

        {/* ── Wabi-sabi: Wear scratches ── */}
        <line x1={cx - 25} y1={cy - 5} x2={cx - 15} y2={cy - 2} stroke="rgba(255,255,255,0.07)" strokeWidth="0.4" />
        <line x1={cx + 12} y1={cy + 20} x2={cx + 22} y2={cy + 15} stroke="rgba(200,180,150,0.06)" strokeWidth="0.3" />
      </svg>
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

// ── Vapor Ring — lightweight steam band wrapping around card ──────────────
export function VaporRing({ className }: { className?: string }) {
  // Optimized: 10 cloud clusters × 6 particles = 60 total (was 288)
  // All particles tiny (r ≤ 0.5), grouped tight, no large particles ever
  const cloudsCount = 10;
  const particlesPerCloud = 6;

  const particles = React.useMemo(() => {
    const result: { path: string; dur: number; delay: number; r: number; maxOpacity: number; fill: string }[] = [];

    for (let c = 0; c < cloudsCount; c++) {
      const cloudT = c / cloudsCount;
      const cloudSpeed = 12 + (c % 4) * 1.5;
      const cloudDelay = -(c * 1.2);

      const margin = 4 + (c % 3) * 2;
      const inner = 10 - margin;
      const outer = 110 + margin;
      const w = outer - inner;
      const h = outer - inner;
      const perim = 2 * w + 2 * h;

      // Fewer path steps for performance
      const steps = 16;
      const centerPts: [number, number][] = [];
      for (let s = 0; s <= steps; s++) {
        const frac = (cloudT + s / steps) % 1;
        const d = frac * perim;
        let x: number, y: number;
        if (d < w) { x = inner + d; y = inner; }
        else if (d < w + h) { x = outer; y = inner + (d - w); }
        else if (d < 2 * w + h) { x = outer - (d - w - h); y = outer; }
        else { x = inner; y = outer - (d - 2 * w - h); }
        const wobble = Math.sin(s * 1.2 + c * 2.1) * 0.6;
        const cx = 60, cy = 60;
        const dx = x - cx, dy = y - cy;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        x += (dx / dist) * wobble;
        y += (dy / dist) * wobble;
        centerPts.push([x, y]);
      }

      for (let p = 0; p < particlesPerCloud; p++) {
        const ox = Math.sin(p * 2.3 + c) * 1.5;
        const oy = Math.cos(p * 1.7 + c) * 1.2;

        const pts = centerPts.map(([x, y]) => [x + ox, y + oy] as [number, number]);
        let path = `M ${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
        for (let s = 1; s < pts.length - 1; s++) {
          const cpx = (pts[s][0] + pts[s + 1][0]) / 2;
          const cpy = (pts[s][1] + pts[s + 1][1]) / 2;
          path += ` Q ${pts[s][0].toFixed(1)},${pts[s][1].toFixed(1)} ${cpx.toFixed(1)},${cpy.toFixed(1)}`;
        }
        path += ' Z';

        // Tiny particles only: r = 0.25 ~ 0.5
        const r = 0.25 + (p % 4) * 0.06;
        const maxOpacity = 0.45 + (p % 3) * 0.1;
        const fills = [
          "rgba(220,212,198,0.7)", "rgba(210,200,185,0.65)",
          "rgba(215,205,192,0.7)", "rgba(200,190,175,0.55)",
        ];

        result.push({
          path,
          dur: cloudSpeed + (p % 3) * 0.4,
          delay: cloudDelay - p * 0.05,
          r,
          maxOpacity,
          fill: fills[p % fills.length],
        });
      }
    }
    return result;
  }, []);

  const [filterId] = React.useState(() => `vr-blur-${Math.random().toString(36).slice(2, 6)}`);

  return (
    <div className={cn("absolute inset-[-12px] pointer-events-none z-[9999] overflow-visible", className)}>
      <svg width="100%" height="100%" viewBox="0 0 120 120" preserveAspectRatio="none" style={{ overflow: 'visible' }}>
        <defs>
          <filter id={filterId}><feGaussianBlur stdDeviation="2.0" /></filter>
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
              values={`${p.maxOpacity * 0.3};${p.maxOpacity * 0.7};${p.maxOpacity};${p.maxOpacity * 0.75};${p.maxOpacity * 0.3}`}
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
