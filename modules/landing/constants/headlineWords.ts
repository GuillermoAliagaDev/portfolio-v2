export const HEADLINE_LINES = ["exceeding the", "limits of"] as const; // top left
export const SIGNATURE_LINES = ["guillermo", "@liaga"] as const; // bottom right

/** A "\n" in a word puts what follows on a new line. The changing word cycles through this list, in lowercase. Edit the list to change the words. */
export const HEADLINE_WORDS = [
  "ai",
  "data",
  "architecture",
  "iot",
  "edge",
  "deployment",
  "infrastructure",
  "interface",
  "performance",
  "full stack",
  "forward\nengineering",
] as const;

export const WORD_HOLD_MS = 2600; // how long a word stays
export const LETTER_STAGGER_MS = 38; // delay between letters

/** How the word changes: "blur" = every letter blurs in one after another (and blurs out again), "slide" = the whole word slides up out of its line and the next one slides in from below,
 *  "scramble" = letters flicker through random glyphs and settle one by one,
 *  "roll" = the letters lift out one by one and the next word rises in. ?word=slide|scramble|roll in the address overrides it. */
export type WordAnimation = "blur" | "slide" | "scramble" | "roll";
export const WORD_ANIMATION: WordAnimation = "blur";
