import { Star } from "lucide-react";
import Reveal from "./Reveal";
import { site } from "@/content/site";
import type { Testimonial } from "@/content/testimonials";

export default function Testimonials({ items }: { items: Testimonial[] }) {
  const r = site.rating;
  return (
    <section id="testimonials" className="bg-graphite py-14 sm:py-20 lg:py-40">
      <div className="container-x">
        <Reveal><p className="eyebrow mb-6">Client Testimonials</p></Reveal>
        <Reveal delay={0.1}><h2 className="h-display max-w-4xl text-[clamp(2rem,5vw,4.5rem)]">In our clients&rsquo; words.</h2></Reveal>
        {r && (
          <Reveal delay={0.15}>
            <a href={r.url} target="_blank" rel="noopener noreferrer" className="mt-8 inline-flex items-center gap-4 border border-silver/20 px-5 py-4 hover:border-warm">
              <span className="font-display text-3xl font-semibold">{r.value.toFixed(1)}</span>
              <span className="flex" aria-hidden>{[0, 1, 2, 3, 4].map((i) => <Star key={i} size={16} className="fill-silver text-silver" />)}</span>
              <span className="text-[11px] uppercase tracking-[0.18em] text-silver">{r.count} {r.source} reviews</span>
            </a>
          </Reveal>
        )}
        {items.length === 0 ? (
          <Reveal delay={0.2}>
            <p className="mt-8 max-w-xl border-l border-racing pl-6 text-base leading-relaxed text-warm/70">Verified client testimonials will be shared here with each client&rsquo;s permission.</p>
          </Reveal>
        ) : (
          <ul className="mt-10 grid gap-10 md:grid-cols-2 lg:grid-cols-3">
            {items.map((t) => (
              <li key={t.client + t.quote.slice(0, 12)}>
                <Reveal>
                  <figure className="h-full border-t border-silver/20 pt-6">
                    <blockquote className="text-lg leading-snug text-warm/90">&ldquo;{t.quote}{t.truncated ? "\u2026" : ""}&rdquo;</blockquote>
                    {t.translated && <p className="mt-2 text-xs text-silver/70">Translated from Filipino by Google.</p>}
                    <figcaption className="mt-5 text-[11px] uppercase tracking-[0.2em] text-silver">
                      {t.client}{t.category ? ` \u00b7 ${t.category}` : ""}{t.source ? ` \u00b7 ${t.source} review` : ""}
                    </figcaption>
                  </figure>
                </Reveal>
              </li>
            ))}
          </ul>
        )}
        {r && (
          <Reveal><a href={r.url} target="_blank" rel="noopener noreferrer" className="btn-ghost mt-12">Read all reviews on Google</a></Reveal>
        )}
      </div>
    </section>
  );
}
