import Media from "./Media";
import Reveal from "./Reveal";
import Parallax from "./Parallax";
import { media } from "@/content/media";
import { site } from "@/content/site";

export default function About() {
  const f = site.facts;
  const facts = [
    { k: "Established", v: f.yearFounded },
    { k: "Experience", v: f.yearsOfExperience },
    { k: "Certifications", v: f.certifications.length ? f.certifications.join(", ") : null },
    { k: "Recognition", v: f.awards.length ? f.awards.join(", ") : null },
  ].filter((x) => x.v);

  return (
    <section id="about" className="bg-obsidian py-14 sm:py-20 lg:py-40">
      <div className="container-x grid gap-10 lg:grid-cols-12 lg:gap-20">
        <div className="lg:col-span-6 lg:pt-16">
          <Reveal><p className="eyebrow mb-6">The Art of Restoration</p></Reveal>
          <Reveal delay={0.1}>
            <h2 className="h-display text-[clamp(2rem,5vw,4.5rem)]">More than restoration. A commitment to excellence.</h2>
          </Reveal>
          <Reveal delay={0.2}>
            <div className="mt-6 max-w-xl space-y-4 sm:mt-10 sm:space-y-6 text-base leading-relaxed text-warm/75">
              <p>Alex Car Restoration is a specialist in automotive craftsmanship, restoration and refinishing, serving owners of classic, vintage and luxury vehicles in the Philippines.</p>
              <p>Our philosophy is simple: preserve each vehicle&rsquo;s character while achieving exceptional workmanship. Every panel, line and finish is treated with respect for the heritage it carries.</p>
            </div>
          </Reveal>
          {facts.length > 0 && (
            <dl className="mt-12 grid max-w-xl grid-cols-2 gap-8 border-t border-silver/20 pt-8">
              {facts.map((x) => (
                <div key={x.k}><dt className="eyebrow">{x.k}</dt><dd className="mt-2 font-display text-xl">{x.v}</dd></div>
              ))}
            </dl>
          )}
        </div>
        <div className="grid grid-cols-2 gap-4 lg:col-span-6">
          <Reveal className="col-span-2"><Parallax className="aspect-[4/3]"><Media {...media.about[0]} className="h-full w-full" sizes="(min-width:1024px) 45vw, 100vw" /></Parallax></Reveal>
          <Reveal delay={0.1} className="hidden sm:block"><Parallax className="aspect-[3/4]"><Media {...media.about[1]} tone={2} className="h-full w-full" sizes="25vw" /></Parallax></Reveal>
          <Reveal delay={0.2} className="hidden items-end sm:flex">
            <p className="font-display text-2xl uppercase leading-tight tracking-tight text-silver">Preserving automotive heritage, one detail at a time.</p>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
