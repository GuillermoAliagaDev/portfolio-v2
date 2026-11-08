"use client";
import { CSSProperties, ReactNode, useEffect, useState, useSyncExternalStore } from "react";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { ScrambleCell, scrambleDuration, useScrambleText } from "../../hooks/useScrambleText";
import { HEADLINE_LINES, HEADLINE_WORDS, LETTER_STAGGER_MS, SIGNATURE_LINES, WORD_ANIMATION, WORD_HOLD_MS } from "../../constants/headlineWords";

// ?word=roll or ?word=scramble in the address overrides the default, to compare the two animations
const noSubscribe = () => () => {};
const wordAnimation = () => {
  const q = new URLSearchParams(window.location.search).get("word");
  return q === "roll" || q === "scramble" ? q : WORD_ANIMATION;
};

const FIRST_LETTER_MS = 250; // the first letter waits for the page to settle
const LINE_STEP = LETTER_STAGGER_MS * 0.8;
const WORD_START_MS = FIRST_LETTER_MS + HEADLINE_LINES.reduce((sum, line) => sum + line.length * LINE_STEP, 0) + 80;

type LettersProps = { text: string; className: string; start?: number };

// one span per letter so each can move on its own, a little later than the one before it
function Letters({ text, className, start = 0 }: LettersProps) {
  return (
    <>
      {[...text].map((ch, i) => (
        <span
          key={i}
          aria-hidden
          className={`${className} inline-block whitespace-pre`}
          style={{ "--d": `${start + i * LETTER_STAGGER_MS}ms` } as CSSProperties}
        >
          {ch}
        </span>
      ))}
    </>
  );
}

// a line that hides whatever is below or above it, so letters seem to rise out of (and sink into) the line itself.
// The padding keeps descenders (g, p) from being cut; the negative margin gives the space back.
function Line({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <span className={`block overflow-hidden pb-[0.18em] -mb-[0.18em] pt-[0.05em] -mt-[0.05em] ${className}`}>{children}</span>;
}

// the word while it decodes: letters that have not settled yet are dim turquoise, and each one flashes as it lands
function ScrambleRows({ cells }: { cells: ScrambleCell[] }) {
  const rows: ScrambleCell[][] = [[]];
  for (const c of cells) c.ch === "\n" ? rows.push([]) : rows[rows.length - 1].push(c);
  return (
    <>
      {rows.map((row, r) => (
        <Line key={r} className="min-h-[1.05em] whitespace-pre font-[family-name:var(--font-bitcount)] font-medium text-[var(--word-color)]">
          {row.length === 0 && "\u00a0"}
          {row.map((c, i) => (
            <span key={i} aria-hidden className={`inline-block ${c.settled ? "sc-set" : "sc-flicker"}`}>
              {c.ch}
            </span>
          ))}
        </Line>
      ))}
    </>
  );
}

/** Top left: "exceeding the limits of" and, below it, a word that keeps changing. Bottom right: the signature. */
export function IntroHeadline({ visible }: { visible: boolean }) {
  const reduced = useReducedMotion();
  const [index, setIndex] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const [cycled, setCycled] = useState(false); // false until the first word has been replaced
  const word = HEADLINE_WORDS[index];
  const mode = useSyncExternalStore(noSubscribe, wordAnimation, () => WORD_ANIMATION);
  const scramble = mode === "scramble" && !reduced;
  const scrambled = useScrambleText(word, scramble, WORD_START_MS);

  useEffect(() => {
    if (!scramble || !visible) return;
    // the word stays for WORD_HOLD_MS once it has settled, then the next one decodes over it
    const id = setTimeout(() => setIndex((i) => (i + 1) % HEADLINE_WORDS.length), scrambleDuration("", word) + WORD_HOLD_MS);
    return () => clearTimeout(id);
  }, [index, scramble, visible, word]);

  useEffect(() => {
    if (scramble || reduced || !visible) return;
    const exitMs = word.length * LETTER_STAGGER_MS + 520;
    const wait = setTimeout(() => setLeaving(true), WORD_HOLD_MS);
    const swap = setTimeout(() => {
      setIndex((i) => (i + 1) % HEADLINE_WORDS.length);
      setLeaving(false);
      setCycled(true);
    }, WORD_HOLD_MS + exitMs);
    return () => {
      clearTimeout(wait);
      clearTimeout(swap);
    };
  }, [index, scramble, reduced, visible, word.length]);

  const enter = reduced ? "" : "hl-in";
  const size = "text-[clamp(2.5rem,9.5vw,5.625rem)] leading-[1.05] font-[family-name:var(--font-line-seed)] font-bold text-white";
  const fade = `transition-[opacity,filter,transform] duration-700 ease-out ${visible ? "opacity-100" : "opacity-0 blur-md"}`;

  let at = FIRST_LETTER_MS;
  const leadLines = HEADLINE_LINES.map((line) => {
    const start = at;
    at += line.length * LINE_STEP;
    return { line, start };
  });
  const wordStart = WORD_START_MS;
  const sigStart = wordStart + 500;

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
        {scramble && <ScrambleRows cells={scrambled} />}
        {!scramble && word.split("\n").map((row, r, rows) => {
          const before = rows.slice(0, r).join("").length; // letters on the rows above, so the stagger carries on down
          return (
            <Line key={`${word}-${r}`} className="font-[family-name:var(--font-bitcount)] font-medium text-[var(--word-color)]">
              {row.split(" ").map((part, i, parts) => (
                // each word stays whole when a line wraps
                <span key={i} className={`inline-block whitespace-nowrap ${i < parts.length - 1 ? "mr-[0.25em]" : ""}`}>
                  <Letters
                    text={part}
                    start={(cycled ? 0 : wordStart) + (before + parts.slice(0, i).join(" ").length) * LETTER_STAGGER_MS}
                    className={reduced ? "" : leaving ? "hl-out" : "hl-in"}
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
