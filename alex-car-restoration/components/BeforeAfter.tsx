"use client";
import { useState } from "react";
import Media from "./Media";

type Props = { before?: string; after?: string; altBefore: string; altAfter: string };

/** Accessible before/after slider (native range input drives the reveal). */
export default function BeforeAfter({ before, after, altBefore, altAfter }: Props) {
  const [pos, setPos] = useState(50);
  return (
    <div className="relative aspect-[16/9] w-full select-none overflow-hidden bg-graphite">
      <Media src={after} alt={altAfter} label="After" tone={1} className="absolute inset-0" />
      <div className="absolute inset-0" style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}>
        <Media src={before} alt={altBefore} label="Before" tone={3} className="absolute inset-0" />
      </div>
      <div className="pointer-events-none absolute inset-y-0 w-px bg-warm" style={{ left: `${pos}%` }}>
        <span className="absolute left-1/2 top-1/2 h-9 w-9 -translate-x-1/2 -translate-y-1/2 rounded-full border border-warm bg-obsidian/80" />
      </div>
      <span className="absolute right-3 top-3 bg-obsidian/70 px-2 py-1 text-[9px] uppercase tracking-[0.22em]">After</span>
      <span className="absolute left-3 top-3 bg-obsidian/70 px-2 py-1 text-[9px] uppercase tracking-[0.22em]">Before</span>
      <input
        type="range" min={0} max={100} value={pos}
        onChange={(e) => setPos(Number(e.target.value))}
        aria-label="Drag to compare before and after"
        className="absolute inset-0 h-full w-full cursor-ew-resize opacity-0"
      />
    </div>
  );
}
