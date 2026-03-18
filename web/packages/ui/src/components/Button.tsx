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
        "inline-flex items-center justify-center rounded-xl font-semibold transition-all duration-200 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50 disabled:pointer-events-none disabled:opacity-50",
        variant === "primary" && "bg-indigo-600 text-white hover:bg-indigo-500 shadow-[0_1px_2px_rgba(0,0,0,0.1),0_0_15px_rgba(99,102,241,0.2)] hover:shadow-[0_1px_2px_rgba(0,0,0,0.1),0_0_20px_rgba(99,102,241,0.4)]",
        variant === "secondary" && "bg-zinc-800 text-zinc-200 border border-zinc-700 hover:bg-zinc-700 hover:border-zinc-600",
        variant === "ghost" && "bg-transparent text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-100",
        variant === "danger" && "bg-rose-600 text-white hover:bg-rose-500 shadow-lg shadow-rose-500/10",
        size === "sm" && "h-10 px-6 text-xs",
        size === "md" && "h-12 px-10 text-sm",
        size === "lg" && "h-14 px-12 text-base",
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}

