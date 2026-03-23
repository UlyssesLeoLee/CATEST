import React from "react";
import { cn } from "../lib/utils";

interface AvatarProps {
  src?: string;
  fallback: string;
  className?: string;
}

export function Avatar({ src, fallback, className }: AvatarProps) {
  return (
    <div className={cn(
      "relative flex h-10 w-10 shrink-0 overflow-hidden rounded-full",
      "border-2 border-[#3e1b0d] shadow-[0_4px_10px_rgba(0,0,0,0.7),inset_0_1px_0_rgba(255,240,200,0.15)]",
      className
    )}
    style={{
      background: 'radial-gradient(circle at 30% 30%, #2a1a11 0%, #0d0805 100%)',
    }}>
      {/* Brass rim highlight */}
      <div className="absolute inset-0 rounded-full pointer-events-none z-10"
        style={{
          boxShadow: 'inset 0 2px 4px rgba(255,240,200,0.1), inset 0 -2px 4px rgba(0,0,0,0.4)',
          border: '1px solid rgba(184,115,51,0.3)',
        }} />
      {src ? (
        <img src={src} className="aspect-square h-full w-full object-cover" alt={fallback} />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-sm font-black text-[#c9a84c] uppercase tracking-wider"
          style={{
            background: 'radial-gradient(circle at 35% 35%, #1a1108 0%, #0d0805 100%)',
            textShadow: '0 0 6px rgba(201,168,76,0.3)',
          }}>
          {fallback.substring(0, 2).toUpperCase()}
        </div>
      )}
      {/* Rivets — tiny brass dots at compass points */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-gradient-to-br from-[#d4b854] to-[#5a3518] z-20" />
      <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-gradient-to-br from-[#d4b854] to-[#5a3518] z-20" />
    </div>
  );
}
