import Link from "next/link";
import Media from "./Media";
import Reveal from "./Reveal";
import Parallax from "./Parallax";
import { provenanceIntro as intro, provenanceItems } from "@/content/provenance";

export default function Provenance() {
  return (
    <section id="provenance" aria-labelledby="provenance-heading" className="relative overflow-hidden bg-obsidian py-14 sm:py-20 lg:py-40">
      <div className="container-x">
        <Reveal><p className="eyebrow mb-6 !text-brass">{intro.eyebrow}</p></Reveal>
        <Reveal delay={0.1}>
          <h2 id="provenance-heading" className="h-display max-w-5xl text-[clamp(2rem,5.5vw,5.5rem)]">{intro.heading}</h2>
        </Reveal>
        <Reveal delay={0.2}>
          <p className="mt-6 max-w-2xl text-base leading-relaxed text-warm/75 sm:mt-8 sm:text-lg">{intro.subheading}</p>
        </Reveal>

        <Reveal className="mt-10 sm:mt-16">
          <Parallax amount={5} className="aspect-[4/5] sm:aspect-[16/9] lg:aspect-[21/9]">
            <Media src={intro.collection.image} alt={intro.collection.imageAlt} label={intro.collection.label} shape="object" tone={1} className="h-full w-full" sizes="100vw" />
          </Parallax>
        </Reveal>

        <Reveal>
          <figure className="mx-auto my-14 max-w-5xl border-y border-brass/40 py-12 text-center sm:my-24 sm:py-20">
            <blockquote className="h-display text-[clamp(1.6rem,4.4vw,4rem)] leading-[1.05]">
              <span aria-hidden className="mr-2 text-brass">&ldquo;</span>{intro.statement}<span aria-hidden className="ml-1 text-brass">&rdquo;</span>
            </blockquote>
          </figure>
        </Reveal>

        <Reveal><p className="eyebrow mb-8 !text-brass sm:mb-12">The Provenance Collection</p></Reveal>
        <ul className="grid gap-x-6 gap-y-12 sm:grid-cols-2 lg:grid-cols-3 lg:gap-y-16">
          {provenanceItems.map((it, i) => (
            <li key={it.n}>
              <Reveal delay={(i % 3) * 0.08}>
                <article className="group">
                  <div className="aspect-[4/3] overflow-hidden">
                    <div className="h-full w-full transition-transform duration-[900ms] ease-out group-hover:scale-105">
                      <Media src={it.image} alt={it.imageAlt} label={it.title} shape="object" tone={i} className="h-full w-full" sizes="(min-width:1024px) 30vw, (min-width:640px) 45vw, 100vw" />
                    </div>
                  </div>
                  <div className="mt-6 flex items-baseline gap-4 border-t border-brass/30 pt-5">
                    <span className="font-display text-sm text-brass">{it.n}</span>
                    <h3 className="font-display text-xl font-semibold uppercase leading-tight tracking-tight">{it.title}</h3>
                  </div>
                  <p className="mt-3 text-sm leading-relaxed text-warm/70">{it.description}</p>
                  {it.note && <p className="mt-3 border-l border-brass/60 pl-4 text-xs leading-relaxed text-silver">{it.note}</p>}
                </article>
              </Reveal>
            </li>
          ))}
        </ul>

        <Reveal>
          <div className="mt-16 border-t border-silver/15 pt-12 sm:mt-24 sm:pt-16 lg:flex lg:items-end lg:justify-between lg:gap-12">
            <h3 className="h-display max-w-3xl text-[clamp(1.75rem,4vw,3.5rem)]">{intro.cta.heading}</h3>
            <Link href={intro.cta.href} className="btn-primary mt-8 w-full lg:mt-0 lg:w-auto lg:shrink-0">{intro.cta.button}</Link>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
