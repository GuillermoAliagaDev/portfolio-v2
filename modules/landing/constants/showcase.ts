export type ShowcaseIcon = { name: string; src: string; size: number };
export type ShowcaseLabel = { label: string; href: string; x: number; y: number }; // x, y: centre, in % of the screen

// the bigger icons (120px); every other one is 80px
const LARGE = new Set(["typescript", "python", "terraform", "aws", "claude", "docker", "postgre"]);
const ICON_NAMES = [
  "typescript", "react", "python", "angular", "terraform", "nodejs", "aws", "tailwind", "claude", "git",
  "docker", "js", "postgre", "graphql", "java", "mongo", "ubuntu", "supabase", "astro", "ansible",
  "postman", "arduino", "raspi", "android", "railway", "gitlab", "hermes", "xcode", "codex", "linux",
];

export const ICON_SIZE_LARGE = 120;
export const ICON_SIZE_SMALL = 80;

export const SHOWCASE_ICONS: ShowcaseIcon[] = ICON_NAMES.map((name) => ({
  name,
  src: `/images/icons/${name}.png`,
  size: LARGE.has(name) ? ICON_SIZE_LARGE : ICON_SIZE_SMALL,
}));

export const SHOWCASE_LABELS: ShowcaseLabel[] = [
  { label: "about", href: "#about", x: 25.6, y: 29 },
  { label: "skills", href: "#skills", x: 65.6, y: 27 },
  { label: "projects", href: "#projects", x: 46.6, y: 41 },
  { label: "blog", href: "#blog", x: 75.6, y: 41 },
];

// on a phone the words zig-zag down the middle, big enough to tap
export const COMPACT_LABELS: ShowcaseLabel[] = [
  { label: "about", href: "#about", x: 41, y: 21 },
  { label: "skills", href: "#skills", x: 60, y: 30 },
  { label: "projects", href: "#projects", x: 42, y: 39 },
  { label: "blog", href: "#blog", x: 58, y: 48 },
];

export const MARQUEE_TEXT = "NEW ERA · NEW VISION · NEW THINKING · ";

export const SCULPTURE = { src: "/images/sculpture.webp", width: 1082, height: 1423 };
