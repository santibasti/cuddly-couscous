import Link from "next/link";
import { ArrowRight } from "lucide-react";
import Reveal from "./Reveal";
import { philosophy as p } from "@/content/philosophy";

/** Home: originality preview. Full numbered principles live on /about#philosophy. */
export default function PhilosophyTeaser() {
  return (
    <section aria-labelledby="philosophy-teaser-heading" className="bg-obsidian py-14 sm:py-20 lg:py-32">
      <div className="container-x">
        <Reveal><p className="eyebrow mb-6">{p.eyebrow}</p></Reveal>
        <Reveal delay={0.1}><h2 id="philosophy-teaser-heading" className="h-display max-w-5xl text-[clamp(2rem,5.5vw,5rem)]">{p.heading}</h2></Reveal>
        <Reveal delay={0.15}>
          <p className="mt-8 flex flex-wrap items-center gap-x-3 gap-y-2 font-display text-[clamp(1.1rem,2.6vw,2rem)] font-semibold uppercase tracking-[0.12em] sm:gap-x-5" aria-label="Source, restore, manufacture">
            {p.motto.map((w, i) => (
              <span key={w} className="flex items-center gap-3 sm:gap-5">
                <span>{w}</span>
                {i < p.motto.length - 1 && <ArrowRight aria-hidden className="text-racing" size={22} />}
              </span>
            ))}
          </p>
        </Reveal>
        <Reveal delay={0.2}>
          <p className="mt-6 max-w-2xl text-base leading-relaxed text-warm/75 sm:mt-8 sm:text-lg">{p.body[0]}</p>
          <Link href="/about#philosophy" className="mt-8 inline-block border-b border-silver/40 pb-1 text-[11px] uppercase tracking-[0.22em] text-silver transition-colors hover:border-warm hover:text-warm">Our restoration philosophy</Link>
        </Reveal>
      </div>
    </section>
  );
}
