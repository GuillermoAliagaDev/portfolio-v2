"use client";
import { useEffect, useRef, useState } from "react";
import type { AsciiSource } from "./asciiTypes";

// dark -> bright, 70 levels: lets smooth gradients (glow, disk falloff) read as shading instead of bands
const DEFAULT_RAMP = " .'`^\",:;Il!i><~+_-?][}{1)(|\\/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$";

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
type Props = {
  /** current video or canvas to sample, or null for an empty frame; read every tick */
  getSource: () => AsciiSource | null;
  /** false renders a single frame (reduced motion, off-screen) */
  running: boolean;
  /** characters from dark to bright */
  ramp?: string;
  /** which part of the picture this grid draws: overall brightness, or just the red or green channel, so that
   *  several layers can share one source and each take a different part of it */
  channel?: "luma" | "red" | "green";
  cellWidth?: number;
  cellHeight?: number;
  className?: string;
};

// Video or canvas -> tiny 2D canvas (one pixel per cell) -> brightness picks a character -> DOM text.
export function AsciiGrid({
  getSource,
  running,
  ramp = DEFAULT_RAMP,
  channel = "luma",
  cellWidth = 9,
  cellHeight = 16,
  className,
}: Props) {
  const root = useRef<HTMLDivElement>(null);
  const pre = useRef<HTMLPreElement>(null);
  const [grid, setGrid] = useState({ cols: 0, rows: 0, spacing: 0 });

  useEffect(() => {
    const el = root.current;
    const text = pre.current;
    if (!el || !text) return;
    const measure = () => {
      // letter-spacing that makes one glyph advance exactly one cell
      const probe = document.createElement("span");
      probe.textContent = "M".repeat(100);
      text.style.letterSpacing = "0px";
      text.replaceChildren(probe);
      const advance = probe.getBoundingClientRect().width / 100;
      text.replaceChildren();
      setGrid({
        cols: Math.max(1, Math.ceil(el.clientWidth / cellWidth)),
        rows: Math.max(1, Math.ceil(el.clientHeight / cellHeight)),
        spacing: cellWidth - advance,
      });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [cellWidth, cellHeight]);

  useEffect(() => {
    const { cols, rows } = grid;
    const text = pre.current;
    if (!text || cols === 0) return;

    const make = () => {
      const canvas = document.createElement("canvas");
      canvas.width = cols;
      canvas.height = rows;
      return { canvas, ctx: canvas.getContext("2d", { willReadFrequently: true })! };
    };
    const sample = make();
    let last = "";
    let raf = 0;
    const n = ramp.length;
    const aspect = (cols * cellWidth) / (rows * cellHeight);

    const frame = () => {
      sample.ctx.fillStyle = "#000";
      sample.ctx.fillRect(0, 0, cols, rows);
      const source = getSource();
      const isVideo = source instanceof HTMLVideoElement;
      const w = !source ? 0 : isVideo ? (source.readyState >= 2 ? source.videoWidth : 0) : source.width;
      const h = !source ? 0 : isVideo ? (source.readyState >= 2 ? source.videoHeight : 0) : source.height;
      if (source && w > 0 && h > 0) {
        // object-fit: cover
        const sourceAspect = w / h;
        const sw = sourceAspect > aspect ? h * aspect : w;
        const sh = sourceAspect > aspect ? h : w / aspect;
        sample.ctx.drawImage(source, (w - sw) / 2, (h - sh) / 2, sw, sh, 0, 0, cols, rows);
      }
      const pixels = sample.ctx.getImageData(0, 0, cols, rows).data;
      const lines: string[] = [];
      for (let y = 0; y < rows; y++) {
        let line = "";
        for (let x = 0; x < cols; x++) {
          const i = (y * cols + x) * 4;
          const lum =
            channel === "red" ? pixels[i] / 255 : channel === "green" ? pixels[i + 1] / 255 : (0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2]) / 255;
          // ordered dithering: neighbouring cells round up or down, so smooth gradients keep their detail
          const level = Math.pow(Math.min(Math.max(lum, 0), 1), 0.8) * (n - 1);
          line += ramp[Math.min(n - 1, Math.floor(level + BAYER[(y & 3) * 4 + (x & 3)] / 16))];
        }
        lines.push(line);
      }
      const out = lines.join("\n");
      if (out !== last) {
        text.textContent = out;
        last = out;
      }
      if (running) raf = requestAnimationFrame(frame);
    };

    frame();
    return () => cancelAnimationFrame(raf);
  }, [grid, running, ramp, channel, cellWidth, cellHeight, getSource]);

  return (
    <div ref={root} className={className} aria-hidden>
      <pre
        ref={pre}
        className="m-0 select-none overflow-hidden whitespace-pre font-mono font-bold text-foreground"
        style={{
          fontSize: `${cellWidth / 0.6}px`,
          lineHeight: `${cellHeight}px`,
          letterSpacing: `${grid.spacing}px`,
        }}
      />
    </div>
  );
}
