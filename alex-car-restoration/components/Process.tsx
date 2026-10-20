import Reveal from "./Reveal";
import { processSteps } from "@/content/process";

export default function Process() {
  return (
    <section id="process" className="bg-graphite py-14 sm:py-20 lg:py-40">
      <div className="container-x">
        <Reveal><p className="eyebrow mb-6">Our Restoration Process</p></Reveal>
        <Reveal delay={0.1}><h2 className="h-display text-[clamp(2rem,5.5vw,5.5rem)]">Precision in every stage.</h2></Reveal>
        <ol className="relative mt-10 border-l sm:mt-20 border-silver/20 lg:ml-[8.5rem]">
          {processSteps.map((s) => (
            <li key={s.n} className="relative pb-8 pl-6 sm:pb-16 sm:pl-8 last:pb-0 lg:pl-16">
              <span className="absolute -left-[5px] top-4 h-2.5 w-2.5 rounded-full bg-racing" aria-hidden />
              <Reveal>
                <span className="font-display text-[clamp(2.5rem,10vw,8rem)] font-semibold leading-none text-silver/25 lg:absolute lg:-left-[8.5rem] lg:top-0">{s.n}</span>
                <h3 className="mt-2 font-display text-xl font-semibold uppercase tracking-tight sm:text-3xl lg:mt-0">{s.title}</h3>
                <p className="mt-2 max-w-xl text-sm leading-relaxed text-warm/70 sm:mt-3 sm:text-base">{s.text}</p>
              </Reveal>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
