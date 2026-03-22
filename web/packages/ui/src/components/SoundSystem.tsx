"use client";
import React, { createContext, useContext, useCallback, useRef } from "react";

type SoundType = "hammer" | "impact" | "steam" | "gear";

interface SoundContextType {
  play: (type: SoundType) => void;
}

const SoundContext = createContext<SoundContextType | undefined>(undefined);

export function SoundProvider({ children }: { children: React.ReactNode }) {
  const audioRefs = useRef<{ [key in SoundType]?: HTMLAudioElement }>({});

  const play = useCallback((type: SoundType) => {
    if (typeof window === "undefined") return;

    // Lazy load audio elements
    if (!audioRefs.current[type]) {
      const audio = new Audio(`/sounds/${type}.mp3`);
      audio.volume = 0.4; // Default volume
      audioRefs.current[type] = audio;
    }

    const audio = audioRefs.current[type];
    if (audio) {
      audio.currentTime = 0;
      audio.play().catch(() => {
        // Silently fail if user hasn't interacted with page yet or file is missing
        console.warn(`Sound Protocol: Could not find or play /sounds/${type}.mp3`);
      });
    }
  }, []);

  return (
    <SoundContext.Provider value={{ play }}>
      {children}
    </SoundContext.Provider>
  );
}

export function useSound() {
  const context = useContext(SoundContext);
  if (!context) {
    // Return a no-op if used outside provider
    return { play: () => {} };
  }
  return context;
}
