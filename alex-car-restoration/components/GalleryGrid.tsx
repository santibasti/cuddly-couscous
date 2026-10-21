"use client";
import Image from "next/image";
import { useState } from "react";
import Reveal from "./Reveal";
import Lightbox from "./Lightbox";
import type { GalleryImage } from "@/content/galleries";

type Props = {
  items: GalleryImage[];
  /** Index of an image shown large above the rest (optional) */
  lead?: number;
  /** "grid" = uniform columns, "masonry" = preserves mixed portrait/landscape ratios */
  layout?: "grid" | "masonry";
};

function Thumb({ item, onOpen, sizes, priority = false }: { item: GalleryImage; onOpen: () => void; sizes: string; priority?: boolean }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`View larger: ${item.alt}`}
      className="group relative block w-full overflow-hidden bg-graphite focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-silver"
    >
      <Image src={item.src} alt={item.alt} width={item.width} height={item.height} sizes={sizes} priority={priority}
        className="h-auto w-full transition-transform duration-[900ms] ease-out group-hover:scale-105" />
      <span className="pointer-events-none absolute inset-0 bg-obsidian/0 transition-colors duration-500 group-hover:bg-obsidian/25" aria-hidden />
    </button>
  );
}

/** Responsive gallery with lightbox. Phones: lead image + swipe strip. md+: grid or masonry. */
export default function GalleryGrid({ items, lead, layout = "grid" }: Props) {
  const [open, setOpen] = useState<number | null>(null);
  const rest = items.map((item, i) => ({ item, i })).filter(({ i }) => i !== lead);

  return (
    <>
      {lead !== undefined && items[lead] && (
        <Reveal>
          <div className="mx-auto" style={{ maxWidth: `${Math.round((items[lead].width / items[lead].height) * 78)}vh` }}>
            <Thumb item={items[lead]} onOpen={() => setOpen(lead)} sizes="(min-width:1024px) 90vw, 100vw" />
            {items[lead].caption && <p className="mt-3 text-[11px] uppercase tracking-[0.2em] text-silver">{items[lead].caption}</p>}
          </div>
        </Reveal>
      )}
      <ul
        className={`-mx-5 mt-3 flex snap-x snap-mandatory gap-3 overflow-x-auto px-5 pb-3 sm:mx-0 sm:px-0 ${
          layout === "masonry"
            ? "md:block md:columns-2 md:gap-3 md:space-y-0 md:overflow-visible lg:columns-3"
            : "md:grid md:snap-none md:grid-cols-3 md:overflow-visible"
        }`}
      >
        {rest.map(({ item, i }, k) => (
          <li key={item.src} className={`w-[78%] shrink-0 snap-center sm:w-[46%] md:w-auto ${layout === "masonry" ? "md:mb-3 md:break-inside-avoid" : ""}`}>
            <Reveal delay={(k % 3) * 0.06} y={16}>
              <Thumb item={item} onOpen={() => setOpen(i)} sizes="(min-width:1024px) 30vw, (min-width:768px) 45vw, 78vw" />
            </Reveal>
          </li>
        ))}
      </ul>
      <Lightbox items={items} index={open} onClose={() => setOpen(null)} onIndex={setOpen} />
    </>
  );
}
