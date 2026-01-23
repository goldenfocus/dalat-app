"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface DisintegrationEffectProps {
  imageUrl: string;
  isActive: boolean;
  onComplete: () => void;
  className?: string;
}

interface Particle {
  x: number;
  y: number;
  originX: number;
  originY: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  alpha: number;
  delay: number; // Delay before particle starts moving (for wave effect)
}

const PARTICLE_SIZE = 6;
const ANIMATION_DURATION = 1500;
const TREMOR_DURATION = 200;

export function DisintegrationEffect({
  imageUrl,
  isActive,
  onComplete,
  className,
}: DisintegrationEffectProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const animationRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);
  const particlesRef = useRef<Particle[]>([]);
  const [phase, setPhase] = useState<"idle" | "tremor" | "disintegrate">("idle");

  // Initialize particles from image
  useEffect(() => {
    if (!isActive || !containerRef.current) return;

    const container = containerRef.current;
    const rect = container.getBoundingClientRect();
    setDimensions({ width: rect.width, height: rect.height });

    // Helper to create fallback particles (when CORS prevents pixel reading)
    const createFallbackParticles = (width: number, height: number): Particle[] => {
      const particles: Particle[] = [];
      // Use gradient colors as fallback
      const colors = [
        "rgba(100, 100, 120, 1)",
        "rgba(80, 80, 100, 1)",
        "rgba(120, 120, 140, 1)",
        "rgba(90, 90, 110, 1)",
      ];

      for (let y = 0; y < height; y += PARTICLE_SIZE) {
        for (let x = 0; x < width; x += PARTICLE_SIZE) {
          const normalizedX = x / width;
          const delay = (1 - normalizedX) * 800;

          particles.push({
            x,
            y,
            originX: x,
            originY: y,
            vx: (Math.random() - 0.3) * 3,
            vy: (Math.random() - 0.7) * 4,
            size: PARTICLE_SIZE + Math.random() * 2,
            color: colors[Math.floor(Math.random() * colors.length)],
            alpha: 1,
            delay,
          });
        }
      }
      return particles;
    };

    // Start the animation with particles
    const startAnimation = (particles: Particle[]) => {
      particlesRef.current = particles;
      setPhase("tremor");
      startTimeRef.current = performance.now();

      setTimeout(() => {
        setPhase("disintegrate");
        startTimeRef.current = performance.now();
      }, TREMOR_DURATION);
    };

    // Load image and create particles
    const img = new Image();
    img.crossOrigin = "anonymous";

    img.onerror = () => {
      // Image failed to load - use fallback particles
      startAnimation(createFallbackParticles(rect.width, rect.height));
    };

    img.onload = () => {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        startAnimation(createFallbackParticles(rect.width, rect.height));
        return;
      }

      canvas.width = rect.width;
      canvas.height = rect.height;

      // Draw image to canvas (cover fit)
      const imgAspect = img.width / img.height;
      const canvasAspect = rect.width / rect.height;
      let drawWidth, drawHeight, drawX, drawY;

      if (imgAspect > canvasAspect) {
        drawHeight = rect.height;
        drawWidth = drawHeight * imgAspect;
        drawX = (rect.width - drawWidth) / 2;
        drawY = 0;
      } else {
        drawWidth = rect.width;
        drawHeight = drawWidth / imgAspect;
        drawX = 0;
        drawY = (rect.height - drawHeight) / 2;
      }

      ctx.drawImage(img, drawX, drawY, drawWidth, drawHeight);

      // Try to sample pixels - may fail due to CORS
      let particles: Particle[];
      try {
        const imageData = ctx.getImageData(0, 0, rect.width, rect.height);
        particles = [];

        for (let y = 0; y < rect.height; y += PARTICLE_SIZE) {
          for (let x = 0; x < rect.width; x += PARTICLE_SIZE) {
            const i = (y * rect.width + x) * 4;
            const r = imageData.data[i];
            const g = imageData.data[i + 1];
            const b = imageData.data[i + 2];
            const a = imageData.data[i + 3];

            if (a < 10) continue; // Skip transparent pixels

            // Calculate delay based on position (right-to-left wave)
            const normalizedX = x / rect.width;
            const delay = (1 - normalizedX) * 800; // Right side starts first

            particles.push({
              x: x,
              y: y,
              originX: x,
              originY: y,
              vx: (Math.random() - 0.3) * 3, // Slight rightward bias
              vy: (Math.random() - 0.7) * 4, // Upward bias
              size: PARTICLE_SIZE + Math.random() * 2,
              color: `rgba(${r}, ${g}, ${b}, ${a / 255})`,
              alpha: 1,
              delay: delay,
            });
          }
        }
      } catch {
        // CORS error - use fallback particles
        particles = createFallbackParticles(rect.width, rect.height);
      }

      startAnimation(particles);
    };

    img.src = imageUrl;

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [isActive, imageUrl]);

  // Animation loop
  useEffect(() => {
    if (phase === "idle" || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const animate = () => {
      const elapsed = performance.now() - startTimeRef.current;

      ctx.clearRect(0, 0, dimensions.width, dimensions.height);

      if (phase === "tremor") {
        // Draw particles with slight tremor
        const tremor = Math.sin(elapsed * 0.1) * 2;
        particlesRef.current.forEach((p) => {
          ctx.fillStyle = p.color;
          ctx.fillRect(
            p.originX + tremor * (Math.random() - 0.5),
            p.originY + tremor * (Math.random() - 0.5),
            p.size,
            p.size
          );
        });
      } else if (phase === "disintegrate") {
        let allDone = true;

        particlesRef.current.forEach((p) => {
          const particleElapsed = elapsed - p.delay;

          if (particleElapsed < 0) {
            // Particle hasn't started moving yet
            ctx.fillStyle = p.color;
            ctx.fillRect(p.originX, p.originY, p.size, p.size);
            allDone = false;
          } else if (p.alpha > 0) {
            // Update particle position
            p.x += p.vx;
            p.y += p.vy;
            p.vy -= 0.05; // Slight upward acceleration

            // Fade out based on distance traveled
            const distance = Math.sqrt(
              Math.pow(p.x - p.originX, 2) + Math.pow(p.y - p.originY, 2)
            );
            p.alpha = Math.max(0, 1 - distance / 150);

            if (p.alpha > 0) {
              ctx.globalAlpha = p.alpha;
              ctx.fillStyle = p.color;
              ctx.fillRect(p.x, p.y, p.size * p.alpha, p.size * p.alpha);
              ctx.globalAlpha = 1;
              allDone = false;
            }
          }
        });

        if (allDone || elapsed > ANIMATION_DURATION) {
          onComplete();
          return;
        }
      }

      animationRef.current = requestAnimationFrame(animate);
    };

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [phase, dimensions, onComplete]);

  if (!isActive) return null;

  return (
    <div
      ref={containerRef}
      className={cn("absolute inset-0 overflow-hidden", className)}
    >
      <canvas
        ref={canvasRef}
        width={dimensions.width}
        height={dimensions.height}
        className="w-full h-full"
      />
    </div>
  );
}
