"use client";
import { useEffect, useRef } from "react";

const LEVELS = 40; // how many grey steps the dots can have

type Props = {
  src: string;
  /** size of one dot in CSS px */
  pitch?: number;
  /** how much of its cell a dot fills */
  dot?: number;
  /** brightness curve: below 1 lights more dots */
  gamma?: number;
  className?: string;
};

/**
 * Draws a picture as a grid of round dots that keep the picture's own colours, once (and again when it is resized). Where the picture is opaque the canvas is
 * filled solid black first, so whatever is behind it is hidden by the silhouette and the dots only add the light.
 */
export function DotImage({ src, pitch = 2, dot = 0.86, gamma = 1, className }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const img = new Image();
    let alive = true;

    const draw = () => {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (!w || !h || !img.complete) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const cols = Math.max(1, Math.round(w / pitch));
      const rows = Math.max(1, Math.round(h / pitch));
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);

      // one pixel of this small copy is one dot
      const small = document.createElement("canvas");
      small.width = cols;
      small.height = rows;
      const sctx = small.getContext("2d", { willReadFrequently: true });
      const ctx = canvas.getContext("2d");
      if (!sctx || !ctx) return;
      sctx.drawImage(img, 0, 0, cols, rows);
      const px = sctx.getImageData(0, 0, cols, rows).data;

      const cw = canvas.width / cols;
      const ch = canvas.height / rows;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const solid = new Path2D();
      // every dot keeps the colour of the picture under it; dots are grouped by brightness so each group is one fill
      const groups: (Path2D | null)[] = new Array(LEVELS).fill(null);
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const i = (y * cols + x) * 4;
          if (px[i + 3] < 115) continue;
          solid.rect(x * cw, y * ch, Math.ceil(cw), Math.ceil(ch));
          const lum = Math.min(1, Math.pow((px[i] * 0.3 + px[i + 1] * 0.59 + px[i + 2] * 0.11) / 255, gamma));
          const g = Math.round(lum * (LEVELS - 1));
          if (g === 0) continue;
          const r = (Math.min(cw, ch) * dot) / 2;
          const path = (groups[g] ??= new Path2D());
          path.moveTo(x * cw + cw / 2 + r, y * ch + ch / 2); // without this the circles would be joined by lines
          path.arc(x * cw + cw / 2, y * ch + ch / 2, r, 0, Math.PI * 2);
        }
      }
      ctx.fillStyle = "#000";
      ctx.fill(solid);
      groups.forEach((path, g) => {
        if (!path) return;
        const v = Math.round((g / (LEVELS - 1)) * 255);
        ctx.fillStyle = `rgb(${v},${v},${v})`;
        ctx.fill(path);
      });
    };

    img.onload = () => alive && draw();
    img.src = src;
    const ro = new ResizeObserver(draw);
    ro.observe(canvas);
    return () => {
      alive = false;
      ro.disconnect();
    };
  }, [src, pitch, dot, gamma]);

  return <canvas ref={ref} aria-hidden className={className} />;
}
