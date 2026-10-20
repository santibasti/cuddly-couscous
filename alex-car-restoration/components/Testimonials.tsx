import Reveal from "./Reveal";
import type { Testimonial } from "@/content/testimonials";

export default function Testimonials({ items }: { items: Testimonial[] }) {
  return (
    <section id="testimonials" className="bg-graphite py-14 sm:py-20 lg:py-40">
      <div className="container-x">
        <Reveal><p className="eyebrow mb-6">Client Testimonials</p></Reveal>
        <Reveal delay={0.1}><h2 className="h-display max-w-4xl text-[clamp(2rem,5vw,4.5rem)]">In our clients&rsquo; words.</h2></Reveal>
        {items.length === 0 ? (
          <Reveal delay={0.2}>
            <p className="mt-8 max-w-xl border-l border-racing pl-6 text-base leading-relaxed text-warm/70">
              Verified client testimonials will be shared here with each client&rsquo;s permission.
            </p>
          </Reveal>
        ) : (
          <ul className="mt-14 grid gap-10 md:grid-cols-2">
            {items.map((t) => (
              <li key={t.client + t.vehicle}>
                <Reveal>
                  <figure className="border-t border-silver/20 pt-8">
                    <blockquote className="font-display text-2xl leading-snug tracking-tight">&ldquo;{t.quote}&rdquo;</blockquote>
                    <figcaption className="mt-6 text-[11px] uppercase tracking-[0.2em] text-silver">{t.client} · {t.vehicle} · {t.category}</figcaption>
                  </figure>
                </Reveal>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
