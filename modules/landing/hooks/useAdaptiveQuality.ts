"use client";
import { useEffect, useState } from "react";

export const MAX_QUALITY_STEP = 2; // 0 = full quality, 1 = lighter sky and fewer pixels, 2 = lightest, 30 fps
const WARMUP_MS = 1500; // the shader compiling and the model loading are not what is being measured
const SAMPLE_FRAMES = 60;
const SLOW_MS = 24; // an average frame longer than this (under ~42 fps) means the device is struggling

/**
 * Starts at full quality and steps down (never back up, so it cannot flicker between levels) whenever the average frame
 * time stays too long. `active` is true while the animation is on screen and running. `forced` pins a level for testing.
 */
export function useAdaptiveQuality(active: boolean, forced: number | null = null) {
  const [step, setStep] = useState(0);
  const level = forced ?? step;

  useEffect(() => {
    if (!active || forced !== null || step >= MAX_QUALITY_STEP) return;
    let raf = 0;
    let last = 0;
    let frames = 0;
    let total = 0;
    let from = performance.now();
    const tick = (now: number) => {
      const dt = now - last;
      if (last && dt < 250 && now - from > WARMUP_MS) {
        total += dt;
        if (++frames >= SAMPLE_FRAMES) {
          if (total / frames > SLOW_MS) {
            setStep((s) => s + 1);
            return;
          }
          total = 0;
          frames = 0;
        }
      } else if (dt >= 250) {
        from = now; // the tab was in the background or stalled: start measuring again
      }
      last = now;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active, forced, step]);

  return level;
}
