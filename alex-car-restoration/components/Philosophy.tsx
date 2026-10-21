import { ArrowRight } from "lucide-react";
import Media from "./Media";
import Reveal from "./Reveal";
import { philosophy as p } from "@/content/philosophy";

export default function Philosophy() {
  return (
    <section id="philosophy" aria-labelledby="philosophy-heading" className="border-t border-silver/10 bg-graphite py-14 sm:py-20 lg:py-40">
      <div className="container-x">
        <Reveal><p className="eyebrow mb-6">{p.eyebrow}</p></Reveal>
        <Reveal delay={0.1}><h2 id="philosophy-heading" className="h-display max-w-5xl text-[clamp(2rem,5.5vw,5.5rem)]">{p.heading}</h2></Reveal>

        <Reveal delay={0.15}>
          <p className="mt-8 flex flex-wrap items-center gap-x-3 gap-y-2 font-display text-[clamp(1.1rem,2.6vw,2rem)] font-semibold uppercase tracking-[0.12em] sm:mt-12 sm:gap-x-5" aria-label="Source, restore, manufacture">
            {p.motto.map((w, i) => (
              <span key={w} className="flex items-center gap-3 sm:gap-5">
                <span className={i === 0 ? "text-warm" : "text-warm/85"}>{w}</span>
                {i < p.motto.length - 1 && <ArrowRight aria-hidden className="text-racing" size={22} />}
              </span>
            ))}
          </p>
        </Reveal>

        <Reveal delay={0.2}>
          <div className="mt-6 max-w-2xl space-y-4 text-base leading-relaxed text-warm/75 sm:mt-8 sm:text-lg">
            {p.body.map((t, i) => <p key={i}>{t}</p>)}
          </div>
        </Reveal>

        <ol className="mt-12 grid gap-10 sm:mt-20 md:grid-cols-3 md:gap-6 lg:gap-10">
          {p.principles.map((x, i) => (
            <li key={x.n}>
              <Reveal delay={i * 0.1}>
                <article className="group">
                  <div className="aspect-[4/3] overflow-hidden md:aspect-[4/5]">
                    <div className="h-full w-full transition-transform duration-[900ms] ease-out group-hover:scale-105">
                      <Media src={x.image} alt={x.imageAlt} label={x.title} tone={i} className="h-full w-full" sizes="(min-width:768px) 30vw, 100vw" />
                    </div>
                  </div>
                  <div className="mt-6 flex items-baseline gap-4 border-t border-silver/20 pt-5">
                    <span className="font-display text-4xl font-semibold leading-none text-racing sm:text-5xl">{x.n}</span>
                    <h3 className="font-display text-2xl font-semibold uppercase tracking-tight">{x.title}</h3>
                  </div>
                  <p className="mt-3 text-sm leading-relaxed text-warm/70">{x.text}</p>
                </article>
              </Reveal>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
