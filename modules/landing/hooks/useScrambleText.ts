"use client";
import { useEffect, useRef, useState } from "react";

const GLYPHS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789#%&*+<>/";
const FLICKER_MS = 45; // how often a not-yet-settled letter changes
const LEAD_MS = 350; // everything scrambles for this long before the first letter settles
export const SCRAMBLE_STEP_MS = 45; // delay between one letter settling and the next

const glyph = (i: number, frame: number) => {
  const n = Math.sin(i * 12.9898 + frame * 78.233) * 43758.5453;
  return GLYPHS[Math.floor((n - Math.floor(n)) * GLYPHS.length)];
};

const jitter = (i: number) => {
  const n = Math.sin(i * 39.346 + 11.135) * 43758.5453;
  return n - Math.floor(n);
};
// when letter i settles: roughly left to right, but each one a little early or late so it does not look like a typewriter
const settleAt = (i: number) => LEAD_MS + i * SCRAMBLE_STEP_MS + jitter(i) * 70;

export type ScrambleCell = { ch: string; settled: boolean };

/** How long the change to `text` takes, so a caller can wait before starting the next one. */
export const scrambleDuration = (from: string, to: string) => settleAt(Math.max(from.length, to.length)) + 60;

/**
 * The letters to show while `target` is decoded: every letter flickers through random glyphs, then settles on the right one
 * from left to right. When the target changes, the old text scrambles first, so one word dissolves into the next.
 * `delay` only applies to the very first run. With `enabled` off the target is shown as they are.
 */
export function useScrambleText(target: string, enabled: boolean, delay = 0) {
  const [cells, setCells] = useState<ScrambleCell[]>([]);
  const previous = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const from = previous.current ?? "";
    const wait = previous.current === null ? delay : 0;
    previous.current = target;
    const t0 = performance.now() + wait;
    const n = Math.max(from.length, target.length);
    let raf = 0;
    const tick = () => {
      const el = performance.now() - t0;
      if (el < 0) {
        setCells([...from].map((ch) => ({ ch, settled: true })));
        raf = requestAnimationFrame(tick);
        return;
      }
      const frame = Math.floor(el / FLICKER_MS);
      const out: ScrambleCell[] = [];
      let done = true;
      for (let i = 0; i < n; i++) {
        const t = target[i] ?? "";
        if (el >= settleAt(i)) {
          if (t) out.push({ ch: t, settled: true });
        } else {
          done = false;
          const keep = t === " " || t === "\n" || (t === "" && (from[i] === " " || from[i] === "\n"));
          out.push({ ch: keep ? t || from[i] : glyph(i, frame), settled: keep });
        }
      }
      setCells(out);
      if (!done) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, enabled, delay]);

  return enabled ? cells : [...target].map((ch) => ({ ch, settled: true }));
}
