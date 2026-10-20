"use client";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import Media from "./Media";
import Reveal from "./Reveal";
import type { Service } from "@/content/services";

export default function Services({ services }: { services: Service[] }) {
  return (
    <section id="services" className="bg-graphite py-14 sm:py-20 lg:py-40">
      <div className="container-x">
        <Reveal><p className="eyebrow mb-6">Our Expertise</p></Reveal>
        <Reveal delay={0.1}><h2 className="h-display max-w-4xl text-[clamp(2rem,5vw,4.5rem)]">Premium services, delivered with precision.</h2></Reveal>
        <ul className="-mx-5 mt-10 flex snap-x snap-mandatory gap-4 overflow-x-auto px-5 pb-4 sm:mx-0 sm:mt-16 sm:grid sm:snap-none sm:grid-cols-2 sm:gap-x-6 sm:gap-y-14 sm:overflow-visible sm:px-0 lg:grid-cols-3">
          {services.map((s, i) => (
            <li key={s.id} className="w-[78%] shrink-0 snap-center sm:w-auto">
              <Reveal delay={(i % 3) * 0.08}>
                <article className="group">
                  <div className="aspect-[4/3] overflow-hidden">
                    <div className="h-full w-full transition-transform duration-[900ms] ease-out group-hover:scale-105">
                      <Media src={s.image} alt={s.title} label={s.title} tone={i} className="h-full w-full" sizes="(min-width:1024px) 30vw, (min-width:640px) 45vw, 100vw" />
                    </div>
                  </div>
                  <div className="mt-6 flex items-baseline gap-4">
                    <span className="font-display text-sm text-silver">{s.number}</span>
                    <h3 className="font-display text-xl font-semibold uppercase leading-tight tracking-tight">{s.title}</h3>
                  </div>
                  <p className="mt-3 text-sm leading-relaxed text-warm/70">{s.description}</p>
                  <Link href="/#contact" className="mt-5 inline-flex items-center gap-2 border-b border-silver/40 pb-1 text-[11px] uppercase tracking-[0.22em] text-silver transition-colors group-hover:border-warm group-hover:text-warm">
                    Explore Service <ArrowUpRight size={14} />
                  </Link>
                </article>
              </Reveal>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
