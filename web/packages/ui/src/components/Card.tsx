import { cn } from "../lib/utils";
import React from "react";

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "elevated" | "glass";
  hoverable?: boolean;
}

export function Card({ variant = "default", hoverable = false, className, children, ...props }: CardProps) {
  return (
    <div
      className={cn(
        "rounded-2xl transition-all duration-300",
        variant === "default" && "border border-zinc-900 bg-zinc-900/30",
        variant === "elevated" && "border border-zinc-800 bg-zinc-900/50 shadow-xl shadow-black/40",
        variant === "glass" && "border border-white/5 bg-white/[0.02] backdrop-blur-md",
        hoverable && "hover:border-zinc-700 hover:bg-zinc-800/40 hover:translate-y-[-2px] cursor-pointer",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

