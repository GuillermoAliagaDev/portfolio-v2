"use client";
import { RefObject, useCallback, useEffect, useRef } from "react";
import { CELL_W } from "../constants/asciiCell";
import { BLACK_HOLE_FRAGMENT, BLACK_HOLE_VERTEX } from "../constants/blackHoleShader";
import { ORB_FRAGMENT, ORB_GLOW_FRAGMENT, ORB_VERTEX } from "../constants/orbModelShaders";
import { mapOrbModel } from "../mappers/orbModelMapper";
import { loadDiskTexture } from "../services/diskTextureService";
import { fetchOrbModel } from "../services/orbModelService";
import type { OrbSwarm } from "../types/orbModelTypes";
import { BOOM_S, explosionState, portraitBoost, sstep, useOrbitCamera } from "./useOrbitCamera";

const PIXEL = CELL_W / 2.5; // CSS px per rendered pixel
const MAX_PIXELS = 180_000;
const ORB_GAIN = 1.6; // brightness of the orbs on the site (the dot filter wants them brighter than in Blender)
const GLOW_SCALE = 0.5; // soft glow under the disk, relative to the Blender setting
// the far side of the disk is bent over the shadow by the lensing pass inside this screen radius (units; 1 unit = 5.2 M)
const ARCH_UNITS = 2.6;
// attribute name in the shader, key in the model, GL type, and whether the stored integers are scaled to 0..1 (-1..1)
const ATTRIBUTES = [
  ["aX0", "x0", "UNSIGNED_SHORT", true],
  ["aTh0", "th0", "UNSIGNED_SHORT", true],
  ["aRad", "rad", "UNSIGNED_BYTE", true],
  ["aRnk", "rnk", "UNSIGNED_BYTE", true],
  ["aBri", "bri", "UNSIGNED_BYTE", true],
  ["aZ0", "z0", "BYTE", true],
  ["aKk", "kk", "UNSIGNED_BYTE", false],
  ["aPh", "ph", "UNSIGNED_BYTE", true],
] as const;

type Program = { program: WebGLProgram; u: (name: string) => WebGLUniformLocation | null };
type Gl = {
  gl: WebGLRenderingContext;
  lensing: Program;
  orbs: Program;
  glow: Program;
  quad: WebGLBuffer;
  swarm: OrbSwarm;
  buffers: WebGLBuffer[];
};

function compileProgram(gl: WebGLRenderingContext, vs: string, fs: string, attributes: string[]): Program {
  const make = (type: number, src: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? "shader");
    return s;
  };
  const program = gl.createProgram()!;
  gl.attachShader(program, make(gl.VERTEX_SHADER, vs));
  gl.attachShader(program, make(gl.FRAGMENT_SHADER, fs));
  attributes.forEach((name, i) => gl.bindAttribLocation(program, i, name));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) ?? "link");
  const cache = new Map<string, WebGLUniformLocation | null>();
  return {
    program,
    u: (name) => {
      if (!cache.has(name)) cache.set(name, gl.getUniformLocation(program, name));
      return cache.get(name)!;
    },
  };
}

function createGl(canvas: HTMLCanvasElement, swarm: OrbSwarm): Gl | null {
  const gl = canvas.getContext("webgl", { antialias: false, depth: false, preserveDrawingBuffer: true });
  if (!gl) return null;
  const lensing = compileProgram(gl, BLACK_HOLE_VERTEX, BLACK_HOLE_FRAGMENT, ["aPos"]);
  const glow = compileProgram(gl, BLACK_HOLE_VERTEX, ORB_GLOW_FRAGMENT, ["aPos"]);
  const orbs = compileProgram(gl, ORB_VERTEX, ORB_FRAGMENT, ATTRIBUTES.map(([name]) => name));
  const quad = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const buffers = ATTRIBUTES.map(([, key]) => {
    const buffer = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, swarm[key] as ArrayBufferView, gl.STATIC_DRAW);
    return buffer;
  });
  gl.disable(gl.DEPTH_TEST);
  return { gl, lensing, orbs, glow, quad, swarm, buffers };
}

/**
 * The black hole: the lensing pass (sky, shadow, photon ring, the far side of the disk bent over the shadow, the explosion) with
 * its flat disk replaced by the orb model from Blender (public/models/black-hole-orbs.glb), cross-faded where they meet.
 * Same interface as useBlackHole, so either can feed the dot layer. `onFail` is called if the model cannot be loaded.
 */
export function useOrbModel(container: RefObject<HTMLElement | null>, enabled: boolean, onFail: () => void) {
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const ctx = useRef<Gl | null>(null);
  const { rotate, setDragging, setHeld, update: updateCamera } = useOrbitCamera();
  const boomStart = useRef<number | null>(null);
  const startedAt = useRef(0);
  const lastFrame = useRef(0);

  useEffect(() => {
    const el = container.current;
    if (!enabled || !el) return;
    const c = document.createElement("canvas");
    const abort = new AbortController();
    let cancelled = false;
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
    const lost = (e: Event) => {
      e.preventDefault();
      ctx.current = null;
      onFail();
    };
    c.addEventListener("webglcontextlost", lost);

    fetchOrbModel(abort.signal)
      .then((bytes) => {
        if (cancelled) return;
        const gl = createGl(c, mapOrbModel(bytes).disk);
        if (!gl) throw new Error("WebGL unavailable");
        // the lensing pass draws the bent parts of the disk from the baked texture, so wait for it too
        loadDiskTexture(
          gl.gl,
          () => {
            if (cancelled) return;
            startedAt.current = performance.now() / 1000;
            ctx.current = gl;
          },
          () => !cancelled && onFail(),
        );
      })
      .catch(() => {
        if (!cancelled) onFail();
      });

    return () => {
      cancelled = true;
      abort.abort();
      observer.disconnect();
      c.removeEventListener("webglcontextlost", lost);
      ctx.current?.gl.getExtension("WEBGL_lose_context")?.loseContext();
      canvas.current = null;
      ctx.current = null;
    };
  }, [container, enabled, onFail]);

  const startBoom = useCallback(() => {
    boomStart.current ??= performance.now() / 1000;
  }, []);

  const frame = useCallback((): HTMLCanvasElement | null => {
    const g = ctx.current;
    const c = canvas.current;
    if (!g || !c) return null;
    const gl = g.gl;
    const now = performance.now() / 1000;
    const dt = Math.min(Math.max(now - (lastFrame.current || now), 0), 0.1);
    lastFrame.current = now;
    const view = updateCamera(now, dt, boomStart.current !== null);
    const e = explosionState(boomStart.current === null ? -1 : (now - boomStart.current) / BOOM_S);
    const time = now - startedAt.current + 2.5 * e.fall; // the disk spins up as the camera falls in
    const roll = e.roll + e.shake;
    const zoom = e.zoom * (1 - e.pull) * portraitBoost(c.width, c.height);
    const settings = g.swarm.settings;

    gl.viewport(0, 0, c.width, c.height);
    gl.disable(gl.BLEND);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    const fullscreen = (p: Program) => {
      gl.useProgram(p.program);
      for (let i = 1; i < 8; i++) gl.disableVertexAttribArray(i);
      gl.bindBuffer(gl.ARRAY_BUFFER, g.quad);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    };
    const setView = (p: Program) => {
      gl.uniform2f(p.u("uRes"), c.width, c.height);
      gl.uniform1f(p.u("uElev"), view.elev);
      gl.uniform1f(p.u("uYaw"), view.yaw);
      gl.uniform1f(p.u("uRoll"), roll);
      gl.uniform1f(p.u("uZoom"), zoom);
    };

    // 1. the lensing pass: sky, shadow, photon ring, the far side of the disk bent over the shadow, and the explosion. Its own
    //    flat disk is switched off (uOrbDisk) because the orbs draw it.
    fullscreen(g.lensing);
    setView(g.lensing);
    gl.uniform1f(g.lensing.u("uTime"), time);
    gl.uniform1i(g.lensing.u("uDisk"), 0);
    gl.uniform1f(g.lensing.u("uGain"), e.gain);
    gl.uniform1f(g.lensing.u("uStars"), e.stars);
    gl.uniform1f(g.lensing.u("uRingW"), e.ringW);
    gl.uniform1f(g.lensing.u("uBase"), e.fall < 1 ? 1 : 0);
    gl.uniform1f(g.lensing.u("uBoom"), e.t >= 0 ? Math.min(e.t, 1) : -1);
    gl.uniform1f(g.lensing.u("uOrbDisk"), 1);
    gl.uniform1f(g.lensing.u("uArchM"), ARCH_UNITS * 5.2);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // everything after this is composited over it: premultiplied colour + coverage
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    const orbFade = 1 - sstep(0.3, 0.75, e.fall);
    if (orbFade > 0) {
      // 2. the soft glow under the disk, outside the part the lensing pass draws
      fullscreen(g.glow);
      setView(g.glow);
      gl.uniform1f(g.glow.u("uTime"), time);
      gl.uniform1f(g.glow.u("uLoop"), settings.loopSeconds);
      gl.uniform1f(g.glow.u("uRIn"), settings.rIn);
      gl.uniform1f(g.glow.u("uROut"), settings.rOut);
      gl.uniform1f(g.glow.u("uTwist"), settings.twist);
      gl.uniform1f(g.glow.u("uArms"), settings.arms);
      gl.uniform1f(g.glow.u("uGlow"), settings.glow * GLOW_SCALE);
      gl.uniform1f(g.glow.u("uArch"), ARCH_UNITS);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      // 3. the orbs
      const o = g.orbs;
      gl.useProgram(o.program);
      setView(o);
      gl.uniform1f(o.u("uTime"), time);
      gl.uniform1f(o.u("uGain"), ORB_GAIN * e.gain);
      gl.uniform1f(o.u("uShare"), Math.min(1, Math.max(0.5, (c.width * c.height) / 120_000))); // fewer orbs on small screens
      gl.uniform1f(o.u("uFade"), orbFade);
      gl.uniform1f(o.u("uArch"), ARCH_UNITS);
      gl.uniform1f(o.u("uLoop"), settings.loopSeconds);
      gl.uniform1f(o.u("uCols"), settings.cols);
      gl.uniform1f(o.u("uRIn"), settings.rIn);
      gl.uniform1f(o.u("uROut"), settings.rOut);
      gl.uniform1f(o.u("uTwist"), settings.twist);
      gl.uniform1f(o.u("uFlare"), settings.flare);
      gl.uniform1f(o.u("uBob"), settings.bob);
      gl.uniform1f(o.u("uDensIn"), settings.densityInner);
      gl.uniform1f(o.u("uDensOut"), settings.densityOuter);
      gl.uniform1f(o.u("uBrIn"), settings.brightInner);
      gl.uniform1f(o.u("uBrOut"), settings.brightOuter);
      gl.uniform1f(o.u("uHot"), settings.hotEdge);
      gl.uniform1f(o.u("uArms"), settings.arms);
      gl.uniform1f(o.u("uArmC"), settings.armContrast);
      gl.uniform1f(o.u("uArmS"), settings.armSharpness);
      gl.uniform1f(o.u("uDoppler"), settings.doppler);
      ATTRIBUTES.forEach(([, , type, normalized], i) => {
        gl.bindBuffer(gl.ARRAY_BUFFER, g.buffers[i]);
        gl.enableVertexAttribArray(i);
        gl.vertexAttribPointer(i, 1, gl[type], normalized, 0, 0);
      });
      gl.drawArrays(gl.POINTS, 0, g.swarm.count);
    }
    return c;
  }, [updateCamera]);

  return { frame, rotate, setDragging, setHeld, startBoom };
}
