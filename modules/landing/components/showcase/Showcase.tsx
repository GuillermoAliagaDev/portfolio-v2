"use client";
import Image from "next/image";
import { DotImage } from "@/components/ascii/DotImage";
import { CSSProperties, useRef } from "react";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { COMPACT_LABELS, SCULPTURE, SHOWCASE_ICONS, SHOWCASE_LABELS } from "../../constants/showcase";
import { useIconSwirl } from "../../hooks/useIconSwirl";
import { Letters } from "../intro/IntroHeadline";
import { Marquee } from "./Marquee";

const sizes = SHOWCASE_ICONS.map((i) => i.size);

/** The screen after the explosion: the four sections as big words, dotted tech icons circling them, a sculpture and a marquee. */
export function Showcase() {
  const reduced = useReducedMotion();
  const section = useRef<HTMLElement>(null);
  const icons = useRef<(HTMLElement | null)[]>([]);
  const phone = useMediaQuery("(max-width: 767px)");
  const labels = phone ? COMPACT_LABELS : SHOWCASE_LABELS;
  useIconSwirl(section, icons, sizes, !reduced, phone);

  return (
    <section
      ref={section}
      className="sh-fade relative h-svh w-full touch-none overflow-hidden bg-black"
      onPointerMove={(e) => {
        // the sculpture leans a little away from the pointer
        const r = e.currentTarget.getBoundingClientRect();
        e.currentTarget.style.setProperty("--px", String((e.clientX - r.left) / r.width - 0.5));
        e.currentTarget.style.setProperty("--py", String((e.clientY - r.top) / r.height - 0.5));
      }}
    >
      {/* in front of the icons and the marquee: both pass behind it, so its dark parts hide them */}
      <div className="sh-lean pointer-events-none absolute bottom-[-12svh] left-1/2 z-20 h-[44svh] md:bottom-[-31svh] md:h-[73svh]">
        <div className="sh-head h-full" style={{ aspectRatio: `${SCULPTURE.width} / ${SCULPTURE.height}` }}>
          <DotImage src={SCULPTURE.src} pitch={phone ? 2 : 3} gamma={0.7} className="size-full select-none" />
        </div>
      </div>

      {SHOWCASE_ICONS.map((icon, i) => (
        <div
          key={icon.name}
          ref={(el) => {
            icons.current[i] = el;
          }}
          aria-hidden
          className="pointer-events-none absolute left-0 top-0 z-[5] will-change-transform"
        >
          <Image
            src={icon.src}
            width={256}
            height={256}
            alt=""
            unoptimized
            draggable={false}
            className="sh-pop size-full select-none"
            style={{ "--d": `${500 + i * 70}ms` } as CSSProperties}
          />
        </div>
      ))}

      <nav aria-label="Sections">
        {labels.map(({ label, href, x, y }, n) => (
          <div key={label} className="absolute z-10 -translate-x-1/2 -translate-y-1/2" style={{ left: `${x}%`, top: `${y}%` }}>
            <a
              data-obstacle
              href={href}
              aria-label={label}
              className="sh-bob block whitespace-nowrap font-[family-name:var(--font-jetbrains)] text-[clamp(2.25rem,12.5vw,3.25rem)] leading-[1.1] font-bold text-[#ff4000] max-md:px-3 max-md:py-1 max-md:active:scale-95 max-md:active:text-white md:text-[clamp(1.75rem,6.25vw,5.625rem)] transition-colors duration-300 hover:text-white focus-visible:text-white focus-visible:outline-none"
              style={{ "--bob": `${6 + n * 1.5}s`, "--bob-delay": `${-n * 1.7}s` } as CSSProperties}
            >
              <Letters text={label} start={300 + n * 160} step={60} className="bl-in" />
            </a>
          </div>
        ))}
      </nav>

      <Marquee />

      {phone && (
        <p aria-hidden className="sh-hint pointer-events-none absolute left-0 right-0 top-[max(1rem,env(safe-area-inset-top))] z-30 text-center text-[0.7rem] uppercase tracking-[0.3em] text-white/60">
          ↻ drag to spin
        </p>
      )}
    </section>
  );
}
