"use client";

import { type MouseEvent, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { appBrandBadgeColorClass, appFeatures } from "@/features/workbench/app-features";

const FOUNTAIN_ICONS = ["⚕️", "🩺", "💊", "🏥", "🩹", "🧬", "💉", "🌡️"];
const FOUNTAIN_PARTICLES = 36;
const CLICKS_TO_TRIGGER = 3;
const CLICK_WINDOW_MS = 1500;
const GRAVITY = 1200;
const FADE_START_S = 3.2;
const FADE_DURATION_S = 0.9;
const PHYSICS_STEP_S = 1 / 120;

type FountainParticle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rotation: number;
  spin: number;
  size: number;
  icon: string;
};

function createParticles(originX: number, originY: number): FountainParticle[] {
  return Array.from({ length: FOUNTAIN_PARTICLES }, (_, index) => {
    const size = 18 + Math.random() * 12;
    return {
      x: originX - size / 2,
      y: originY - size / 2,
      vx: 120 + Math.random() * 900,
      vy: -(120 + Math.random() * 420),
      rotation: Math.random() * 360,
      spin: (Math.random() - 0.5) * 540,
      size,
      icon: FOUNTAIN_ICONS[index % FOUNTAIN_ICONS.length],
    };
  });
}

function EmojiFountain({ originX, originY, onDone }: { originX: number; originY: number; onDone: () => void }) {
  const [particles] = useState(() => createParticles(originX, originY));
  const nodes = useRef<Array<HTMLSpanElement | null>>([]);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      onDoneRef.current();
      return undefined;
    }

    const start = performance.now();
    let last = start;
    let frame = 0;

    const step = (dt: number) => {
      particles.forEach((particle) => {
        const floor = window.innerHeight - particle.size * 1.2;
        const rightEdge = window.innerWidth - particle.size * 1.2;
        particle.vy += GRAVITY * dt;
        particle.x += particle.vx * dt;
        particle.y += particle.vy * dt;
        particle.rotation += particle.spin * dt;

        if (particle.y >= floor) {
          particle.y = floor;
          particle.vy = Math.abs(particle.vy) < 90 ? 0 : -particle.vy * 0.35;
          particle.vx *= 0.75;
          particle.spin *= 0.6;
        }
        if (particle.y === floor && particle.vy === 0) {
          particle.vx *= Math.max(0, 1 - 4 * dt);
          particle.spin *= Math.max(0, 1 - 4 * dt);
        }
        if (particle.x < 0 || particle.x > rightEdge) {
          particle.x = Math.min(Math.max(particle.x, 0), rightEdge);
          particle.vx = -particle.vx * 0.5;
        }
      });
    };

    const tick = (now: number) => {
      for (let remaining = (now - last) / 1000; remaining > 0; remaining -= PHYSICS_STEP_S) {
        step(Math.min(remaining, PHYSICS_STEP_S));
      }
      last = now;
      const elapsed = (now - start) / 1000;
      const opacity = elapsed < FADE_START_S ? 1 : Math.max(0, 1 - (elapsed - FADE_START_S) / FADE_DURATION_S);

      particles.forEach((particle, index) => {
        const node = nodes.current[index];
        if (node) {
          node.style.transform = `translate3d(${particle.x}px, ${particle.y}px, 0) rotate(${particle.rotation}deg)`;
          node.style.opacity = String(opacity);
        }
      });

      if (opacity > 0) {
        frame = requestAnimationFrame(tick);
      } else {
        onDoneRef.current();
      }
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [particles]);

  return createPortal(
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-[200] overflow-hidden">
      {particles.map((particle, index) => (
        <span
          className="absolute left-0 top-0 select-none leading-none will-change-transform"
          key={index}
          ref={(node) => {
            nodes.current[index] = node;
          }}
          style={{
            fontSize: particle.size,
            filter: "drop-shadow(0 2px 3px rgb(0 0 0 / 0.25))",
            transform: `translate3d(${particle.x}px, ${particle.y}px, 0)`,
          }}
        >
          {particle.icon}
        </span>
      ))}
    </div>,
    document.body,
  );
}

export function BrandBadge({ className }: { className: string }) {
  const clickTimes = useRef<number[]>([]);
  const [burst, setBurst] = useState<{ id: number; x: number; y: number } | null>(null);

  function handleClick(event: MouseEvent<HTMLSpanElement>) {
    if (!appFeatures.evidenceLedger) {
      return;
    }
    const now = Date.now();
    clickTimes.current = [...clickTimes.current.filter((time) => now - time < CLICK_WINDOW_MS), now];
    if (clickTimes.current.length < CLICKS_TO_TRIGGER) {
      return;
    }
    clickTimes.current = [];
    const rect = event.currentTarget.getBoundingClientRect();
    setBurst({ id: now, x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
  }

  return (
    <>
      <span className={`${className} ${appBrandBadgeColorClass} select-none`} onClick={handleClick}>
        LCI
      </span>
      {burst ? <EmojiFountain key={burst.id} onDone={() => setBurst(null)} originX={burst.x} originY={burst.y} /> : null}
    </>
  );
}
