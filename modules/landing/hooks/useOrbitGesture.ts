"use client";
import { KeyboardEvent, PointerEvent, useCallback, useRef } from "react";

const MOVE_PX = 6; // further than this is a drag, not a click
const HOLD_MS = 350; // pressing longer than this is a hold, not a click

type Options = {
  rotate: (dx: number, dy: number) => void;
  setDragging: (dragging: boolean) => void;
  onActivate: () => void;
  /** a pointer is down (true) or released/cancelled (false), whether or not it moved */
  onHold?: (held: boolean) => void;
};

/** Hold and drag to orbit; a quick click (or Enter/Space) activates. Arrow keys orbit too. */
export function useOrbitGesture({ rotate, setDragging, onActivate, onHold }: Options) {
  const press = useRef<{ id: number; x: number; y: number; at: number; dragging: boolean } | null>(null);
  const suppressClick = useRef(false);

  const onPointerDown = useCallback(
    (e: PointerEvent<HTMLElement>) => {
      if (e.button !== 0 || press.current) return; // one finger at a time: extra touches would make the view jump
      press.current = { id: e.pointerId, x: e.clientX, y: e.clientY, at: performance.now(), dragging: false };
      suppressClick.current = false;
      e.currentTarget.setPointerCapture(e.pointerId);
      onHold?.(true);
    },
    [onHold],
  );

  const onPointerMove = useCallback(
    (e: PointerEvent<HTMLElement>) => {
      const p = press.current;
      if (!p || p.id !== e.pointerId) return;
      const dx = e.clientX - p.x;
      const dy = e.clientY - p.y;
      if (!p.dragging) {
        if (Math.hypot(dx, dy) < MOVE_PX) return;
        p.dragging = true;
        setDragging(true);
      }
      rotate(dx, dy);
      p.x = e.clientX;
      p.y = e.clientY;
    },
    [rotate, setDragging],
  );

  const end = useCallback(
    (e: PointerEvent<HTMLElement>) => {
      const p = press.current;
      if (!p || p.id !== e.pointerId) return;
      press.current = null;
      if (p.dragging) setDragging(false);
      onHold?.(false);
      // a drag or a long hold must not also count as a click
      suppressClick.current = p.dragging || performance.now() - p.at > HOLD_MS || e.type === "pointercancel";
    },
    [setDragging, onHold],
  );

  const onClick = useCallback(() => {
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    onActivate();
  }, [onActivate]);

  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLElement>) => {
      const step = 24;
      const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step / 3], ArrowDown: [0, step / 3] }[e.key];
      if (!d) return;
      e.preventDefault();
      rotate(d[0], d[1]);
    },
    [rotate],
  );

  // lost capture also ends the press, so a missed pointerup can never leave the gesture stuck
  return { onPointerDown, onPointerMove, onPointerUp: end, onPointerCancel: end, onLostPointerCapture: end, onClick, onKeyDown };
}
