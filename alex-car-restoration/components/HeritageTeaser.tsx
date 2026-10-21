import Link from "next/link";
import Media from "./Media";
import Reveal from "./Reveal";
import Parallax from "./Parallax";
import { media } from "@/content/media";
import { about } from "@/content/about";

/** Home: short "Since 1992" heritage preview. Full story lives on /about. */
export default function HeritageTeaser() {
  return (
    <section id="heritage" aria-labelledby="heritage-heading" className="bg-graphite py-14 sm:py-20 lg:py-32">
      <div className="container-x grid items-center gap-10 lg:grid-cols-12 lg:gap-20">
        <div className="lg:col-span-6">
          <Reveal><p className="eyebrow mb-6">{about.eyebrow}</p></Reveal>
          <Reveal delay={0.1}>
            <h2 id="heritage-heading" className="h-display text-[clamp(2rem,5vw,4.5rem)]">{about.heading}</h2>
            <p className="mt-4 font-display text-lg uppercase tracking-tight text-silver sm:text-2xl">{about.subheading}</p>
          </Reveal>
          <Reveal delay={0.2}>
            <div className="mt-6 max-w-xl space-y-4 text-base leading-relaxed text-warm/75 sm:mt-8">
              <p>{about.paragraphs[0]}</p>
              <p className="text-warm">{about.paragraphs[3]}</p>
            </div>
            <Link href="/about" className="btn-ghost mt-8">Our Story</Link>
          </Reveal>
        </div>
        <Reveal className="lg:col-span-6">
          <Parallax className="aspect-[4/3]"><Media {...media.about[0]} className="h-full w-full" sizes="(min-width:1024px) 45vw, 100vw" /></Parallax>
        </Reveal>
      </div>
    </section>
  );
}
