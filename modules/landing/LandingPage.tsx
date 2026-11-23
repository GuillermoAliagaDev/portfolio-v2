"use client";
import { useCallback, useState, useSyncExternalStore } from "react";
import { IntroCanvas } from "./components/intro/IntroCanvas";
import { Showcase } from "./components/showcase/Showcase";

// ?showcase in the address skips the intro, to work on the next screen
const noSubscribe = () => () => {};
const skipIntro = () => new URLSearchParams(window.location.search).has("showcase");

export function LandingPage() {
  const [revealed, setRevealed] = useState(false);
  const forced = useSyncExternalStore(noSubscribe, skipIntro, () => false);
  const onRevealed = useCallback(() => setRevealed(true), []);

  return <main>{revealed || forced ? <Showcase /> : <IntroCanvas onRevealed={onRevealed} />}</main>;
}
