"use client";

/**
 * The words, bottom of screen, karaoke style.
 *
 * DOM rather than in-world text: this is the payoff of the joke and it should
 * be perfectly legible at any camera angle, which a billboarded mesh in a
 * three-quarter view is not.
 *
 * Polls the audio clock on a frame loop but only ever calls setState when the
 * LINE changes — about once every two seconds — so the rest of the page is not
 * re-rendering at 60Hz for the sake of a subtitle.
 */
import { useEffect, useRef, useState } from "react";

import { BEATS_PER_BAR, LYRICS, TOTAL_BEATS } from "./song";

export default function Lyrics({ beat }: { beat: () => number }) {
  const [line, setLine] = useState<string | null>(null);
  const shown = useRef<string | null>(null);

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const b = beat();
      let next: string | null = null;
      if (b >= 0) {
        // The clock runs a hair past the end before the scheduler wraps it.
        const wrapped = ((b % TOTAL_BEATS) + TOTAL_BEATS) % TOTAL_BEATS;
        const bar = Math.floor(wrapped / BEATS_PER_BAR) + 1;
        const hit = LYRICS.find((l) => bar >= l.bar && bar < l.bar + l.bars);
        next = hit?.text ?? null;
      }
      if (next !== shown.current) {
        shown.current = next;
        setLine(next);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [beat]);

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-16 flex justify-center px-6">
      <div
        className={`max-w-[46rem] text-center font-semibold tracking-tight text-white transition-opacity duration-300 ${
          line ? "opacity-100" : "opacity-0"
        }`}
        style={{
          fontSize: "clamp(1.05rem, 2.5vw, 1.9rem)",
          // A hard shadow rather than a panel: the words have to sit over grass,
          // water and sky without a box appearing under them.
          textShadow:
            "0 2px 0 rgba(24,26,20,0.85), 0 0 14px rgba(24,26,20,0.65)",
        }}
      >
        {line ?? " "}
      </div>
    </div>
  );
}
