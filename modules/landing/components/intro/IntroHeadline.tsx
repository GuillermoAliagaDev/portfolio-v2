"use client";
import { CSSProperties, ReactNode, useEffect, useState } from "react";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { HEADLINE_LINES, HEADLINE_WORDS, LETTER_STAGGER_MS, SIGNATURE_LINES, WORD_HOLD_MS } from "../../constants/headlineWords";

const BLUR_STEP_MS = 55; // gap between one letter blurring in and the next
const BLUR_OUT_MS = 380; // how long the old word takes to blur away

const FIRST_LETTER_MS = 250; // the first letter waits for the page to settle
const LINE_STEP = LETTER_STAGGER_MS * 0.8;
const WORD_START_MS = FIRST_LETTER_MS + HEADLINE_LINES.reduce((sum, line) => sum + line.length * LINE_STEP, 0) + 80;

type LettersProps = { text: string; className: string; start?: number; step?: number };

// one span per letter so each can move on its own, a little later than the one before it
export function Letters({ text, className, start = 0, step = LETTER_STAGGER_MS }: LettersProps) {
  return (
    <>
      {[...text].map((ch, i) => (
        <span
          key={i}
          aria-hidden
          className={`${className} inline-block whitespace-pre`}
          style={{ "--d": `${start + i * step}ms` } as CSSProperties}
        >
          {ch}
        </span>
      ))}
    </>
  );
}

// a line that hides whatever is below or above it, so letters seem to rise out of the line itself.
// The padding keeps descenders (g, p) from being cut; the negative margin gives the space back.
function Line({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <span className={`block overflow-hidden pb-[0.18em] -mb-[0.18em] pt-[0.05em] -mt-[0.05em] ${className}`}>{children}</span>;
}

/** Top left: "exceeding the limits of" and, below it, a word that keeps changing. Bottom right: the signature. */
export function IntroHeadline({ visible }: { visible: boolean }) {
  const reduced = useReducedMotion();
  const [index, setIndex] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const [cycled, setCycled] = useState(false); // false until the first word has been replaced
  const word = HEADLINE_WORDS[index];

  useEffect(() => {
    if (reduced || !visible) return;
    // the word stays for WORD_HOLD_MS, blurs out, and the next one blurs in letter by letter
    const wait = setTimeout(() => setLeaving(true), WORD_HOLD_MS);
    const swap = setTimeout(() => {
      setIndex((i) => (i + 1) % HEADLINE_WORDS.length);
      setLeaving(false);
      setCycled(true);
    }, WORD_HOLD_MS + BLUR_OUT_MS);
    return () => {
      clearTimeout(wait);
      clearTimeout(swap);
    };
  }, [index, reduced, visible]);

  const enter = reduced ? "" : "hl-in";
  const size = "text-[clamp(2.5rem,9.5vw,4.375rem)] leading-[1.05] font-[family-name:var(--font-line-seed)] font-bold text-white";
  const fade = `transition-[opacity,filter,transform] duration-700 ease-out ${visible ? "opacity-100" : "opacity-0 blur-md"}`;

  const leadLines = HEADLINE_LINES.map((line, i) => ({
    line,
    start: FIRST_LETTER_MS + HEADLINE_LINES.slice(0, i).reduce((sum, l) => sum + l.length * LINE_STEP, 0),
  }));
  const sigStart = WORD_START_MS + 500;

  return (
    <>
      <h1
        aria-label={`${HEADLINE_LINES.join(" ")} ${word.replace("\n", " ")}`}
        className={`pointer-events-none absolute left-0 top-0 z-10 max-w-full px-[5vw] pt-[max(8svh,4.5rem)] ${size} ${fade}`}
      >
        {leadLines.map(({ line, start }) => (
          <Line key={line}>
            <Letters text={line} start={start} className={enter} />
          </Line>
        ))}
        {word.split("\n").map((row, r, rows) => {
          const before = rows.slice(0, r).join("").length; // letters on the rows above, so the stagger carries on down
          return (
            <Line key={`${word}-${r}`} className="font-[family-name:var(--font-jetbrains)] font-bold text-[var(--word-color)]">
              {row.split(" ").map((part, i, parts) => (
                // each word stays whole when a line wraps
                <span key={i} className={`inline-block whitespace-nowrap ${i < parts.length - 1 ? "mr-[0.25em]" : ""}`}>
                  <Letters
                    text={part}
                    step={BLUR_STEP_MS}
                    start={(cycled ? 0 : WORD_START_MS) + (before + parts.slice(0, i).join(" ").length) * BLUR_STEP_MS}
                    className={reduced ? "" : leaving ? "bl-out" : "bl-in"}
                  />
                </span>
              ))}
            </Line>
          );
        })}
      </h1>
      <p
        aria-label={SIGNATURE_LINES.join(" ")}
        className={`pointer-events-none absolute bottom-[max(4.5rem,calc(env(safe-area-inset-bottom)+3.5rem))] right-0 z-10 max-w-full px-[5vw] text-right ${size} ${fade}`}
      >
        {SIGNATURE_LINES.map((line, n) => (
          <Line key={line}>
            <Letters text={line} start={sigStart + n * 260} className={enter} />
          </Line>
        ))}
      </p>
    </>
  );
}
