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
