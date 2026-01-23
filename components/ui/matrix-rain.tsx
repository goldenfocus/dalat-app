"use client";

import { useEffect, useRef } from "react";

const MATRIX_CHARS = "アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン0123456789@#$%&*<>[]{}";

interface MatrixRainProps {
  className?: string;
  opacity?: number;
  speed?: number; // 1-10, default 5
  density?: number; // columns, default 20
}

export function MatrixRain({
  className = "",
  opacity = 0.4,
  speed = 5,
  density = 20,
}: MatrixRainProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Set canvas size to parent
    const resizeCanvas = () => {
      const parent = canvas.parentElement;
      if (parent) {
        canvas.width = parent.clientWidth;
        canvas.height = parent.clientHeight;
      }
    };
    resizeCanvas();

    // Listen for resize
    const resizeObserver = new ResizeObserver(resizeCanvas);
    resizeObserver.observe(canvas.parentElement!);

    const fontSize = 14;
    const columns = Math.min(density, Math.floor(canvas.width / fontSize));
    const drops: number[] = Array(columns).fill(1);

    // Randomize initial positions
    for (let i = 0; i < drops.length; i++) {
      drops[i] = Math.random() * -50;
    }

    const draw = () => {
      // Fade effect - creates trail
      ctx.fillStyle = `rgba(0, 0, 0, 0.05)`;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Green text
      ctx.fillStyle = "#00ff41";
      ctx.font = `${fontSize}px monospace`;

      for (let i = 0; i < drops.length; i++) {
        // Random character
        const char = MATRIX_CHARS[Math.floor(Math.random() * MATRIX_CHARS.length)];

        // Calculate x position (spread across width)
        const x = (i / columns) * canvas.width + fontSize / 2;
        const y = drops[i] * fontSize;

        // Varying brightness for depth effect
        const brightness = Math.random() > 0.9 ? 1 : 0.5 + Math.random() * 0.3;
        ctx.fillStyle = `rgba(0, 255, 65, ${brightness})`;

        ctx.fillText(char, x, y);

        // Reset drop when it goes off screen (with randomness)
        if (y > canvas.height && Math.random() > 0.975) {
          drops[i] = 0;
        }

        // Move drop down
        drops[i] += 0.5 + (speed / 10);
      }
    };

    // Animation loop
    const interval = setInterval(draw, 50);

    return () => {
      clearInterval(interval);
      resizeObserver.disconnect();
    };
  }, [density, speed]);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{ opacity }}
    />
  );
}
