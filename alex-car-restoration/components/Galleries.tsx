import Reveal from "./Reveal";
import GalleryGrid from "./GalleryGrid";
import { featuredGalleries } from "@/content/galleries";

/** Real-photo galleries (Vespa detail, Land Cruiser body-kit installation). */
export default function Galleries() {
  return (
    <section id="galleries" aria-label="Photo galleries" className="bg-graphite py-14 sm:py-20 lg:py-40">
      <div className="container-x space-y-20 sm:space-y-32">
        {featuredGalleries.map((g) => (
          <div key={g.id} id={`gallery-${g.id}`}>
            <Reveal><p className="eyebrow mb-6">{g.eyebrow}</p></Reveal>
            <Reveal delay={0.1}><h2 className="h-display max-w-4xl text-[clamp(1.9rem,4.8vw,4.5rem)]">{g.title}</h2></Reveal>
            <Reveal delay={0.2}><p className="mt-5 max-w-2xl text-base leading-relaxed text-warm/75 sm:mt-7">{g.intro}</p></Reveal>
            <div className="mt-8 sm:mt-12">
              <GalleryGrid items={g.items} lead={g.lead} />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
