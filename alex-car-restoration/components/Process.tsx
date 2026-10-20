import Link from "next/link";
import Reveal from "./Reveal";
import ProcessTimeline from "./ProcessTimeline";
import { processStages } from "@/content/process";

export default function Process() {
  return (
    <section id="process" aria-labelledby="process-heading" className="bg-graphite py-14 sm:py-20 lg:py-40">
      <div className="container-x">
        <Reveal><p className="eyebrow mb-6">Our Restoration Process</p></Reveal>
        <Reveal delay={0.1}><h2 id="process-heading" className="h-display text-[clamp(2rem,5.5vw,5.5rem)]">Precision at every stage.</h2></Reveal>
        <Reveal delay={0.2}>
          <p className="mt-6 max-w-2xl text-base leading-relaxed text-warm/75 sm:mt-8 sm:text-lg">
            Discover the meticulous craftsmanship behind every frame-on restoration &mdash; from careful disassembly to the final quality inspection.
          </p>
        </Reveal>

        <ProcessTimeline stages={processStages} />

        <Reveal>
          <div className="mt-16 border-t border-silver/15 pt-12 sm:mt-24 sm:pt-16 lg:flex lg:items-end lg:justify-between lg:gap-12">
            <h3 className="h-display max-w-3xl text-[clamp(1.75rem,4vw,3.5rem)]">Every great restoration begins with a conversation.</h3>
            <Link href="/#contact" className="btn-primary mt-8 w-full lg:mt-0 lg:w-auto lg:shrink-0">Discuss Your Restoration Project</Link>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
