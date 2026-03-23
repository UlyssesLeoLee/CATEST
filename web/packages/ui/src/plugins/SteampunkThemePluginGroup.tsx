"use client";

/**
 * SteampunkThemePluginGroup
 *
 * Cinematic atmospheric effects inspired by Hugo, Mortal Engines, Steamboy,
 * City of Lost Children, and Howl's Moving Castle.
 *
 * Plugins:
 *  1. AmbientFog — mesh, grid, fog, vignette, grain
 *  2. SteamParticleField — multi-layer emission with depth
 *  3. TextureDecoration — rotating gears/valves from textures
 *  4. BoilerGlow — furnace underglow with burgundy warmth
 *  5. EmberParticles — forge sparks with varied colors
 *  6. HeatShimmer — bottom distortion overlay
 *  7. GasLampAmbient — warm flickering gas lamp pools
 */

import React from "react";
import type { PluginGroup, Plugin } from "./index";

/* ─── Steam Particle Field Plugin (120 particles, 4 depth layers) ───── */

function SteamParticleFieldPlugin() {
  // Cloud-cluster approach: 6 emission vents, each spawns a tight cloud puff
  // Each cloud = 1 parent div with multiple tiny sub-particles inside
  // Total DOM elements: 6 clouds × 5 sub-particles = 30
  const clouds = React.useMemo(() => {
    const vents = [
      { x: 8,  y: 90, driftX: 15,  driftY: -90 },
      { x: 30, y: 94, driftX: -10, driftY: -100 },
      { x: 55, y: 96, driftX: 5,   driftY: -85 },
      { x: 78, y: 92, driftX: -20, driftY: -95 },
      { x: 95, y: 88, driftX: -30, driftY: -80 },
      { x: 3,  y: 55, driftX: 25,  driftY: -60 },
    ];

    return vents.map((vent, vi) => {
      const dur = 8 + (vi % 3) * 3;
      const delay = vi * 1.5;
      // Sub-particles tightly clustered within 6px of cloud center
      const subs = Array.from({ length: 5 }, (_, si) => ({
        ox: Math.sin(si * 2.3 + vi) * 4,
        oy: Math.cos(si * 1.7 + vi) * 3,
        size: 3 + (si % 3),  // 3-5px
        opacity: 0.2 + (si % 3) * 0.06,
      }));
      return { ...vent, dur, delay, subs };
    });
  }, []);

  return (
    <div className="fixed inset-0 pointer-events-none z-[2] overflow-hidden">
      {clouds.map((cloud, ci) => (
        <div
          key={ci}
          className="absolute"
          style={{
            left: `${cloud.x}%`,
            top: `${cloud.y}%`,
            animation: `steam-field-drift ${cloud.dur}s ease-in-out infinite ${cloud.delay}s`,
            "--drift-x": `${cloud.driftX}px`,
            "--drift-y": `${cloud.driftY}px`,
            "--particle-max-opacity": "0.25",
          } as React.CSSProperties}
        >
          {cloud.subs.map((sub, si) => (
            <div
              key={si}
              className="absolute rounded-full"
              style={{
                width: sub.size,
                height: sub.size,
                left: sub.ox,
                top: sub.oy,
                background: `radial-gradient(circle, rgba(215,205,192,${sub.opacity}) 0%, transparent 70%)`,
                filter: 'blur(3px)',
                mixBlendMode: 'screen',
              }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

/* ─── 3D Texture Decoration Plugin ─────────────────────────────────── */

function TextureDecorationPlugin() {
  const decorations = React.useMemo(() => [
    { src: "/textures/gear_copper.png", x: -8, y: -10, size: 240, rotation: 0, speed: 90, opacity: 0.10 },
    { src: "/textures/gear_brass.png", x: 6, y: 8, size: 160, rotation: 15, speed: 60, opacity: 0.08, reverse: true },
    { src: "/textures/gear_copper.png", x: 82, y: 72, size: 280, rotation: 30, speed: 140, opacity: 0.06 },
    { src: "/textures/gear_copper.png", x: 95, y: 60, size: 120, rotation: 0, speed: 70, opacity: 0.07, reverse: true },
    { src: "/textures/valve_wheel.png", x: 90, y: -4, size: 110, rotation: 0, speed: 50, opacity: 0.09 },
    { src: "/textures/gear_brass.png", x: -4, y: 78, size: 180, rotation: 60, speed: 110, opacity: 0.06 },
    { src: "/textures/valve_gate.png", x: 8, y: 92, size: 70, rotation: 0, speed: 0, opacity: 0.05 },
    { src: "/textures/valve_gate.png", x: 48, y: 94, size: 60, rotation: 0, speed: 0, opacity: 0.04 },
    { src: "/textures/gear_copper.png", x: 96, y: 35, size: 80, rotation: 0, speed: 45, opacity: 0.04, reverse: true },
  ], []);

  return (
    <div className="fixed inset-0 pointer-events-none z-[1] overflow-hidden">
      {decorations.map((d, i) => (
        <img
          key={i}
          src={d.src}
          alt=""
          className="absolute select-none"
          style={{
            left: `${d.x}%`,
            top: `${d.y}%`,
            width: d.size,
            height: d.size,
            opacity: d.opacity,
            transform: `rotate(${d.rotation}deg)`,
            animation: d.speed > 0
              ? `gear-rotate${(d as { reverse?: boolean }).reverse ? '-reverse' : ''} ${d.speed}s linear infinite`
              : 'none',
            filter: 'saturate(0.7) brightness(0.8)',
            mixBlendMode: 'soft-light',
          }}
          loading="lazy"
          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
        />
      ))}
    </div>
  );
}

/* ─── Ambient Fog Plugin ─────────────────────────────────────────────── */

function AmbientFogPlugin() {
  return (
    <>
      <div className="bg-mesh fixed inset-0 pointer-events-none z-0" />
      <div className="bg-grid fixed inset-0 pointer-events-none opacity-30 z-0" />
      <div className="fog-layer-1" />
      <div className="fog-layer-2" />
      <div className="bg-vignette" />
      <div className="bg-grain" />
    </>
  );
}

/* ─── Boiler Glow Plugin — furnace underglow with burgundy warmth ──── */

function BoilerGlowPlugin() {
  return (
    <>
      {/* Primary furnace — bottom center, warm orange */}
      <div
        className="fixed pointer-events-none z-[1]"
        style={{
          bottom: '-10%',
          left: '15%',
          right: '15%',
          height: '50%',
          background: 'radial-gradient(ellipse at 50% 100%, rgba(255,107,26,0.07) 0%, rgba(184,115,51,0.04) 30%, transparent 65%)',
          animation: 'furnace-pulse 6s infinite ease-in-out',
          mixBlendMode: 'screen',
        }}
      />
      {/* Burgundy warmth — left furnace */}
      <div
        className="fixed pointer-events-none z-[1]"
        style={{
          bottom: '-5%',
          left: '-5%',
          width: '30%',
          height: '40%',
          background: 'radial-gradient(ellipse at 0% 100%, rgba(107,28,35,0.06) 0%, rgba(75,14,14,0.03) 40%, transparent 60%)',
          animation: 'furnace-pulse 8s infinite ease-in-out 2s',
          mixBlendMode: 'screen',
        }}
      />
      {/* Right verdigris ambient — subtle green tinge */}
      <div
        className="fixed pointer-events-none z-[1]"
        style={{
          bottom: '10%',
          right: '-3%',
          width: '20%',
          height: '30%',
          background: 'radial-gradient(ellipse at 100% 80%, rgba(74,139,110,0.03) 0%, transparent 50%)',
          mixBlendMode: 'screen',
        }}
      />
      {/* Furnace core flash */}
      <div
        className="fixed pointer-events-none z-[1]"
        style={{
          bottom: '0',
          left: '30%',
          width: '40%',
          height: '8%',
          background: 'radial-gradient(ellipse at 50% 100%, rgba(255,179,71,0.08) 0%, transparent 80%)',
          animation: 'boiler-flicker 4s infinite ease-in-out 1s',
          mixBlendMode: 'screen',
        }}
      />
    </>
  );
}

/* ─── Ember Particles — forge sparks with varied hues ──────────────── */

function EmberParticlesPlugin() {
  const EMBER_COUNT = 20;
  const embers = React.useMemo(() => {
    return Array.from({ length: EMBER_COUNT }, (_, i) => {
      // Varied emission: forge (bottom), pipe joints (sides), scattered
      const zone = i % 3;
      let x: number, y: number;
      if (zone === 0) { x = Math.random() * 60 + 20; y = Math.random() * 15 + 82; }       // forge bottom
      else if (zone === 1) { x = Math.random() * 10 + (Math.random() > 0.5 ? 88 : 2); y = Math.random() * 60 + 20; } // pipe sides
      else { x = Math.random() * 80 + 10; y = Math.random() * 30 + 65; }                   // scattered

      return {
        id: i,
        x, y,
        size: Math.random() * 3 + 1,
        duration: Math.random() * 10 + 6,
        delay: Math.random() * 15,
        driftX: (Math.random() - 0.5) * 100,
        // Varied hues: orange-red (15-45), occasional verdigris spark (150-170)
        hue: i % 12 === 0 ? Math.random() * 20 + 150 : Math.random() * 30 + 15,
        brightness: Math.random() * 0.4 + 0.6,
      };
    });
  }, []);

  return (
    <div className="fixed inset-0 pointer-events-none z-[3] overflow-hidden">
      {embers.map((e) => (
        <div
          key={e.id}
          className="absolute rounded-full"
          style={{
            width: e.size,
            height: e.size,
            left: `${e.x}%`,
            top: `${e.y}%`,
            background: `hsl(${e.hue}, 100%, ${e.brightness * 60 + 20}%)`,
            boxShadow: `0 0 ${e.size * 2}px hsl(${e.hue}, 100%, 50%), 0 0 ${e.size * 4}px hsl(${e.hue}, 80%, 30%)`,
            animation: `ember-rise ${e.duration}s ease-out infinite ${e.delay}s`,
            "--ember-drift": `${e.driftX}px`,
          } as React.CSSProperties}
        />
      ))}
    </div>
  );
}

/* ─── Heat Shimmer Plugin ──────────────────────────────────────────── */

function HeatShimmerPlugin() {
  return (
    <>
      <svg className="fixed bottom-0 left-0 right-0 pointer-events-none z-[4]" width="0" height="0" style={{ position: 'absolute' }}>
        <defs>
          <filter id="heat-shimmer">
            <feTurbulence type="fractalNoise" baseFrequency="0.015 0.08" numOctaves="2" seed="3">
              <animate attributeName="baseFrequency" values="0.015 0.08;0.02 0.1;0.015 0.08" dur="8s" repeatCount="indefinite" />
            </feTurbulence>
            <feDisplacementMap in="SourceGraphic" scale="4" xChannelSelector="R" yChannelSelector="G" />
          </filter>
        </defs>
      </svg>
      <div
        className="fixed pointer-events-none z-[4]"
        style={{
          bottom: 0,
          left: 0,
          right: 0,
          height: '12%',
          background: 'linear-gradient(to top, rgba(255,107,26,0.03), transparent)',
          filter: 'url(#heat-shimmer)',
          mixBlendMode: 'overlay',
        }}
      />
    </>
  );
}

/* ─── Gas Lamp Ambient Plugin — warm flickering light pools ─────────── */

function GasLampAmbientPlugin() {
  const lamps = React.useMemo(() => [
    { x: 15, y: 5, size: 200, opacity: 0.04, delay: 0 },
    { x: 75, y: 8, size: 160, opacity: 0.03, delay: 1.5 },
    { x: 50, y: 3, size: 120, opacity: 0.035, delay: 3 },
  ], []);

  return (
    <div className="fixed inset-0 pointer-events-none z-[1] overflow-hidden">
      {lamps.map((lamp, i) => (
        <div
          key={i}
          className="absolute rounded-full"
          style={{
            left: `${lamp.x}%`,
            top: `${lamp.y}%`,
            width: lamp.size,
            height: lamp.size,
            background: `radial-gradient(circle, rgba(255,179,71,${lamp.opacity}) 0%, rgba(230,126,34,${lamp.opacity * 0.5}) 30%, transparent 70%)`,
            animation: `gas-lamp-flicker 4s infinite ease-in-out ${lamp.delay}s`,
            transform: 'translate(-50%, -50%)',
            mixBlendMode: 'screen',
          }}
        />
      ))}
    </div>
  );
}

/* ─── Drifting Steam Clouds — large fog banks that drift slowly ─────── */

function DriftingSteamCloudsPlugin() {
  // Reduced: 4 clouds (was 6), smaller sizes for lighter rendering
  const clouds = React.useMemo(() => [
    { x: -10, y: 20, w: 300, h: 80, opacity: 0.03, dur: 50, delay: 0 },
    { x: 110, y: 40, w: 350, h: 70, opacity: 0.025, dur: 60, delay: 8 },
    { x: -15, y: 65, w: 280, h: 60, opacity: 0.02, dur: 45, delay: 16 },
    { x: 105, y: 80, w: 320, h: 75, opacity: 0.025, dur: 55, delay: 12 },
  ], []);

  return (
    <div className="fixed inset-0 pointer-events-none z-[2] overflow-hidden">
      {clouds.map((c, i) => {
        const fromLeft = i % 2 === 0;
        return (
          <div
            key={i}
            className="absolute rounded-full"
            style={{
              width: c.w,
              height: c.h,
              top: `${c.y}%`,
              left: fromLeft ? `${c.x}%` : undefined,
              right: fromLeft ? undefined : `${c.x - 100}%`,
              background: `radial-gradient(ellipse, rgba(255,255,255,${c.opacity}) 0%, rgba(200,190,170,${c.opacity * 0.5}) 40%, transparent 70%)`,
              filter: 'blur(30px)',
              animation: `steam-cloud-drift-${fromLeft ? 'right' : 'left'} ${c.dur}s linear infinite ${c.delay}s`,
              mixBlendMode: 'screen',
            }}
          />
        );
      })}
    </div>
  );
}

/* ─── Assemble Plugin Group ──────────────────────────────────────────── */

const ambientFog: Plugin = {
  id: "steampunk-ambient-fog",
  name: "Ambient Fog",
  component: AmbientFogPlugin as React.ComponentType<unknown>,
};

const steamParticles: Plugin = {
  id: "steampunk-steam-particles",
  name: "Steam Particle Field",
  component: SteamParticleFieldPlugin as React.ComponentType<unknown>,
};

const textureDecor: Plugin = {
  id: "steampunk-texture-decor",
  name: "3D Texture Decorations",
  component: TextureDecorationPlugin as React.ComponentType<unknown>,
};

const boilerGlow: Plugin = {
  id: "steampunk-boiler-glow",
  name: "Boiler Glow",
  component: BoilerGlowPlugin as React.ComponentType<unknown>,
};

const emberParticles: Plugin = {
  id: "steampunk-ember-particles",
  name: "Ember Particles",
  component: EmberParticlesPlugin as React.ComponentType<unknown>,
};

const heatShimmer: Plugin = {
  id: "steampunk-heat-shimmer",
  name: "Heat Shimmer",
  component: HeatShimmerPlugin as React.ComponentType<unknown>,
};

const gasLampAmbient: Plugin = {
  id: "steampunk-gas-lamp-ambient",
  name: "Gas Lamp Ambient",
  component: GasLampAmbientPlugin as React.ComponentType<unknown>,
};

const driftingSteamClouds: Plugin = {
  id: "steampunk-drifting-steam",
  name: "Drifting Steam Clouds",
  component: DriftingSteamCloudsPlugin as React.ComponentType<unknown>,
};

export const SteampunkThemePluginGroup: PluginGroup = {
  id: "steampunk-theme",
  name: "Steampunk Theme",
  plugins: [ambientFog, steamParticles, textureDecor, emberParticles, heatShimmer, driftingSteamClouds],
};
