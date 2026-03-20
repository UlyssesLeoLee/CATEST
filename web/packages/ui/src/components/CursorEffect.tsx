"use client";
import { useEffect, useRef } from "react";

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  size: number;
  copper: boolean; // copper or brass
}

export function CursorEffect() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cursorRef = useRef<HTMLDivElement>(null);
  const outerRingRef = useRef<HTMLDivElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const rafRef = useRef<number | undefined>(undefined);
  const cursorPos = useRef({ x: -200, y: -200 });
  const outerPos = useRef({ x: -200, y: -200 });

  useEffect(() => {
    const canvas = canvasRef.current;
    const cursor = cursorRef.current;
    const outerRing = outerRingRef.current;
    if (!canvas || !cursor || !outerRing) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    const onMouseMove = (e: MouseEvent) => {
      cursorPos.current = { x: e.clientX, y: e.clientY };
      outerPos.current = { x: e.clientX, y: e.clientY };

      // Move both cursor elements instantly together
      cursor.style.left = `${e.clientX}px`;
      cursor.style.top = `${e.clientY}px`;
      outerRing.style.left = `${e.clientX}px`;
      outerRing.style.top = `${e.clientY}px`;

      // Spawn 2-3 smoke particles per move
      const count = Math.floor(Math.random() * 2) + 2;
      for (let i = 0; i < count; i++) {
        particlesRef.current.push({
          x: e.clientX + (Math.random() - 0.5) * 6,
          y: e.clientY + (Math.random() - 0.5) * 6,
          vx: (Math.random() - 0.5) * 1.2,
          vy: -(Math.random() * 1.8 + 0.5),
          life: 1.0,
          size: Math.random() * 3.5 + 1.5,
          copper: Math.random() > 0.4,
        });
      }
      if (particlesRef.current.length > 80) {
        particlesRef.current = particlesRef.current.slice(-80);
      }
    };

    // Outer ring lazily follows cursor (lerp)
    const animate = () => {
        // outer ring tracks with cursor (no lerp, it's part of the same cursor unit)

      // Draw particles
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      particlesRef.current = particlesRef.current.filter((p) => p.life > 0);

      for (const p of particlesRef.current) {
        p.x += p.vx;
        p.y += p.vy;
        p.vy *= 0.97; // slow down over time
        p.vx *= 0.97;
        p.vy -= 0.015; // upward drift (smoke rising)
        p.size *= 1.015; // expand like smoke
        p.life -= 0.035;

        const alpha = Math.max(0, p.life);
        // Copper: #b87333 | Brass: #c9a84c
        const r = p.copper ? 184 : 201;
        const g = p.copper ? 115 : 168;
        const b = p.copper ? 51 : 76;

        // Outer glow ring
        const grd = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 2.5);
        grd.addColorStop(0, `rgba(${r},${g},${b},${alpha * 0.5})`);
        grd.addColorStop(0.5, `rgba(${r},${g},${b},${alpha * 0.15})`);
        grd.addColorStop(1, `rgba(${r},${g},${b},0)`);
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * 2.5, 0, Math.PI * 2);
        ctx.fillStyle = grd;
        ctx.fill();

        // Core particle
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${r},${g},${b},${alpha * 0.75})`;
        ctx.fill();
      }

      rafRef.current = requestAnimationFrame(animate);
    };

    window.addEventListener("mousemove", onMouseMove);
    rafRef.current = requestAnimationFrame(animate);

    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("resize", resize);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return (
    <>
      {/* Particle canvas */}
      <canvas
        ref={canvasRef}
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          pointerEvents: "none",
          zIndex: 9997,
        }}
      />

      {/* Outer lagging ring */}
      <div
        ref={outerRingRef}
        style={{
          position: "fixed",
          left: -200,
          top: -200,
          width: 36,
          height: 36,
          transform: "translate(-50%, -50%)",
          pointerEvents: "none",
          zIndex: 9998,
          border: "1px solid rgba(184, 115, 51, 0.5)",
          borderRadius: "50%",
          boxShadow: "0 0 10px rgba(184, 115, 51, 0.2)",
        }}
      />

      {/* Inner precision cursor */}
      <div
        ref={cursorRef}
        style={{
          position: "fixed",
          left: -200,
          top: -200,
          width: 16,
          height: 16,
          transform: "translate(-50%, -50%)",
          pointerEvents: "none",
          zIndex: 9999,
        }}
      >
        {/* Ring */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            border: "1.5px solid rgba(201, 168, 76, 0.95)",
            borderRadius: "50%",
            boxShadow: "0 0 6px rgba(201, 168, 76, 0.6), inset 0 0 3px rgba(201, 168, 76, 0.2)",
          }}
        />
        {/* Center dot */}
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            width: 3,
            height: 3,
            background: "#f5e6d0",
            borderRadius: "50%",
            boxShadow: "0 0 5px rgba(245, 230, 208, 1)",
          }}
        />
        {/* Crosshair lines */}
        <div style={{ position: "absolute", top: "50%", left: -9, width: 7, height: 1, background: "rgba(201,168,76,0.7)", transform: "translateY(-50%)" }} />
        <div style={{ position: "absolute", top: "50%", right: -9, width: 7, height: 1, background: "rgba(201,168,76,0.7)", transform: "translateY(-50%)" }} />
        <div style={{ position: "absolute", left: "50%", top: -9, width: 1, height: 7, background: "rgba(201,168,76,0.7)", transform: "translateX(-50%)" }} />
        <div style={{ position: "absolute", left: "50%", bottom: -9, width: 1, height: 7, background: "rgba(201,168,76,0.7)", transform: "translateX(-50%)" }} />
      </div>
    </>
  );
}
