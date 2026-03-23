import { cn } from "../lib/utils";
import React from "react";

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: "info" | "success" | "warning" | "danger";
}

export function Badge({ variant = "info", className, children, ...props }: BadgeProps) {
  const variantColors = {
    info:    { text: "text-[#c9a84c]", border: "border-[#c9a84c]/30", dotBg: "#c9a84c", glow: "rgba(201,168,76,0.5)" },
    success: { text: "text-[#4a8b6e]", border: "border-[#4a8b6e]/30", dotBg: "#4a8b6e", glow: "rgba(74,139,110,0.5)" },
    warning: { text: "text-[#e67e22]", border: "border-[#e67e22]/30", dotBg: "#e67e22", glow: "rgba(230,126,34,0.5)" },
    danger:  { text: "text-[#8b2252]", border: "border-[#6b1c23]/35", dotBg: "#8b2252", glow: "rgba(139,34,82,0.5)" },
  };
  const c = variantColors[variant];

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-sm px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider whitespace-nowrap border-2 relative overflow-hidden",
        c.text, c.border,
        className
      )}
      style={{
        background: `
          url("data:image/svg+xml,%3Csvg viewBox='0 0 128 128' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.7' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.08'/%3E%3C/svg%3E"),
          linear-gradient(135deg, #1a1108 0%, #0d0a04 40%, #150e06 100%)`,
        borderColor: undefined,
        boxShadow: `
          inset 0 1px 0 rgba(255,240,200,0.08),
          inset 0 -1px 2px rgba(0,0,0,0.5),
          0 2px 6px rgba(0,0,0,0.6),
          0 0 0 0.5px rgba(184,115,51,0.15)`,
      }}
      {...props}
    >
      {/* Forged metal grain overlay */}
      <span className="absolute inset-0 pointer-events-none opacity-[0.1]"
        style={{
          backgroundImage: "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='h'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.15' numOctaves='2' stitchTiles='stitch'/%3E%3CfeDiffuseLighting lighting-color='white' surfaceScale='1.5'%3E%3CfeDistantLight azimuth='135' elevation='55'/%3E%3C/feDiffuseLighting%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23h)' fill='white'/%3E%3C/svg%3E\")",
          mixBlendMode: 'overlay' as const,
        }} />
      {/* Top edge highlight — bevel */}
      <span className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/15 to-transparent pointer-events-none" />
      {/* Bottom edge shadow — bevel */}
      <span className="absolute inset-x-0 bottom-0 h-px bg-black/40 pointer-events-none" />
      {/* Indicator dot — gas lamp style */}
      <span className="w-1 h-1 rounded-full mr-1.5 shrink-0"
        style={{ background: c.dotBg, boxShadow: `0 0 5px ${c.glow}, 0 0 2px ${c.glow}` }} />
      <span className="relative z-10 drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">{children}</span>
    </span>
  );
}
