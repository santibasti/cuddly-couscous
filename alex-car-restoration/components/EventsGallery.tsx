import Reveal from "./Reveal";
import GalleryGrid from "./GalleryGrid";
import { eventsGallery as g } from "@/content/galleries";

export default function EventsGallery() {
  return (
    <section id="events" aria-labelledby="events-heading" className="bg-obsidian py-14 sm:py-20 lg:py-40">
      <div className="container-x">
        <Reveal><p className="eyebrow mb-6">{g.eyebrow}</p></Reveal>
        <Reveal delay={0.1}><h2 id="events-heading" className="h-display max-w-4xl text-[clamp(1.9rem,4.8vw,4.5rem)]">{g.title}</h2></Reveal>
        <Reveal delay={0.2}><p className="mt-5 max-w-2xl text-base leading-relaxed text-warm/75 sm:mt-7">{g.intro}</p></Reveal>
        <div className="mt-8 sm:mt-12">
          <GalleryGrid items={g.items} layout="masonry" />
        </div>
      </div>
    </section>
  );
}
