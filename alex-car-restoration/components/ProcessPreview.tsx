import Link from "next/link";
import Media from "./Media";
import Reveal from "./Reveal";
import { methodologies } from "@/content/process";

/** Home: Frame-On / Frame-Off preview. The interactive 10-stage timeline lives on /process. */
export default function ProcessPreview() {
  return (
    <section id="process-preview" aria-labelledby="process-preview-heading" className="bg-graphite py-14 sm:py-20 lg:py-32">
      <div className="container-x">
        <Reveal><p className="eyebrow mb-6">Our Restoration Process</p></Reveal>
        <Reveal delay={0.1}><h2 id="process-preview-heading" className="h-display max-w-5xl text-[clamp(2rem,5.5vw,5rem)]">Two approaches. One standard of excellence.</h2></Reveal>
        <Reveal delay={0.2}><p className="mt-6 max-w-2xl text-base leading-relaxed text-warm/75 sm:mt-8 sm:text-lg">Every vehicle deserves a restoration approach tailored to its condition, heritage, and intended outcome.</p></Reveal>
        <div className="mt-10 grid gap-4 sm:mt-14 md:grid-cols-2 lg:gap-6">
          {methodologies.map((m, i) => (
            <Reveal key={m.id} delay={i * 0.1}>
              <Link href="/process" aria-label={`${m.name}: view the 10 stages`} className="group relative isolate flex min-h-[280px] flex-col justify-end overflow-hidden border border-silver/20 transition-colors duration-500 hover:border-silver/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-silver sm:min-h-[340px]">
                <div className="absolute inset-0 -z-10 transition-transform duration-[1200ms] ease-out group-hover:scale-105">
                  <Media src={m.image} alt={m.imageAlt} label={m.name} tone={i * 2} className="h-full w-full" sizes="(min-width:768px) 50vw, 100vw" />
                </div>
                <div className="absolute inset-0 -z-10 bg-obsidian/65 transition-colors duration-500 group-hover:bg-obsidian/50" aria-hidden />
                <div className="p-6 sm:p-9">
                  <p className="eyebrow">10 stages</p>
                  <h3 className="mt-3 font-display text-3xl font-semibold uppercase leading-none tracking-tight sm:text-4xl">{m.name}</h3>
                  <p className="mt-4 max-w-md text-sm leading-relaxed text-warm/80">{m.description}</p>
                  <span className="mt-6 inline-flex items-center gap-3 text-[11px] font-semibold uppercase tracking-[0.22em] text-silver group-hover:text-warm">
                    <span className="h-px w-6 bg-silver/60 transition-all duration-500 group-hover:w-10 group-hover:bg-racing" aria-hidden />View the stages
                  </span>
                </div>
              </Link>
            </Reveal>
          ))}
        </div>
        <Reveal><Link href="/process" className="btn-ghost mt-10">Explore the Full Process</Link></Reveal>
      </div>
    </section>
  );
}
