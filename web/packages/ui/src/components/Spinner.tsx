"use client";

import React from "react";
import { cn } from "../lib/utils";

export function Spinner({ className, size = 20 }: { className?: string; size?: number }) {
  const id = React.useId().replace(/:/g, '');
  const teeth = 8;
  const cx = 50, cy = 50;
  const outerR = 42, innerR = 34;

  // Generate mini gear teeth
  const pts: string[] = [];
  for (let i = 0; i < teeth; i++) {
    const a0 = (i / teeth) * Math.PI * 2;
    const a1 = ((i + 0.4) / teeth) * Math.PI * 2;
    const a2 = ((i + 0.5) / teeth) * Math.PI * 2;
    const a3 = ((i + 0.9) / teeth) * Math.PI * 2;
    pts.push(`${cx + outerR * Math.cos(a0)},${cy + outerR * Math.sin(a0)}`);
    pts.push(`${cx + outerR * Math.cos(a1)},${cy + outerR * Math.sin(a1)}`);
    pts.push(`${cx + innerR * Math.cos(a2)},${cy + innerR * Math.sin(a2)}`);
    pts.push(`${cx + innerR * Math.cos(a3)},${cy + innerR * Math.sin(a3)}`);
  }

  return (
    <div
      className={cn("inline-flex items-center justify-center", className)}
      style={{ width: size, height: size, animation: 'spin 2s linear infinite' }}
      role="status"
    >
      <svg viewBox="0 0 100 100" width={size} height={size} xmlns="http://www.w3.org/2000/svg">
        <defs>
          <radialGradient id={`sg-${id}`} cx="35%" cy="30%" r="65%">
            <stop offset="0%" stopColor="#e8c878" />
            <stop offset="50%" stopColor="#b87333" />
            <stop offset="100%" stopColor="#5a3518" />
          </radialGradient>
        </defs>
        <polygon points={pts.join(' ')} fill={`url(#sg-${id})`} stroke="#4a2c11" strokeWidth="1" />
        <circle cx={cx} cy={cy} r="14" fill="#1a0f0a" stroke="#3e1b0d" strokeWidth="1.5" />
        <circle cx={cx} cy={cy} r="6" fill={`url(#sg-${id})`} stroke="#2a1608" strokeWidth="0.8" />
        <line x1={cx - 3} y1={cy} x2={cx + 3} y2={cy} stroke="#0d0805" strokeWidth="1" strokeLinecap="round" />
      </svg>
      <span className="sr-only">Loading...</span>
    </div>
  );
}
