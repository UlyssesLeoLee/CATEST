import { cn } from "../lib/utils";
import React from "react";

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: "info" | "success" | "warning" | "danger";
}

export function Badge({ variant = "info", className, children, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-4 py-1 text-xs font-semibold whitespace-nowrap",
        variant === "info"    && "bg-blue-900/50 text-blue-300",
        variant === "success" && "bg-green-900/50 text-green-300",
        variant === "warning" && "bg-yellow-900/50 text-yellow-300",
        variant === "danger"  && "bg-red-900/50 text-red-300",
        className
      )}
      {...props}
    >
      {children}
    </span>
  );
}
