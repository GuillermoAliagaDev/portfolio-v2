export const HEADLINE_LINES = ["exceeding the", "limits of"] as const; // top left
export const SIGNATURE_LINES = ["guillermo", "@liaga"] as const; // bottom right

/** A "\n" in a word puts what follows on a new line. The word in the braces cycles through this list. Edit the list to change the words. */
export const HEADLINE_WORDS = [
  "AI",
  "Data",
  "Architecture",
  "IoT",
  "Edge",
  "Deployment",
  "Infrastructure",
  "Interface",
  "Performance",
  "Full Stack",
  "Forward\nEngineering",
] as const;

export const WORD_HOLD_MS = 2600; // how long a word stays
export const LETTER_STAGGER_MS = 38; // delay between letters

/** How the word changes: "scramble" = letters flicker through random glyphs and settle one by one,
 *  "roll" = letters lift out of the line and the next word rises in. ?word=roll in the address overrides it. */
export const WORD_ANIMATION: "scramble" | "roll" = "scramble";
