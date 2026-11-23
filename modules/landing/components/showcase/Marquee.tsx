import { MARQUEE_TEXT } from "../../constants/showcase";

// two identical halves side by side; the strip slides left by exactly one half and starts over, so it never shows a seam
const half = MARQUEE_TEXT.repeat(2);

/** The strip of white text that runs across the screen, in front of the sculpture. */
export function Marquee() {
  return (
    <div
      data-floor
      aria-label={MARQUEE_TEXT.replaceAll("·", "-").trim()}
      className="pointer-events-none absolute inset-x-0 top-[82%] z-[15] md:top-[79%] overflow-hidden whitespace-pre font-[family-name:var(--font-line-seed)] text-[clamp(1.75rem,7vw,5.625rem)] md:text-[clamp(1.75rem,6.25vw,5.625rem)] leading-[1.15] font-bold text-white"
    >
      <div aria-hidden className="sh-marquee flex w-max">
        <span>{half}</span>
        <span>{half}</span>
      </div>
    </div>
  );
}
