"use client";
import { useCallback, useEffect, useState } from "react";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import type { IntroPhase } from "../types/introTypes";

const EXPLODE_MS = 2800;

/** The black hole waits until the visitor clicks it (or skips); there is no auto-explode timer. */
export function useIntroSequence() {
  const reduced = useReducedMotion();
  const [phase, setPhase] = useState<IntroPhase>("idle");

  const explode = useCallback(() => setPhase((p) => (p === "idle" ? "exploding" : p)), []);
  const skip = useCallback(() => setPhase("revealed"), []);

  useEffect(() => {
    if (reduced) setPhase("revealed");
  }, [reduced]);

  useEffect(() => {
    if (phase !== "exploding") return;
    const id = setTimeout(() => setPhase("revealed"), EXPLODE_MS);
    return () => clearTimeout(id);
  }, [phase]);

  return { phase, explode, skip, reduced };
}
