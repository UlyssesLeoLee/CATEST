"use client";
import { useEffect, useRef } from "react";

interface SmokeParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  rotation: number;
  rotSpeed: number;
}

interface SparkParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  brightness: number; // 0-1
}

export function CursorEffect() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cursorRef = useRef<HTMLDivElement>(null);
  const outerRingRef = useRef<HTMLDivElement>(null);
  const smokeRef = useRef<SmokeParticle[]>([]);
  const sparksRef = useRef<SparkParticle[]>([]);
  const rafRef = useRef<number | undefined>(undefined);
  const cursorPos = useRef({ x: -200, y: -200 });
  const prevPos = useRef({ x: -200, y: -200 });
  const isHoveringRef = useRef(false);

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
      prevPos.current = { ...cursorPos.current };
      cursorPos.current = { x: e.clientX, y: e.clientY };

      cursor.style.left = `${e.clientX}px`;
      cursor.style.top = `${e.clientY}px`;
      outerRing.style.left = `${e.clientX}px`;
      outerRing.style.top = `${e.clientY}px`;

      const target = e.target as HTMLElement;
      const isInteractive = !!target.closest('button, a, select, input, .glass-card, [role="button"]');
      isHoveringRef.current = isInteractive;

      // Calculate movement speed
      const dx = e.clientX - prevPos.current.x;
      const dy = e.clientY - prevPos.current.y;
      const speed = Math.sqrt(dx * dx + dy * dy);

      // Smoke particles — dense, tiny, fog-like for interactive; wispy trail otherwise
      const smokeCount = isInteractive
        ? Math.floor(Math.random() * 8) + 14  // dense cluster
        : Math.max(1, Math.floor(speed * 0.3));

      for (let i = 0; i < smokeCount; i++) {
        const spread = isInteractive ? 18 : 4;
        const maxLife = isInteractive ? 1.4 : 0.6;
        // Gaussian-ish distribution for natural fog clustering
        const gx = (Math.random() + Math.random() + Math.random()) / 3 - 0.5;
        const gy = (Math.random() + Math.random() + Math.random()) / 3 - 0.5;
        smokeRef.current.push({
          x: e.clientX + gx * spread,
          y: e.clientY + gy * spread,
          vx: (Math.random() - 0.5) * (isInteractive ? 0.8 : 0.6) + dx * 0.015,
          vy: -(Math.random() * (isInteractive ? 0.9 : 1.0) + 0.1),
          life: maxLife,
          maxLife,
          size: isInteractive
            ? Math.random() * 1.2 + 0.3  // tiny: 0.3 - 1.5 (dense fog particles)
            : Math.random() * 2.0 + 0.8,
          rotation: Math.random() * Math.PI * 2,
          rotSpeed: (Math.random() - 0.5) * 0.08,
        });
      }

      // Spark particles — tiny bright hot embers
      const sparkCount = isInteractive
        ? Math.floor(Math.random() * 4) + 3
        : (speed > 3 ? Math.floor(Math.random() * 2) : 0);

      for (let i = 0; i < sparkCount; i++) {
        const angle = Math.random() * Math.PI * 2;
        const vel = Math.random() * (isInteractive ? 4 : 2) + 1;
        sparksRef.current.push({
          x: e.clientX + (Math.random() - 0.5) * 6,
          y: e.clientY + (Math.random() - 0.5) * 6,
          vx: Math.cos(angle) * vel + dx * 0.05,
          vy: Math.sin(angle) * vel - Math.random() * 1.5,
          life: 0.6 + Math.random() * 0.4,
          maxLife: 0.6 + Math.random() * 0.4,
          size: Math.random() * 1.5 + 0.5,
          brightness: 0.7 + Math.random() * 0.3,
        });
      }

      // Cap particles
      if (smokeRef.current.length > 300) smokeRef.current = smokeRef.current.slice(-300);
      if (sparksRef.current.length > 150) sparksRef.current = sparksRef.current.slice(-150);
    };

    let lastTime = performance.now();

    const animate = (now: number) => {
      const dt = Math.min((now - lastTime) / 16.67, 3); // normalize to ~60fps
      lastTime = now;

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // ── Draw smoke particles ──
      smokeRef.current = smokeRef.current.filter((p) => p.life > 0);

      // Use additive-style blending for fog cohesion
      ctx.globalCompositeOperation = "screen";

      for (const p of smokeRef.current) {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vx *= 0.96;
        p.vy *= 0.96;
        p.vy -= 0.012 * dt; // gentle upward drift
        p.size += 0.08 * dt; // expand into wispy fog
        p.life -= 0.035 * dt;
        p.rotation += p.rotSpeed * dt;

        const t = 1 - (p.life / p.maxLife); // 0 → 1 progress
        // Smoke opacity: soft fade in, long fade out — never too bright
        const peakAlpha = 0.18;
        const alpha = p.life < 0.15
          ? p.life / 0.15 * peakAlpha
          : t < 0.1
            ? (t / 0.1) * peakAlpha
            : peakAlpha * (1 - (t - 0.1) / 0.9);

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);

        // Very soft fog blob — wide gradient, warm-tinted steam
        const outerR = p.size * 3.5;
        const grd = ctx.createRadialGradient(0, 0, 0, 0, 0, outerR);
        grd.addColorStop(0, `rgba(210,200,185,${alpha * 0.7})`);
        grd.addColorStop(0.2, `rgba(195,185,170,${alpha * 0.5})`);
        grd.addColorStop(0.5, `rgba(175,165,150,${alpha * 0.25})`);
        grd.addColorStop(0.8, `rgba(160,150,135,${alpha * 0.08})`);
        grd.addColorStop(1, `rgba(150,140,125,0)`);

        ctx.beginPath();
        // Irregular ellipse — varying aspect ratio per particle
        const aspect = 0.55 + (p.rotation % 1) * 0.4; // 0.55 - 0.95
        ctx.ellipse(0, 0, outerR, outerR * aspect, 0, 0, Math.PI * 2);
        ctx.fillStyle = grd;
        ctx.fill();

        ctx.restore();
      }

      // Reset compositing for sparks
      ctx.globalCompositeOperation = "source-over";

      // ── Draw spark particles ──
      sparksRef.current = sparksRef.current.filter((p) => p.life > 0);

      for (const p of sparksRef.current) {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += 0.08 * dt; // gravity pulls sparks down
        p.vx *= 0.98;
        p.life -= 0.035 * dt;

        const alpha = Math.min(1, p.life / (p.maxLife * 0.3)) * p.brightness;

        // Hot core — white/yellow center
        const coreR = p.size * 0.6;
        ctx.beginPath();
        ctx.arc(p.x, p.y, coreR, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,245,220,${alpha})`;
        ctx.fill();

        // Warm glow halo — orange/copper
        const glowR = p.size * 2.0;
        const sparkGrd = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, glowR);
        sparkGrd.addColorStop(0, `rgba(255,183,77,${alpha * 0.6})`);
        sparkGrd.addColorStop(0.4, `rgba(230,126,34,${alpha * 0.3})`);
        sparkGrd.addColorStop(1, `rgba(184,115,51,0)`);
        ctx.beginPath();
        ctx.arc(p.x, p.y, glowR, 0, Math.PI * 2);
        ctx.fillStyle = sparkGrd;
        ctx.fill();

        // Spark trail — short line in direction of motion
        const trailLen = Math.sqrt(p.vx * p.vx + p.vy * p.vy) * 1.5;
        if (trailLen > 0.5) {
          const nx = -p.vx / trailLen;
          const ny = -p.vy / trailLen;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x + nx * trailLen * 2, p.y + ny * trailLen * 2);
          ctx.strokeStyle = `rgba(255,200,100,${alpha * 0.4})`;
          ctx.lineWidth = p.size * 0.4;
          ctx.stroke();
        }
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
