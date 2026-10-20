import Media from "./Media";
import Reveal from "./Reveal";
import Parallax from "./Parallax";
import { media } from "@/content/media";

const spans = ["lg:col-span-7 aspect-[16/10]", "lg:col-span-5 aspect-[4/5] lg:aspect-auto", "lg:col-span-4 aspect-[4/3]", "lg:col-span-4 aspect-[4/3]", "lg:col-span-4 aspect-[4/3]", "lg:col-span-12 aspect-[3/2] lg:aspect-[16/9]"];

export default function Workshop() {
  return (
    <section id="workshop" className="bg-obsidian py-24 lg:py-40">
      <div className="container-x">
        <Reveal><p className="eyebrow mb-6">The Workshop</p></Reveal>
        <Reveal delay={0.1}><h2 className="h-display max-w-4xl text-[clamp(2rem,5vw,4.5rem)]">Behind the craft.</h2></Reveal>
        <Reveal delay={0.2}><p className="mt-8 max-w-xl text-base leading-relaxed text-warm/70">The environment, the people and the workmanship behind every restoration: preparation, bodywork, finishing and final inspection.</p></Reveal>
        <div className="mt-14 grid gap-3 lg:grid-cols-12">
          {media.workshop.map((m, i) => (
            <Reveal key={m.label} delay={(i % 3) * 0.08} className={spans[i]}>
              <Parallax amount={5} className="h-full min-h-[240px]"><Media {...m} tone={i} className="h-full w-full" sizes="(min-width:1024px) 40vw, 100vw" /></Parallax>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
