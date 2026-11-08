"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { AsciiGrid } from "@/components/ascii/AsciiGrid";
import { DotMatrix } from "@/components/ascii/DotMatrix";
import { createPixelSampler, frameStamp } from "@/components/ascii/pixelSampler";
import { useInView } from "@/hooks/useInView";
import { canUseWebGL } from "@/lib/canUseWebGL";
import { CELL_H, CELL_W } from "../../constants/asciiCell";
import { useAdaptiveQuality } from "../../hooks/useAdaptiveQuality";
import { useBlackHole } from "../../hooks/useBlackHole";
import { useOrbModel } from "../../hooks/useOrbModel";
import { useIntroSequence } from "../../hooks/useIntroSequence";
import { useOrbitGesture } from "../../hooks/useOrbitGesture";
import { IntroHeadline } from "./IntroHeadline";

// Two separate layers read the same picture, each one a different part of it:
//   - pixels: the black hole itself (disk, ring, explosion) as 1-bit halftone dots, like a dithered print
//   - ascii: the sky behind it (stars, sparkles, gas band) as text characters
const SKY_RAMP = " .:-=+*#%@";
// How the sky is drawn: "pixels" = 1-bit dots like the black hole, "ascii" = text characters. Flip to compare.
const SKY_LAYER: "pixels" | "ascii" = "pixels";
// sky colours by hue index (the shader gives every object one): white, blue-white, blue, cyan, turquoise, green, purple,
// pink, salmon, orange - like the colours in a deep-field telescope image. The plasma clouds use 0.2 .. 0.5.
const SKY_HUES = [
  [0.0, 255, 255, 255],
  [0.07, 205, 220, 245],
  [0.14, 105, 145, 215],
  [0.2, 45, 185, 220], // cyan
  [0.26, 35, 225, 195], // turquoise
  [0.32, 60, 240, 120], // green
  [0.4, 125, 100, 240], // blue-purple
  [0.47, 175, 80, 235], // purple
  [0.5, 190, 85, 225], // purple-magenta
  [0.55, 205, 100, 185],
  [0.75, 245, 170, 95],
  [0.88, 240, 140, 50],
  [1.0, 220, 90, 30],
] as const;
const DOT_PITCH = 2; // size of one dot in CSS px
const DOT_PITCH_LIGHT = 3; // on slow devices (quality step 2): about 2x fewer dots to work out each frame
// dot colour by brightness, like heated gas: embers at the cool outer edge -> orange -> gold -> white-hot at the ring
const DOT_PALETTE = [
  [0.0, 150, 35, 8],
  [0.3, 235, 95, 18],
  [0.6, 255, 170, 70],
  [0.85, 255, 228, 175],
  [1.0, 255, 255, 255],
] as const;
// Which black hole is drawn:
//   "orbs"    = the lensing shader (ring, bent arch, sky, explosion) with its flat disk replaced by the Blender orb model
//   "lensing" = the lensing shader on its own: the fallback if the orb model cannot load (also at /?hole=lensing for testing)
type HoleModel = "orbs" | "lensing";

export function IntroCanvas() {
  const ref = useRef<HTMLElement>(null);
  const label = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref);
  const { phase, explode, skip, reduced } = useIntroSequence();
  const [supported, setSupported] = useState<boolean | null>(null); // null until checked on the client
  const [model, setModel] = useState<HoleModel | null>(null);
  const [ready, setReady] = useState(false);
  const [forcedQuality, setForcedQuality] = useState<number | null>(null); // ?quality=0|1|2 pins a level, for testing
  const [sampler] = useState(createPixelSampler); // one pixel readback per frame, shared by both dot layers
  const [held, setHeld] = useState(false); // a finger or button is down: the words step aside so only the black hole shows

  useEffect(() => {
    setSupported(canUseWebGL());
    const query = new URLSearchParams(window.location.search);
    setModel(query.get("hole") === "lensing" ? "lensing" : "orbs");
    const q = Number(query.get("quality"));
    setForcedQuality(query.has("quality") && q >= 0 && q <= 2 ? Math.round(q) : null);
  }, []);

  const live = supported === true && !reduced && model !== null;
  const onFail = useCallback(() => setSupported(false), []);
  // if the orb model cannot be loaded, fall back to the lensing shader on its own instead of an empty screen
  const onOrbsFail = useCallback(() => setModel("lensing"), []);
  const lensing = useBlackHole(ref, live && model === "lensing", onFail);
  const quality = useAdaptiveQuality(live && inView && phase !== "revealed", forcedQuality);
  const orbs = useOrbModel(ref, live && model === "orbs", onOrbsFail, quality);
  const blackHole = model === "orbs" ? orbs : lensing;
  const { frame, startBoom, setHeld: holdCamera } = blackHole;

  useEffect(() => {
    if (phase === "exploding") startBoom();
  }, [phase, startBoom]);

  const phaseRef = useRef(phase);
  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);
  const readyRef = useRef(false);
  // the ASCII text and the dot layer read the same picture: render it once per animation frame and share it
  const shared = useRef<{ at: number; canvas: HTMLCanvasElement | null }>({ at: -1, canvas: null });
  const getSource = useCallback(() => {
    if (phaseRef.current === "revealed") return null;
    const now = frameStamp(); // the same for everything drawn in this display frame: the picture is rendered once, not once per layer
    if (now === shared.current.at) return shared.current.canvas;
    const canvas = frame();
    shared.current = { at: now, canvas };
    if (canvas && !readyRef.current) {
      readyRef.current = true;
      setReady(true);
    }
    return canvas;
  }, [frame]);

  const gesture = useOrbitGesture({
    rotate: blackHole.rotate,
    setDragging: blackHole.setDragging,
    onActivate: explode,
    onHold: useCallback(
      (down: boolean) => {
        holdCamera(down);
        setHeld(down);
      },
      [holdCamera],
    ),
  });

  return (
    <section
      ref={ref}
      data-quality={quality}
      className="relative h-svh w-full overflow-hidden bg-background"
      onPointerMove={(e) => {
        if (label.current) label.current.style.transform = `translate(${e.clientX + 14}px, ${e.clientY + 14}px)`;
      }}
    >
      {supported === true && (
        <>
          <DotMatrix
            getSource={getSource}
            running={live && inView}
            channel="red"
            pitch={quality >= 2 ? DOT_PITCH_LIGHT : DOT_PITCH}
            sampler={sampler}
            maxFps={quality >= 2 ? 30 : 0}
            palette={DOT_PALETTE}
            shimmer={0.18}
            className={`pointer-events-none absolute inset-0 size-full transition-opacity duration-1000 ${ready || reduced ? "opacity-100" : "opacity-0"}`}
          />
          {SKY_LAYER === "pixels" ? (
            <DotMatrix
              getSource={getSource}
              running={live && inView}
              channel="green"
              pitch={quality >= 2 ? DOT_PITCH_LIGHT : DOT_PITCH}
            sampler={sampler}
            maxFps={quality >= 2 ? 30 : 0}
              hues={SKY_HUES}
              shimmer={0.15}
              gamma={0.7}
              className={`pointer-events-none absolute inset-0 size-full transition-opacity duration-1000 ${ready || reduced ? "opacity-100" : "opacity-0"}`}
            />
          ) : (
            <AsciiGrid
              getSource={getSource}
              running={live && inView}
              channel="green"
              ramp={SKY_RAMP}
              cellWidth={CELL_W}
              cellHeight={CELL_H}
              className={`absolute inset-0 overflow-hidden transition-opacity duration-1000 ${ready || reduced ? "opacity-100" : "opacity-0"}`}
            />
          )}
        </>
      )}

      <IntroHeadline visible={phase === "idle" && !held} />

      {supported !== false && phase === "idle" && (
        <>
          <button
            type="button"
            {...gesture}
            aria-label="Black hole. Drag or use the arrow keys to orbit it; press to collapse it"
            className="absolute inset-0 cursor-grab touch-none select-none active:cursor-grabbing"
          />
          <span
            ref={label}
            aria-hidden
            className="pointer-events-none fixed left-0 top-0 hidden text-xs tracking-widest text-foreground [@media(hover:hover)]:block"
          >
            DRAG · CLICK
          </span>
          <span
            aria-hidden
            className="pointer-events-none absolute bottom-[max(1.25rem,env(safe-area-inset-bottom))] left-[5vw] z-10 hidden text-[0.7rem] uppercase tracking-widest text-foreground/70 [@media(hover:none)]:block"
          >
            Drag to orbit · Tap to collapse
          </span>
        </>
      )}

      {supported !== false && phase !== "revealed" && (
        <button
          type="button"
          onClick={skip}
          className="absolute bottom-[max(0.5rem,env(safe-area-inset-bottom))] right-[max(0.5rem,env(safe-area-inset-right))] z-10 flex min-h-11 items-center px-3 text-xs uppercase tracking-widest text-foreground/70 hover:text-foreground focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2"
        >
          Skip intro
        </button>
      )}
    </section>
  );
}
