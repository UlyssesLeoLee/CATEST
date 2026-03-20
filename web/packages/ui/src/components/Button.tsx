import { cn } from "../lib/utils";
import React from "react";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
}

export function Button({ variant = "primary", size = "md", className, children, ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center rounded-xl font-bold transition-all duration-300 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c9a84c]/50 disabled:pointer-events-none disabled:opacity-50",
        variant === "primary" && "bg-gradient-to-r from-[#8b5a2b] via-[#b87333] to-[#8b5a2b] text-[#f5e6d0] border border-[#c9a84c]/40 shadow-[0_2px_8px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.1)] hover:from-[#b87333] hover:via-[#c9a84c] hover:to-[#b87333] hover:shadow-[0_4px_16px_rgba(184,115,51,0.3),0_0_30px_rgba(184,115,51,0.1)]",
        variant === "secondary" && "bg-[#1a1408]/80 text-[#e8d5b5] border border-[#b87333]/30 hover:bg-[#b87333]/15 hover:border-[#b87333]/50 hover:text-[#f5e6d0] shadow-[inset_0_1px_0_rgba(201,168,76,0.08)]",
        variant === "ghost" && "bg-transparent text-[#c4b49a] hover:bg-[#b87333]/10 hover:text-[#f5e6d0]",
        variant === "danger" && "bg-rose-600 text-white hover:bg-rose-500 shadow-lg shadow-rose-500/10 border border-rose-500/30",
        size === "sm" && "h-10 px-6 py-2 text-xs",
        size === "md" && "h-12 px-10 py-3 text-sm",
        size === "lg" && "h-14 px-12 py-4 text-base",
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}

