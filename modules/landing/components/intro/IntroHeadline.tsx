"use client";
import { CSSProperties, useEffect, useState } from "react";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { HEADLINE_LEAD, HEADLINE_WORDS, LETTER_STAGGER_MS, WORD_HOLD_MS } from "../../constants/headlineWords";

type LettersProps = { text: string; className: string; start?: number };

// one span per letter so each can animate on its own, delayed a little more than the one before it
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

/** "exceeding the limits of {word}": the lead-in types on when the page loads, the word in braces keeps changing. */
export function IntroHeadline({ visible }: { visible: boolean }) {
  const reduced = useReducedMotion();
  const [index, setIndex] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const [cycled, setCycled] = useState(false); // false until the first word has been replaced
  const word = HEADLINE_WORDS[index];

  useEffect(() => {
    if (reduced || !visible) return;
    const exitMs = word.length * LETTER_STAGGER_MS + 400;
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
  }, [index, reduced, visible, word.length]);

  const lead = HEADLINE_LEAD.split(" ");
  let at = 300; // the first letter waits for the page to settle
  return (
    <h1
      aria-label={`${HEADLINE_LEAD} ${word}`}
      className={`pointer-events-none absolute left-0 top-0 z-10 max-w-full px-[5vw] pt-[max(8svh,4.5rem)] font-[family-name:var(--font-line-seed)] text-[clamp(2.5rem,9.5vw,6rem)] font-bold leading-[1.05] text-white transition-[opacity,filter] duration-700 ${visible ? "opacity-100" : "opacity-0 blur-md"}`}
    >
      {lead.map((w, i) => {
        const start = at;
        at += (w.length + 1) * LETTER_STAGGER_MS;
        return (
          <span key={i} className="mr-[0.25em] inline-block whitespace-nowrap">
            <Letters text={w} start={start} className={reduced ? "" : "hl-in"} />
          </span>
        );
      })}
      <br />
      <Letters text="{" start={at} className={reduced ? "" : "hl-in"} />
      <span className="font-[family-name:var(--font-bitcount)] font-medium">
        {word.split(" ").map((part, i, parts) => (
          // each word stays whole when the line wraps; letters of a new word start at the same delay
          <span key={`${word}-${i}`} className={`inline-block whitespace-nowrap ${i < parts.length - 1 ? "mr-[0.25em]" : ""}`}>
            <Letters
              text={part}
              start={(cycled ? 0 : at + LETTER_STAGGER_MS) + parts.slice(0, i).join(" ").length * LETTER_STAGGER_MS}
              className={reduced ? "" : leaving ? "hl-out" : "hl-in"}
            />
          </span>
        ))}
      </span>
      <Letters text="}" start={at + LETTER_STAGGER_MS * 2} className={reduced ? "" : "hl-in"} />
    </h1>
  );
}
