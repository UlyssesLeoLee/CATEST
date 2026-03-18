import React from "react";
import { cn } from "../lib/utils";

interface AvatarProps {
  src?: string;
  fallback: string;
  className?: string;
}

export function Avatar({ src, fallback, className }: AvatarProps) {
  return (
    <div className={cn("relative flex h-10 w-10 shrink-0 overflow-hidden rounded-full border border-zinc-800 bg-zinc-900", className)}>
      {src ? (
        <img src={src} className="aspect-square h-full w-full object-cover" alt={fallback} />
      ) : (
        <div className="flex h-full w-full items-center justify-center rounded-full bg-zinc-800 text-sm font-medium text-zinc-400">
          {fallback.substring(0, 2).toUpperCase()}
        </div>
      )}
    </div>
  );
}
