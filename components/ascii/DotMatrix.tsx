"use client";
import { CSSProperties, useEffect, useRef } from "react";
import type { AsciiSource } from "./asciiTypes";

// 8x8 ordered-dither (Bayer) matrix, values 0..63
const BAYER8 = [
  0, 32, 8, 40, 2, 34, 10, 42, 48, 16, 56, 24, 50, 18, 58, 26, 12, 44, 4, 36, 14, 46, 6, 38, 60, 28, 52, 20, 62, 30, 54, 22, 3, 35, 11, 43, 1,
  33, 9, 41, 51, 19, 59, 27, 49, 17, 57, 25, 15, 47, 7, 39, 13, 45, 5, 37, 63, 31, 55, 23, 61, 29, 53, 21,
];

const hashDot = (x: number, y: number, t: number) => {
  const n = Math.sin(x * 12.9898 + y * 78.233 + t * 37.719) * 43758.5453;
  return n - Math.floor(n);
};

type Props = {
  /** same source the ASCII grid reads: R = foreground, G = backdrop (or plain video/canvas) */
  getSource: () => AsciiSource | null;
  running: boolean;
  /** CSS px per dot */
  pitch?: number;
  /** dot colour as "r g b", used when there is no palette */
  color?: string;
  /** colour by brightness: [position 0..1, r, g, b] stops from dim to bright. Dim dots are also drawn darker. */
  palette?: readonly (readonly [number, number, number, number])[];
  /** colour by hue index: the source's blue channel (0..1) picks the colour from these stops, the brightness channel
   *  decides which dots are lit, and bright dots drift toward white. Lets one layer carry many colours. */
  hues?: readonly (readonly [number, number, number, number])[];
  /** per-dot shimmer, 0 = steady */
  shimmer?: number;
  /** which part of the picture this layer draws: red = the black hole, green = the sky, luma = everything */
  channel?: "luma" | "red" | "green";
  /** below 1 makes dim areas denser */
  gamma?: number;
  className?: string;
  style?: CSSProperties;
};

// 1-bit halftone layer: the source is shrunk to one pixel per dot, thresholded against a Bayer matrix and drawn as
// crisp square dots (like a Game Boy / newspaper print). It is its own layer: give it a channel so it and an ASCII
// grid show different parts of the same picture instead of drawing over each other.
export function DotMatrix({ getSource, running, pitch = 3, color = "255 255 255", palette, hues, shimmer = 0, channel = "luma", gamma = 0.55, className, style }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const el = canvas.current;
    const parent = el?.parentElement;
    if (!el || !parent) return;
    const small = document.createElement("canvas");
    const sctx = small.getContext("2d", { willReadFrequently: true })!;
    const ctx = el.getContext("2d")!;
    const [cr, cg, cb] = color.split(" ").map(Number);
    const buildLut = (stops: readonly (readonly [number, number, number, number])[] | undefined) => {
      const lut = new Uint8Array(256 * 3);
      for (let v = 0; v < 256; v++) {
        let r = cr, g = cg, b = cb;
        if (stops) {
          const t = v / 255;
          let k = 0;
          while (k < stops.length - 2 && t > stops[k + 1][0]) k++;
          const [p0, r0, g0, b0] = stops[k];
          const [p1, r1, g1, b1] = stops[k + 1];
          const f = Math.min(Math.max((t - p0) / (p1 - p0 || 1), 0), 1);
          r = r0 + (r1 - r0) * f;
          g = g0 + (g1 - g0) * f;
          b = b0 + (b1 - b0) * f;
        }
        lut[v * 3] = r;
        lut[v * 3 + 1] = g;
        lut[v * 3 + 2] = b;
      }
      return lut;
    };
    const lut = buildLut(palette); // brightness -> colour
    const hueLut = hues ? buildLut(hues) : null; // hue index -> colour
    let raf = 0;
    let size = { w: 0, h: 0 };

    const resize = () => {
      const w = Math.max(1, Math.ceil(parent.clientWidth / pitch));
      const h = Math.max(1, Math.ceil(parent.clientHeight / pitch));
      if (w === size.w && h === size.h) return;
      size = { w, h };
      el.width = small.width = w;
      el.height = small.height = h;
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(parent);

    const frame = () => {
      const { w, h } = size;
      const now = Math.floor(performance.now() / 90); // shimmer steps ~11 times a second
      sctx.fillStyle = "#000";
      sctx.fillRect(0, 0, w, h);
      const source = getSource();
      const isVideo = source instanceof HTMLVideoElement;
      const sw = !source ? 0 : isVideo ? source.videoWidth : source.width;
      const sh = !source ? 0 : isVideo ? source.videoHeight : source.height;
      const out = ctx.createImageData(w, h);
      if (source && sw > 0 && sh > 0) {
        // object-fit: cover
        const aspect = w / h;
        const srcAspect = sw / sh;
        const cw = srcAspect > aspect ? sh * aspect : sw;
        const ch = srcAspect > aspect ? sh : sw / aspect;
        sctx.drawImage(source, (sw - cw) / 2, (sh - ch) / 2, cw, ch, 0, 0, w, h);
        const px = sctx.getImageData(0, 0, w, h).data;
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            const i = (y * w + x) * 4;
            const v = channel === "red" ? px[i] : channel === "green" ? px[i + 1] : Math.max(px[i], px[i + 1]);
            const lum = Math.pow(v / 255, gamma);
            if (lum * 64 > BAYER8[(y & 7) * 8 + (x & 7)] + 0.5) {
              let r: number, g: number, b: number, k: number;
              if (hueLut) {
                const h = px[i + 2];
                const white = Math.pow(v / 255, 3) * 0.6; // the brightest cores burn out toward white
                r = hueLut[h * 3] + (255 - hueLut[h * 3]) * white;
                g = hueLut[h * 3 + 1] + (255 - hueLut[h * 3 + 1]) * white;
                b = hueLut[h * 3 + 2] + (255 - hueLut[h * 3 + 2]) * white;
                k = 0.5 + 0.5 * Math.min(1, v / 130);
              } else {
                const q = Math.min(255, Math.round(v));
                r = lut[q * 3];
                g = lut[q * 3 + 1];
                b = lut[q * 3 + 2];
                // dim dots are drawn darker, so the dither has depth instead of being flat
                k = palette ? 0.5 + 0.5 * Math.min(1, v / 160) : 1;
              }
              // each dot can shimmer a little
              k *= shimmer ? 1 - shimmer * hashDot(x, y, now) : 1;
              out.data[i] = r * k;
              out.data[i + 1] = g * k;
              out.data[i + 2] = b * k;
              out.data[i + 3] = 255;
            }
          }
        }
      }
      ctx.putImageData(out, 0, 0);
      if (running) raf = requestAnimationFrame(frame);
    };
    frame();
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
    };
  }, [getSource, running, pitch, color, palette, hues, shimmer, channel, gamma]);

  return <canvas ref={canvas} aria-hidden className={className} style={{ imageRendering: "pixelated", ...style }} />;
}
