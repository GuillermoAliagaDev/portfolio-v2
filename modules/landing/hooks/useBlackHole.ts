"use client";
import { RefObject, useCallback, useEffect, useRef } from "react";
import { CELL_W } from "../constants/asciiCell";
import { BLACK_HOLE_FRAGMENT, BLACK_HOLE_VERTEX } from "../constants/blackHoleShader";
import { loadDiskTexture } from "../services/diskTextureService";
import { BOOM_S, explosionState, portraitBoost, useOrbitCamera } from "./useOrbitCamera";

const PIXEL = CELL_W / 2.5; // CSS px per rendered pixel: ~2 per ASCII cell horizontally
const MAX_PIXELS = 180_000;

type Gl = {
  gl: WebGLRenderingContext;
  uniforms: Record<string, WebGLUniformLocation | null>;
};

function createGl(canvas: HTMLCanvasElement): Gl | null {
  const gl = canvas.getContext("webgl", { antialias: false, depth: false, preserveDrawingBuffer: true });
  if (!gl) return null;
  const compile = (type: number, src: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? "shader");
    return s;
  };
  const program = gl.createProgram()!;
  gl.attachShader(program, compile(gl.VERTEX_SHADER, BLACK_HOLE_VERTEX));
  gl.attachShader(program, compile(gl.FRAGMENT_SHADER, BLACK_HOLE_FRAGMENT));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) ?? "link");
  gl.useProgram(program);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const pos = gl.getAttribLocation(program, "aPos");
  gl.enableVertexAttribArray(pos);
  gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0);
  const names = ["uRes", "uElev", "uYaw", "uRoll", "uZoom", "uTime", "uDisk", "uGain", "uStars", "uRingW", "uBase", "uBoom"];
  return { gl, uniforms: Object.fromEntries(names.map((n) => [n, gl.getUniformLocation(program, n)])) };
}

/**
 * Live black hole rendered with WebGL into an offscreen canvas sized to `container`.
 * `frame()` renders the current state and returns the canvas (or null if WebGL failed).
 */
export function useBlackHole(container: RefObject<HTMLElement | null>, enabled: boolean, onFail: () => void) {
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const ctx = useRef<Gl | null>(null);
  // yaw/elev = where the visitor wants the camera, dYaw/dElev = where it is drawn (eased toward it); `touched` = last interaction
  const { rotate, setDragging, setHeld, update: updateCamera } = useOrbitCamera();
  const boomStart = useRef<number | null>(null);
  const startedAt = useRef(0);

  useEffect(() => {
    const el = container.current;
    if (!enabled || !el) return;
    const c = document.createElement("canvas");
    let gl: Gl | null = null;
    try {
      gl = createGl(c);
    } catch {
      gl = null;
    }
    if (!gl) {
      onFail();
      return;
    }
    const lost = (e: Event) => {
      e.preventDefault();
      ctx.current = null;
      onFail();
    };
    c.addEventListener("webglcontextlost", lost);
    const resize = () => {
      let w = Math.max(1, Math.round(el.clientWidth / PIXEL));
      let h = Math.max(1, Math.round(el.clientHeight / PIXEL));
      const s = Math.min(1, Math.sqrt(MAX_PIXELS / (w * h)));
      w = Math.max(1, Math.round(w * s));
      h = Math.max(1, Math.round(h * s));
      c.width = w;
      c.height = h;
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(el);
    canvas.current = c;
    let cancelled = false;
    const ready = gl;
    // frame() returns null (nothing drawn) until the baked disk texture is on the GPU
    loadDiskTexture(
      ready.gl,
      () => {
        if (cancelled) return;
        startedAt.current = performance.now() / 1000;
        ctx.current = ready;
      },
      () => !cancelled && onFail(),
    );
    return () => {
      cancelled = true;
      observer.disconnect();
      c.removeEventListener("webglcontextlost", lost);
      gl?.gl.getExtension("WEBGL_lose_context")?.loseContext();
      canvas.current = null;
      ctx.current = null;
    };
  }, [container, enabled, onFail]);

  const startBoom = useCallback(() => {
    boomStart.current ??= performance.now() / 1000;
  }, []);

  const lastFrame = useRef(0);
  const frame = useCallback((): HTMLCanvasElement | null => {
    const gl = ctx.current;
    const c = canvas.current;
    if (!gl || !c) return null;
    const now = performance.now() / 1000;
    const dt = Math.min(Math.max(now - (lastFrame.current || now), 0), 0.1);
    lastFrame.current = now;

    const view = updateCamera(now, dt, boomStart.current !== null);
    const e = explosionState(boomStart.current === null ? -1 : (now - boomStart.current) / BOOM_S);
    const u = gl.uniforms;
    const g = gl.gl;
    g.viewport(0, 0, c.width, c.height);
    g.uniform2f(u.uRes, c.width, c.height);
    g.uniform1f(u.uElev, view.elev);
    g.uniform1f(u.uYaw, view.yaw);
    g.uniform1f(u.uRoll, e.roll + e.shake);
    g.uniform1f(u.uZoom, e.zoom * (1 - e.pull) * portraitBoost(c.width, c.height));
    g.uniform1f(u.uTime, now - startedAt.current + 2.5 * e.fall); // the disk spins up as the camera falls in
    g.uniform1i(u.uDisk, 0);
    g.uniform1f(u.uGain, e.gain);
    g.uniform1f(u.uStars, e.stars);
    g.uniform1f(u.uRingW, e.ringW);
    g.uniform1f(u.uBase, e.fall < 1 ? 1 : 0);
    g.uniform1f(u.uBoom, e.t < 0 ? -1 : Math.min(e.t, 1));
    g.drawArrays(g.TRIANGLES, 0, 3);
    return c;
  }, [updateCamera]);

  return { frame, rotate, setDragging, setHeld, startBoom };
}
