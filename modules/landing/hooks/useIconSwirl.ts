"use client";
import { RefObject, useEffect } from "react";

type Box = { l: number; t: number; r: number; b: number };
type Body = { size: number; lane: number; offset: number; spread: number; theta: number; x: number; y: number; half: number; k: number; ox: number; oy: number };
type Geometry = { cx: number; cy: number; rxIn: number; ryIn: number; W: number; B: number; vs: number; bleed: number; taper: number; gap: number };

// The tornado turns around the words (the "eye", an ellipse around them): icons ride rings that go round it and never cross it.
// f = how far out the ring is, from touching the eye (0) to the edge of the screen (1). All rings turn at the same speed, so the
// whole tornado turns as one: where every icon is depends only on the time, which keeps the motion perfectly smooth.
type Lane = { f: number; weight: number };
const LANES_WIDE: Lane[] = [
  { f: 0, weight: 0.6 },
  { f: 0.33, weight: 0.75 },
  { f: 0.66, weight: 0.9 },
  { f: 1, weight: 1 },
];
// on a phone every icon is smaller (see vs) but all of them are there
const LANES_NARROW: Lane[] = [
  { f: 0, weight: 0.8 },
  { f: 0.5, weight: 0.9 },
  { f: 1, weight: 1 },
];
const OMEGA = 0.34; // radians per second
const GAP = 14; // the space to keep between icons (less on a phone, where the icons are smaller)
const SWAY = 0.035; // how much the rings breathe in and out
const POINTER_REACH = 150;

const smooth = (x: number) => {
  const c = Math.min(1, Math.max(0, x));
  return c * c * (3 - 2 * c);
};
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Depth: the side of the ring at the bottom is "near" (bigger, brighter), the side at the top is "far" (smaller, dimmer). */
const near = (theta: number) => (1 + Math.sin(theta)) / 2;
const depthScale = (theta: number) => 0.62 + 0.46 * near(theta);

/** Where an icon is on its ring at angle theta, and how big it looks there. */
function onRing(size: number, lanes: Lane[], lane: number, spread: number, theta: number, g: Geometry) {
  const k = depthScale(theta);
  const half = (size * g.vs * k) / 2;
  const f = Math.min(1, Math.max(0, lanes[lane].f + spread)); // spread: this icon's own place within its ring's width
  const s = Math.sin(theta);
  const sway = 1 + SWAY * Math.sin(2 * theta + lane * 2);
  // inner end: just outside the eye (with this icon's own size and a gap); outer end: as far as the screen allows
  const inner = half * 1.3 + g.gap;
  // on a phone the rings narrow towards the bottom (taper), so the whole thing is a funnel, wide at the top and tight at the foot
  const reach = Math.max((g.W / 2 - half * g.bleed) * (1 - g.taper * near(theta)), g.rxIn + inner + 8);
  const rx = lerp(g.rxIn + inner, reach, f) * sway;
  const ryTop = lerp(g.ryIn + inner, g.cy + half * (g.taper > 0 ? 0.9 : 0.3), f) * sway; // the top ring may be partly off screen, like a far edge
  const ryBottom = lerp(g.ryIn + inner, g.B - g.cy - half - 6, f) * sway;
  return { x: g.cx + Math.cos(theta) * rx, y: g.cy + s * (s < 0 ? ryTop : ryBottom), k, half };
}

/** Space between two icons' squares (negative = overlapping). */
function gapBetween(a: { x: number; y: number; half: number }, b: { x: number; y: number; half: number }) {
  const sx = Math.abs(a.x - b.x) - (a.half + b.half);
  const sy = Math.abs(a.y - b.y) - (a.half + b.half);
  return sx > 0 && sy > 0 ? Math.hypot(sx, sy) : Math.max(sx, sy);
}

/** Which ring each icon rides, in what order: the big icons go on the outer rings, where there is room, spread among the small ones. */
function assign(sizes: number[], lanes: Lane[]) {
  const n = sizes.length;
  const totalWeight = lanes.reduce((s, l) => s + l.weight, 0);
  const counts = lanes.map((l) => Math.round((n * l.weight) / totalWeight));
  counts[lanes.length - 1] += n - counts.reduce((s, c) => s + c, 0);
  const slots: number[][] = lanes.map(() => []);
  sizes.map((_, i) => i).filter((i) => sizes[i] > 100).forEach((icon, k) => slots[lanes.length - 1 - (k % 2)].push(icon));
  for (const icon of sizes.map((_, i) => i).filter((i) => sizes[i] <= 100)) {
    let lane = slots.findIndex((s, l) => s.length < counts[l]);
    if (lane < 0) lane = lanes.length - 1;
    slots[lane].push(icon);
  }
  return slots.map((icons) => {
    const bigs = icons.filter((i) => sizes[i] > 100);
    const smalls = icons.filter((i) => sizes[i] <= 100);
    const order: number[] = new Array(icons.length);
    const used = new Set<number>();
    bigs.forEach((icon, k) => {
      const at = Math.floor((k * icons.length) / bigs.length);
      order[at] = icon;
      used.add(at);
    });
    let s = 0;
    for (let i = 0; i < icons.length; i++) if (!used.has(i)) order[i] = smalls[s++];
    return order;
  });
}

/**
 * Moves the icons like a tornado around the words. Each icon rides a ring that goes round an ellipse drawn around the words,
 * so the icons stay out of the middle without being steered. The ring's far side (top) shows the icon smaller and dimmer, its
 * near side (bottom) bigger and brighter, which reads as depth. Where an icon does cross a word it passes behind it.
 *
 * Fluid by construction: the starting angles are searched once so that, as the whole tornado turns, the icons keep clear of each
 * other; after that every position is just a smooth function of the clock, with nothing that pushes icons about (so nothing
 * can make them jump). Only the pointer nudges them, eased in and out. Positions are written straight to the elements, so
 * React never re-renders, and the page layout is read only when the size changes, not every frame.
 */
export function useIconSwirl(
  section: RefObject<HTMLElement | null>,
  icons: RefObject<(HTMLElement | null)[]>,
  sizes: number[],
  animate: boolean,
  compact = false,
) {
  useEffect(() => {
    const root = section.current;
    const els = icons.current;
    if (!root || !els) return;
    // the words' own boxes (not the words themselves, which sway a little) mark where the eye is
    const eyeEls = [...root.querySelectorAll<HTMLElement>("[data-obstacle]")].map((el) => el.parentElement ?? el);
    const floor = root.querySelector<HTMLElement>("[data-floor]"); // the free area ends where this starts

    const g: Geometry = { cx: 0, cy: 0, rxIn: 1, ryIn: 1, W: 0, B: 0, vs: 1, bleed: compact ? 1.05 : 0.3, taper: compact ? 0.22 : 0, gap: compact ? 6 : GAP }; // bleed: how far the outer ring may run off the sides (a phone keeps icons whole)
    const lanes = compact ? LANES_NARROW : LANES_WIDE;
    const order = assign(sizes, lanes);
    const bodies: Body[] = sizes.map((size) => ({ size, lane: 0, offset: 0, spread: 0, theta: 0, x: 0, y: 0, half: size / 2, k: 1, ox: 0, oy: 0 }));
    order.forEach((list, lane) => list.forEach((icon) => (bodies[icon].lane = lane)));
    let pointer: { x: number; y: number } | null = null;

    const measure = () => {
      const rr = root.getBoundingClientRect();
      g.W = rr.width;
      g.B = floor ? floor.getBoundingClientRect().top - rr.top - 6 : rr.height * 0.78;
      g.vs = compact ? 0.42 : Math.min(1, Math.max(0.45, g.W / 1440));
      let box: Box | null = null;
      for (const el of eyeEls) {
        const r = el.getBoundingClientRect();
        const b = { l: r.left - rr.left, t: r.top - rr.top, r: r.right - rr.left, b: r.bottom - rr.top };
        box = box ? { l: Math.min(box.l, b.l), t: Math.min(box.t, b.t), r: Math.max(box.r, b.r), b: Math.max(box.b, b.b) } : b;
      }
      box ??= { l: g.W * 0.3, t: g.B * 0.3, r: g.W * 0.7, b: g.B * 0.5 };
      g.cx = (box.l + box.r) / 2;
      g.cy = (box.t + box.b) / 2;
      g.rxIn = ((box.r - box.l) / 2) * (compact ? 0.62 : 1.08); // on a phone the words fill the width, so the eye is narrower than they are and a corner may be passed behind // the eye: a little wider and taller than the words, so their corners are inside it
      g.ryIn = ((box.b - box.t) / 2) * 1.4;
    };

    // Starting angles: even round each ring, then nudged one icon at a time (keeping any nudge that helps) so that, over a whole
    // turn, as few icons as possible ever come close to each other.
    const arrange = () => {
      const n = bodies.length;
      const sweep = 60;
      const base = bodies.map(() => 0);
      order.forEach((list, lane) => list.forEach((icon, j) => (base[icon] = (j / list.length) * Math.PI * 2 + lane * 1.7)));
      const offs = bodies.map(() => 0);
      const spreads = bodies.map(() => 0);
      // where every icon is at each step of one full turn, kept up to date so that changing one icon only costs that icon's pairs
      const at = Array.from({ length: n }, () => new Array(sweep));
      const fill = (i: number) => {
        for (let s = 0; s < sweep; s++) at[i][s] = onRing(bodies[i].size, lanes, bodies[i].lane, spreads[i], base[i] + offs[i] + (s / sweep) * Math.PI * 2, g);
      };
      const crowding = (i: number) => {
        let c = 0;
        for (let j = 0; j < n; j++) {
          if (j === i) continue;
          for (let s = 0; s < sweep; s++) {
            const d = gapBetween(at[i][s], at[j][s]);
            if (d < g.gap + 8) c += (g.gap + 8 - d) ** 2;
          }
        }
        return c;
      };
      for (let i = 0; i < n; i++) fill(i);
      // try small changes to one icon at a time; keep the ones that give it more room (early on, a few slightly worse ones too, to get out of dead ends)
      const tries = compact ? 9000 : 4000; // a phone has less room, so the search tries harder
      for (let it = 0; it < tries; it++) {
        const i = it % n;
        const before = crowding(i);
        if (before === 0) continue;
        const was = { o: offs[i], s: spreads[i], a: at[i].slice() };
        offs[i] += (Math.random() - 0.5) * 0.7;
        spreads[i] = Math.min(0.28, Math.max(-0.28, spreads[i] + (Math.random() - 0.5) * 0.25));
        fill(i);
        const after = crowding(i);
        const warm = 1 - it / tries;
        if (after > before * (1 + 0.15 * warm * Math.random())) {
          offs[i] = was.o;
          spreads[i] = was.s;
          at[i] = was.a;
        }
      }
      bodies.forEach((b, i) => {
        b.offset = base[i] + offs[i];
        b.spread = spreads[i];
      });
    };

    const place = (b: Body, turn: number) => {
      b.theta = b.offset + turn;
      const p = onRing(b.size, lanes, b.lane, b.spread, b.theta, g);
      b.x = p.x;
      b.y = p.y;
      b.half = p.half;
      b.k = p.k;
    };

    let lastFrame = 0;
    const draw = (turn: number, now: number) => {
      const dt = Math.min(0.05, Math.max(0, (now - lastFrame) / 1000));
      lastFrame = now;
      const ease = 1 - Math.exp(-dt * 6);
      bodies.forEach((b, i) => {
        place(b, turn);
        // the pointer pushes icons away a little, eased in and out
        let tx = 0;
        let ty = 0;
        if (pointer) {
          const dx = b.x - pointer.x;
          const dy = b.y - pointer.y;
          const d = Math.hypot(dx, dy) || 1;
          const k = smooth((POINTER_REACH + b.half - d) / POINTER_REACH);
          tx = (dx / d) * k * 70;
          ty = (dy / d) * k * 70;
        }
        b.ox += (tx - b.ox) * ease;
        b.oy += (ty - b.oy) * ease;
        const el = els[i];
        if (!el) return;
        const s = b.size * g.vs;
        el.style.width = `${s}px`;
        el.style.height = `${s}px`;
        el.style.transform = `translate3d(${(b.x + b.ox - s / 2).toFixed(2)}px, ${(b.y + b.oy - s / 2).toFixed(2)}px, 0) scale(${b.k.toFixed(4)})`;
        el.style.opacity = (0.55 + 0.45 * near(b.theta)).toFixed(3);
      });
    };

    measure();
    arrange();
    draw(0, performance.now());

    if (!animate) return; // reduced motion: they stay where they were put

    let raf = 0;
    let turn = 0;
    let last = 0;
    let spin = 0; // extra turning from a flick of the finger, in radians per second; it dies away on its own
    const loop = (now: number) => {
      // the clock, not a count of frames, drives the turn, so a slow frame never slows the tornado down (it just draws it where it should be)
      if (last) {
        const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
        turn += (OMEGA + spin) * dt;
        spin *= Math.exp(-dt * 1.3);
      }
      last = now;
      draw(turn, now);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    let first = true; // the observer reports once as soon as it starts, when everything has just been arranged
    const ro = new ResizeObserver(() => {
      if (first) {
        first = false;
        return;
      }
      measure();
      arrange();
    });
    ro.observe(root);

    // on a phone, dragging a finger across the screen spins the tornado, and letting go flicks it on
    let drag: { id: number; x: number; t: number } | null = null;
    const onDown = (e: PointerEvent) => {
      if (e.pointerType !== "touch" || (e.target as HTMLElement).closest("a")) return;
      drag = { id: e.pointerId, x: e.clientX, t: e.timeStamp };
    };
    const onDrag = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return;
      const dt = Math.max(1, e.timeStamp - drag.t) / 1000;
      const dx = e.clientX - drag.x;
      turn += dx * 0.006; // follows the finger
      spin = Math.max(-5, Math.min(5, (dx / dt) * 0.006)); // and keeps going at the finger's speed when it lets go
      drag = { id: drag.id, x: e.clientX, t: e.timeStamp };
    };
    const onUp = (e: PointerEvent) => {
      if (drag && e.pointerId === drag.id) drag = null;
    };
    if (compact) {
      root.addEventListener("pointerdown", onDown);
      root.addEventListener("pointermove", onDrag);
      root.addEventListener("pointerup", onUp);
      root.addEventListener("pointercancel", onUp);
    }

    const onMove = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      const r = root.getBoundingClientRect();
      pointer = { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const onLeave = () => (pointer = null);
    root.addEventListener("pointermove", onMove);
    root.addEventListener("pointerleave", onLeave);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      root.removeEventListener("pointermove", onMove);
      root.removeEventListener("pointerleave", onLeave);
      root.removeEventListener("pointerdown", onDown);
      root.removeEventListener("pointermove", onDrag);
      root.removeEventListener("pointerup", onUp);
      root.removeEventListener("pointercancel", onUp);
    };
  }, [section, icons, sizes, animate, compact]);
}
