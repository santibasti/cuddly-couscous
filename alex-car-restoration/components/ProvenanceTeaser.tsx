import Link from "next/link";
import Reveal from "./Reveal";
import { provenanceIntro as intro, provenanceItems } from "@/content/provenance";

/** Home: Provenance Collection teaser. Full collection on /process#provenance (Frame-Off only). */
export default function ProvenanceTeaser() {
  return (
    <section aria-labelledby="provenance-teaser-heading" className="border-t border-silver/10 bg-graphite py-14 sm:py-20 lg:py-32">
      <div className="container-x grid gap-10 lg:grid-cols-12 lg:gap-20">
        <div className="lg:col-span-7">
          <Reveal><p className="eyebrow mb-6 !text-brass">{intro.eyebrow}</p></Reveal>
          <Reveal delay={0.1}><h2 id="provenance-teaser-heading" className="h-display text-[clamp(2rem,5vw,4.5rem)]">{intro.heading}</h2></Reveal>
          <Reveal delay={0.2}>
            <p className="mt-6 max-w-xl text-base leading-relaxed text-warm/75 sm:mt-8 sm:text-lg">The Alex Car Restoration Provenance Book preserves the craftsmanship, specifications, and journey behind each completed frame-off restoration.</p>
            <Link href="/process#provenance" className="btn-ghost mt-8">Discover the Provenance Collection</Link>
          </Reveal>
        </div>
        <Reveal className="lg:col-span-5" delay={0.15}>
          <figure className="border-y border-brass/40 py-8 sm:py-10">
            <blockquote className="h-display text-[clamp(1.4rem,2.8vw,2.4rem)] leading-[1.1]">&ldquo;{intro.statement}&rdquo;</blockquote>
          </figure>
          <ul className="mt-6 grid grid-cols-1 gap-x-6 sm:grid-cols-2">
            {provenanceItems.map((it) => (
              <li key={it.n} className="flex gap-3 border-b border-silver/10 py-2.5 text-[11px] uppercase tracking-[0.16em] text-silver">
                <span className="text-brass">{it.n}</span>{it.title}
              </li>
            ))}
          </ul>
        </Reveal>
      </div>
    </section>
  );
}
