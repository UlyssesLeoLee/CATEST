import React from "react";
import { Search } from "lucide-react";
import { cn } from "../lib/utils";

interface SearchInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  containerClassName?: string;
}

export function SearchInput({ className, containerClassName, ...props }: SearchInputProps) {
  return (
    <div className={cn("relative group w-full", containerClassName)}>
      <div
        className={cn(
          "flex items-center w-full rounded-sm",
          "border-2 border-[#3e1b0d]/80",
        )}
        style={{
          background: `
            url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='h'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.15' numOctaves='2' stitchTiles='stitch'/%3E%3CfeDiffuseLighting lighting-color='white' surfaceScale='1'%3E%3CfeDistantLight azimuth='135' elevation='60'/%3E%3C/feDiffuseLighting%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23h)' fill='white' opacity='0.06'/%3E%3C/svg%3E"),
            url("data:image/svg+xml,%3Csvg viewBox='0 0 64 64' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.05'/%3E%3C/svg%3E"),
            linear-gradient(180deg, #150e06 0%, #0d0a04 50%, #1a1108 100%)`,
          boxShadow: `
            inset 0 3px 8px rgba(0,0,0,0.7),
            inset 0 -1px 0 rgba(255,240,200,0.04),
            0 1px 0 rgba(255,240,200,0.06),
            0 3px 8px rgba(0,0,0,0.5)`,
        }}
      >
        {/* Brass search icon — inline, takes up space */}
        <div className="flex-shrink-0 ml-3 w-5 h-5 rounded-full flex items-center justify-center border border-[#3e1b0d]"
          style={{
            background: 'radial-gradient(circle at 35% 30%, #e8c878, #c9a84c, #8b5a2b, #5a3518)',
            boxShadow: '0 2px 4px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,240,200,0.3), 0 0 6px rgba(201,168,76,0.15)',
          }}>
          <Search className="h-2.5 w-2.5 text-[#1a0f0a] group-focus-within:text-[#0d0805] transition-colors drop-shadow-sm" />
        </div>
        <input
          type="text"
          className={cn(
            "flex-1 min-w-0 bg-transparent pl-2.5 pr-4 py-2.5 text-sm text-[#e8d5b5] placeholder-[#b8a080]/50 focus:outline-none transition-all duration-300",
            className
          )}
          {...props}
        />
      </div>
      {/* Top edge inset shadow — recessed metal plate */}
      <div className="absolute inset-x-0 top-0 h-px pointer-events-none rounded-sm"
        style={{ background: 'rgba(0,0,0,0.6)' }} />
      {/* Bottom edge highlight — bevel */}
      <div className="absolute inset-x-0 bottom-0 h-px pointer-events-none rounded-sm"
        style={{ background: 'linear-gradient(90deg, transparent, rgba(255,240,200,0.08), transparent)' }} />
    </div>
  );
}
