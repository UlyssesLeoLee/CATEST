"use client";

import { cn } from "../lib/utils";
import React from "react";
import { useSound } from "./SoundSystem";
import { ChippedScrew, VaporRing } from "./SteampunkDecor";

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "elevated" | "glass";
  isGlass?: boolean;
  hoverable?: boolean;
}

export function Card({
  className,
  variant = "glass",
  isGlass = true,
  hoverable = true,
  onClick,
  children,
  ...props
}: CardProps) {
  const { play } = useSound();

  const effectiveIsGlass = isGlass || variant === "glass";

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (hoverable) play("impact");
    if (onClick) onClick(e);
  };

  return (
    <div
      className={cn(
        effectiveIsGlass
          ? "glass-card border border-[rgba(184,115,51,0.15)]"
          : "bg-card text-card-foreground",
        "relative overflow-visible flex flex-col min-w-0 min-h-0 transition-all duration-400 hover:scale-[1.005] group",
        className
      )}
      onClick={handleClick}
      {...props}
    >
      {/* Hover particle ring */}
      <VaporRing className="opacity-0 group-hover:opacity-100 transition-opacity duration-1000" />

      {/* 3D rivets at corners */}
      <ChippedScrew className="top-[6px] left-[6px]" />
      <ChippedScrew className="top-[6px] right-[6px]" />
      <ChippedScrew className="bottom-[6px] left-[6px]" />
      <ChippedScrew className="bottom-[6px] right-[6px]" />

      {/* Victorian corner filigree — subtle inner border accent */}
      <div className="absolute top-2 left-2 w-4 h-4 pointer-events-none z-10">
        <div className="absolute top-0 left-0 w-3 h-px bg-[#917b3c]/20" />
        <div className="absolute top-0 left-0 w-px h-3 bg-[#917b3c]/20" />
      </div>
      <div className="absolute bottom-2 right-2 w-4 h-4 pointer-events-none z-10">
        <div className="absolute bottom-0 right-0 w-3 h-px bg-[#917b3c]/20" />
        <div className="absolute bottom-0 right-0 w-px h-3 bg-[#917b3c]/20" />
      </div>

      <div className="relative z-20 p-4 flex flex-col flex-1 min-w-0 min-h-0">
        {children}
      </div>
    </div>
  );
}
