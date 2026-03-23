"use client";

import React, { useEffect, useRef, useState } from "react";

/**
 * ScrollValve — A brass valve wheel decoration that sits at the top-right
 * of the scroll area and rotates as the user scrolls.
 * The native styled scrollbar handles actual scrolling.
 */
export function ScrollValve({ scrollContainerRef }: { scrollContainerRef: React.RefObject<HTMLElement | null> }) {
  const [rotation, setRotation] = useState(0);
  const [visible, setVisible] = useState(false);
  const lastScrollTop = useRef(0);
  const id = React.useId().replace(/:/g, '');

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const update = () => {
      const { scrollTop, scrollHeight, clientHeight } = container;
      if (scrollHeight <= clientHeight) {
        setVisible(false);
        return;
      }
      setVisible(true);

      // Rotate based on scroll delta
      const delta = scrollTop - lastScrollTop.current;
      lastScrollTop.current = scrollTop;
      setRotation(prev => prev + delta * 0.8);
    };

    container.addEventListener('scroll', update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(container);
    update();

    return () => {
      container.removeEventListener('scroll', update);
      observer.disconnect();
    };
  }, [scrollContainerRef]);

  if (!visible) return null;

  return (
    <div className="sticky top-1 float-right z-50 pointer-events-none hidden md:flex items-center justify-center mr-0"
      style={{ width: 24, height: 24, marginBottom: -24 }}>
      <div style={{ transform: `rotate(${rotation}deg)`, transition: 'transform 0.05s linear' }}>
        <svg viewBox="0 0 40 40" width={24} height={24} xmlns="http://www.w3.org/2000/svg">
          <defs>
            <radialGradient id={`sv-${id}`} cx="35%" cy="30%" r="65%">
              <stop offset="0%" stopColor="#d4956a" />
              <stop offset="50%" stopColor="#b87333" />
              <stop offset="100%" stopColor="#5a3518" />
            </radialGradient>
            <filter id={`svn-${id}`}>
              <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="3" stitchTiles="stitch" result="n" />
              <feColorMatrix type="saturate" values="0" in="n" result="gn" />
              <feBlend in="SourceGraphic" in2="gn" mode="overlay" result="t" />
              <feComposite in="t" in2="SourceGraphic" operator="in" />
            </filter>
          </defs>
          {/* Outer ring — heavy forged rim */}
          <circle cx="20" cy="20" r="17" fill="none" stroke={`url(#sv-${id})`} strokeWidth="4" filter={`url(#svn-${id})`} />
          <circle cx="20" cy="20" r="17" fill="none" stroke="rgba(255,240,200,0.1)" strokeWidth="0.5" />
          <circle cx="20" cy="20" r="15" fill="none" stroke="rgba(0,0,0,0.3)" strokeWidth="0.3" />
          {/* 5 spokes */}
          {[0, 1, 2, 3, 4].map(i => {
            const a = (i / 5) * Math.PI * 2;
            return <g key={i}>
              <line
                x1={20 + 6 * Math.cos(a)} y1={20 + 6 * Math.sin(a)}
                x2={20 + 14 * Math.cos(a)} y2={20 + 14 * Math.sin(a)}
                stroke="#5a3518" strokeWidth="3" strokeLinecap="round" />
              <line
                x1={20 + 6 * Math.cos(a)} y1={20 + 6 * Math.sin(a)}
                x2={20 + 14 * Math.cos(a)} y2={20 + 14 * Math.sin(a)}
                stroke="rgba(212,149,106,0.5)" strokeWidth="1.5" strokeLinecap="round" />
            </g>;
          })}
          {/* Hub */}
          <circle cx="20" cy="20" r="6" fill="#1a0f0a" stroke="#3e1b0d" strokeWidth="1.2" />
          <circle cx="20" cy="20" r="3.5" fill={`url(#sv-${id})`} stroke="#2a1608" strokeWidth="0.6" />
          {/* Cross bolt */}
          <line x1="18" y1="20" x2="22" y2="20" stroke="#0d0805" strokeWidth="0.8" strokeLinecap="round" />
          <line x1="20" y1="18" x2="20" y2="22" stroke="#0d0805" strokeWidth="0.8" strokeLinecap="round" />
          {/* Verdigris patina */}
          <circle cx="26" cy="12" r="2.5" fill="rgba(74,139,110,0.12)" />
          <circle cx="10" cy="25" r="1.5" fill="rgba(74,139,110,0.08)" />
        </svg>
      </div>
    </div>
  );
}
