"use client";

import { useEffect, useRef } from "react";

const VERTEX = "attribute vec2 a;void main(){gl_Position=vec4(a,0.,1.);}";

// Domain-warped value noise, denser low in the frame, with a
// soft clearing around the pointer. Output is premultiplied alpha.
const FRAGMENT = `precision mediump float;uniform vec2 r,m;uniform float t,k;
float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h(i),h(i+vec2(1.,0.)),f.x),mix(h(i+vec2(0.,1.)),h(i+vec2(1.,1.)),f.x),f.y);}
float fbm(vec2 p){float v=0.,a=.5;for(int i=0;i<5;i++){v+=a*n(p);p=p*2.03+vec2(17.,9.);a*=.5;}return v;}
void main(){vec2 uv=gl_FragCoord.xy/r,asp=vec2(r.x/r.y,1.),p=uv*asp*2.1;
float q=fbm(p+vec2(t*.03,t*.011));float f=fbm(p*1.25+vec2(q*1.7-t*.045,q+t*.018));
float band=.35+.65*smoothstep(1.,.2,uv.y);
float lift=mix(1.,smoothstep(.02,.36,length((uv-m)*asp)),k);
float a=smoothstep(.36,.82,f)*band*lift*.6;
gl_FragColor=vec4(vec3(.93,.96,.95)*a,a);}`;

// A still frame for reduced motion: fog that is present but not moving.
const STILL_TIME = 14;

function createProgram(gl: WebGLRenderingContext): WebGLProgram | null {
  const program = gl.createProgram();
  for (const [type, source] of [
    [gl.VERTEX_SHADER, VERTEX],
    [gl.FRAGMENT_SHADER, FRAGMENT],
  ] as const) {
    const shader = gl.createShader(type);
    if (!shader) return null;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    gl.attachShader(program, shader);
  }
  gl.linkProgram(program);
  return gl.getProgramParameter(program, gl.LINK_STATUS) ? program : null;
}

/**
 * Drifting fog over the featured photo. Decorative only.
 *
 * Budget: starts when the browser is idle (never competes with LCP), draws at
 * half resolution, stops while off screen or in a background tab, holds one
 * still frame under reduced motion, and stays off on Save-Data.
 */
export function FogCanvas() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const host = canvas?.parentElement;
    if (!canvas || !host) return;
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean } })
      .connection;
    if (connection?.saveData) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const pointer = { x: 0.5, y: 0.5, targetX: 0.5, targetY: 0.5, lift: 0, targetLift: 0 };
    let frame = 0;
    let visible = true;
    let stop = () => {};

    const start = () => {
      const gl = canvas.getContext("webgl", {
        antialias: false,
        powerPreference: "low-power",
      });
      const program = gl && createProgram(gl);
      if (!gl || !program) return;
      gl.useProgram(program);
      gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      const position = gl.getAttribLocation(program, "a");
      gl.enableVertexAttribArray(position);
      gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
      const uniform = (name: string) => gl.getUniformLocation(program, name);
      const [uSize, uTime, uPointer, uLift] = ["r", "t", "m", "k"].map(uniform);

      const draw = (now: number) => {
        frame = 0;
        if (!visible || document.hidden) return;
        const width = Math.max(2, canvas.clientWidth >> 1);
        const height = Math.max(2, canvas.clientHeight >> 1);
        if (canvas.width !== width || canvas.height !== height) {
          canvas.width = width;
          canvas.height = height;
          gl.viewport(0, 0, width, height);
        }
        pointer.x += (pointer.targetX - pointer.x) * 0.08;
        pointer.y += (pointer.targetY - pointer.y) * 0.08;
        pointer.lift += (pointer.targetLift - pointer.lift) * 0.06;
        gl.uniform2f(uSize, width, height);
        gl.uniform1f(uTime, reducedMotion.matches ? STILL_TIME : now / 1000);
        gl.uniform2f(uPointer, pointer.x, pointer.y);
        gl.uniform1f(uLift, pointer.lift);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        if (!reducedMotion.matches) frame = requestAnimationFrame(draw);
      };
      const kick = () => {
        if (!frame) frame = requestAnimationFrame(draw);
      };

      const observer = new IntersectionObserver(([entry]) => {
        visible = entry.isIntersecting;
        kick();
      });
      observer.observe(canvas);

      const onMove = (event: PointerEvent) => {
        const box = host.getBoundingClientRect();
        pointer.targetX = (event.clientX - box.left) / box.width;
        pointer.targetY = 1 - (event.clientY - box.top) / box.height;
        pointer.targetLift = 1;
      };
      const onLeave = () => {
        pointer.targetLift = 0;
      };
      host.addEventListener("pointermove", onMove, { passive: true });
      host.addEventListener("pointerleave", onLeave, { passive: true });
      document.addEventListener("visibilitychange", kick);
      kick();

      stop = () => {
        cancelAnimationFrame(frame);
        observer.disconnect();
        host.removeEventListener("pointermove", onMove);
        host.removeEventListener("pointerleave", onLeave);
        document.removeEventListener("visibilitychange", kick);
        gl.getExtension("WEBGL_lose_context")?.loseContext();
      };
    };

    const idle =
      typeof window.requestIdleCallback === "function"
        ? window.requestIdleCallback(start, { timeout: 2000 })
        : window.setTimeout(start, 300);

    return () => {
      if (typeof window.cancelIdleCallback === "function") {
        window.cancelIdleCallback(idle);
      } else {
        window.clearTimeout(idle);
      }
      stop();
    };
  }, []);

  return (
    <canvas
      ref={ref}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-[1] h-full w-full"
    />
  );
}
