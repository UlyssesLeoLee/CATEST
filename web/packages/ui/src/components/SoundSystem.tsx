"use client";
import React, { createContext, useContext, useCallback, useRef, useState, useEffect } from "react";
import { getBoolCookie, setBoolCookie, COOKIE_KEYS } from "../lib/cookies";

type SoundType = "hammer" | "impact" | "steam" | "gear";

interface SoundContextType {
  play: (type: SoundType) => void;
  soundEnabled: boolean;
  setSoundEnabled: (v: boolean) => void;
}

const SoundContext = createContext<SoundContextType | undefined>(undefined);

/** Synthesize sounds using Web Audio API — no external files needed */
function synthesize(ctx: AudioContext, type: SoundType) {
  const now = ctx.currentTime;

  if (type === "hammer") {
    // Short metallic impact: noise burst + low thud + resonant ping
    const duration = 0.15;

    // Noise burst (anvil hit)
    const bufferSize = ctx.sampleRate * duration;
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.08));
    }
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuffer;

    // Bandpass filter for metallic tone
    const bpf = ctx.createBiquadFilter();
    bpf.type = "bandpass";
    bpf.frequency.value = 3200;
    bpf.Q.value = 2;

    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.35, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    noise.connect(bpf).connect(noiseGain).connect(ctx.destination);
    noise.start(now);
    noise.stop(now + duration);

    // Low thud
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(120, now);
    osc.frequency.exponentialRampToValueAtTime(40, now + 0.08);
    const oscGain = ctx.createGain();
    oscGain.gain.setValueAtTime(0.3, now);
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
    osc.connect(oscGain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.12);

    // Resonant ping
    const ping = ctx.createOscillator();
    ping.type = "sine";
    ping.frequency.value = 2800;
    const pingGain = ctx.createGain();
    pingGain.gain.setValueAtTime(0.08, now);
    pingGain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
    ping.connect(pingGain).connect(ctx.destination);
    ping.start(now);
    ping.stop(now + 0.15);
  }

  if (type === "impact") {
    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(200, now);
    osc.frequency.exponentialRampToValueAtTime(50, now + 0.1);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.25, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.15);
  }

  if (type === "steam") {
    const bufferSize = ctx.sampleRate * 0.3;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const d = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      d[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize) * 0.15;
    }
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const hpf = ctx.createBiquadFilter();
    hpf.type = "highpass";
    hpf.frequency.value = 4000;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
    src.connect(hpf).connect(gain).connect(ctx.destination);
    src.start(now);
    src.stop(now + 0.3);
  }

  if (type === "gear") {
    for (let i = 0; i < 3; i++) {
      const t = now + i * 0.04;
      const osc = ctx.createOscillator();
      osc.type = "square";
      osc.frequency.value = 800 + i * 200;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.06, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.03);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.04);
    }
  }
}

export function SoundProvider({ children }: { children: React.ReactNode }) {
  const ctxRef = useRef<AudioContext | null>(null);
  const [soundEnabled, setSoundEnabledRaw] = useState(true);

  // Hydrate from cookie on mount
  useEffect(() => {
    const stored = getBoolCookie(COOKIE_KEYS.SOUND_ENABLED, true);
    setSoundEnabledRaw(stored);
  }, []);

  const setSoundEnabled = useCallback((v: boolean) => {
    setSoundEnabledRaw(v);
    setBoolCookie(COOKIE_KEYS.SOUND_ENABLED, v, 30);
  }, []);

  const play = useCallback((type: SoundType) => {
    if (typeof window === "undefined") return;
    if (!soundEnabled) return;

    try {
      if (!ctxRef.current) {
        ctxRef.current = new AudioContext();
      }
      const ctx = ctxRef.current;
      if (ctx.state === "suspended") {
        ctx.resume();
      }
      synthesize(ctx, type);
    } catch {
      // Silently fail if Web Audio API not available
    }
  }, [soundEnabled]);

  return (
    <SoundContext.Provider value={{ play, soundEnabled, setSoundEnabled }}>
      {children}
    </SoundContext.Provider>
  );
}

export function useSound() {
  const context = useContext(SoundContext);
  if (!context) {
    return { play: () => {}, soundEnabled: true, setSoundEnabled: () => {} };
  }
  return context;
}
