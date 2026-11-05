"use client";
import { useCallback, useRef } from "react";

// zoom = reference pixels per M (black hole size on screen); higher = closer
// on a tall (phone) screen the hole is sized by the narrow side, so it is brought closer to fill the width
export const portraitBoost = (width: number, height: number) => (height > width ? 1.35 : 1);
export const REST_ZOOM = 10; // resting view (was 13: the black hole is about a quarter smaller)
export const PLUNGE_ZOOM = 160; // end of the fall-in: the shadow fills the screen (keep above ~110)
export const REST_ELEV = 9; // resting camera elevation above the disk plane, degrees
export const BOOM_S = 2.5; // length of the explosion
export const DEG = Math.PI / 180;
const ELEV_LIMIT = 70;
const MAX_STEP_PX = 40; // largest pointer jump (px) applied in one event
const MAX_SPIN = 2.2; // fastest coasting spin after a flick, rad/s
const YAW_PER_PX = 0.0035; // radians the view turns per pixel dragged sideways (a full-width swipe is about 4.5 rad)
const ELEV_PER_PX = 0.18; // degrees the viewing angle changes per pixel dragged up or down

export const sstep = (a: number, b: number, x: number) => {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1);
  return t * t * (3 - 2 * t);
};

/** Everything that changes during the explosion, from t = seconds since the click / BOOM_S (or -1 when idle). */
export function explosionState(t: number) {
  const tb = Math.max(t, 0);
  const fall = Math.min(tb / 0.48, 1) ** 2.2;
  return {
    t,
    tb,
    fall,
    // anticipation: the view pulls back for a moment before it plunges, and the bloom of light shakes the frame
    pull: 0.07 * Math.sin(Math.PI * Math.min(tb / 0.14, 1)) * (tb < 0.14 ? 1 : 0),
    shake: 0.03 * Math.exp(-Math.max(tb - 0.36, 0) * 14) * sstep(0.34, 0.37, tb) * Math.sin((tb - 0.36) * 95),
    gain: 1 + 0.9 * sstep(0, 0.35, tb),
    stars: 1 - sstep(0.1, 0.4, tb),
    ringW: 1 + 1.5 * fall,
    roll: (12 + 30 * fall) * DEG,
    zoom: REST_ZOOM * (PLUNGE_ZOOM / REST_ZOOM) ** fall,
  };
}

/**
 * The camera behind the black hole: drag to orbit (with a gentle inertia), a slow idle drift when nobody is touching it, and a
 * settle back to the resting tilt. `update` is called once per frame and returns the yaw and the elevation (radians) to draw.
 */
export function useOrbitCamera() {
  const cam = useRef({
    yaw: 0, elev: REST_ELEV, dYaw: 0, dElev: REST_ELEV, vYaw: 0, vElev: 0,
    dragging: false, held: false, last: 0, touched: -99, moves: 0,
    idleAmt: 0, driftYaw: 0, // how much of the idle motion is on (eased 0..1) and the yaw it has built up
  });

  /** Orbit by a pointer delta in CSS px (dx: around the hole, dy: above/below the disk). */
  const rotate = useCallback((dx: number, dy: number) => {
    const s = cam.current;
    // one pointer event can carry a huge jump (a lagging frame, a touch glitch): never turn more than a fixed step
    const cx = Math.min(Math.max(dx, -MAX_STEP_PX), MAX_STEP_PX);
    const cy = Math.min(Math.max(dy, -MAX_STEP_PX), MAX_STEP_PX);
    s.yaw += cx * YAW_PER_PX;
    s.elev = Math.min(Math.max(s.elev + cy * ELEV_PER_PX, -ELEV_LIMIT), ELEV_LIMIT);
    s.moves++;
    const now = performance.now();
    const dt = Math.min(Math.max((now - s.last) / 1000, 1 / 60), 0.1);
    // release speed = smoothed recent speed, capped, so a flick coasts gently instead of spinning wildly
    s.vYaw += ((cx * YAW_PER_PX) / dt - s.vYaw) * 0.3;
    s.vElev += ((cy * ELEV_PER_PX) / dt - s.vElev) * 0.3;
    s.vYaw = Math.min(Math.max(s.vYaw, -MAX_SPIN), MAX_SPIN);
    s.vElev = Math.min(Math.max(s.vElev, -MAX_SPIN * 18), MAX_SPIN * 18);
    s.last = now;
    s.touched = now / 1000;
  }, []);

  const setDragging = useCallback((dragging: boolean) => {
    const s = cam.current;
    s.dragging = dragging;
    s.touched = performance.now() / 1000;
    if (dragging) {
      s.vYaw = 0;
      s.vElev = 0;
      s.moves = 0;
      s.last = performance.now();
    } else if (performance.now() - s.last > 70 || s.moves < 4) {
      s.vYaw = 0; // released without a flick (or after fewer than 4 moves: a glitch, not a throw)
      s.vElev = 0;
    }
  }, []);

  /** a finger or button is down (even without moving): the camera stays put and the idle motion waits */
  const setHeld = useCallback((held: boolean) => {
    const s = cam.current;
    s.held = held;
    s.touched = performance.now() / 1000;
  }, []);

  const update = useCallback((now: number, dt: number, exploding: boolean) => {
    const s = cam.current;
    if (s.held || s.dragging) s.touched = now;
    if (!s.dragging) {
      // inertia after a flick
      s.yaw += s.vYaw * dt;
      s.elev = Math.min(Math.max(s.elev + s.vElev * dt, -ELEV_LIMIT), ELEV_LIMIT);
      const decay = Math.exp(-dt * 4.5);
      s.vYaw *= decay;
      s.vElev *= decay;
      // a few seconds after the last touch the camera settles back to its resting tilt
      if (now - s.touched > 2.5 && Math.abs(s.vYaw) < 0.05) s.elev += (REST_ELEV - s.elev) * (1 - Math.exp(-dt * 0.6));
    }
    // the drawn camera follows the wanted one with a little weight, so drags feel smooth instead of twitchy
    const follow = 1 - Math.exp(-dt * 14);
    s.dYaw += (s.yaw - s.dYaw) * follow;
    s.dElev += (s.elev - s.dElev) * follow;
    // idle life: the camera never sits perfectly still - a slow orbit and a gentle bob of the viewing angle.
    // The idle amount eases between 0 and 1 and the drift ACCUMULATES from it, so touching or letting go never makes the
    // view jump: the motion just fades out and in.
    const idleTarget = now - s.touched > 1.2 && !exploding ? 1 : 0;
    s.idleAmt += (idleTarget - s.idleAmt) * (1 - Math.exp(-dt * (s.held || s.dragging ? 7 : 1.6))); // stops quickly when touched, returns slowly
    s.driftYaw += 0.035 * s.idleAmt * dt;
    const driftElev = (2.2 * Math.sin(now * 0.31) + 0.8 * Math.sin(now * 0.83 + 1.3)) * s.idleAmt;
    return {
      yaw: s.dYaw + s.driftYaw,
      elev: Math.min(Math.max(s.dElev + driftElev, -ELEV_LIMIT), ELEV_LIMIT) * DEG,
    };
  }, []);

  return { rotate, setDragging, setHeld, update };
}
