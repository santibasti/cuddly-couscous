"use client";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import Media from "./Media";
import Reveal from "./Reveal";
import type { Service } from "@/content/services";

export default function Services({ services }: { services: Service[] }) {
  return (
    <section id="services" className="bg-graphite py-24 lg:py-40">
      <div className="container-x">
        <Reveal><p className="eyebrow mb-6">Our Expertise</p></Reveal>
        <Reveal delay={0.1}><h2 className="h-display max-w-4xl text-[clamp(2rem,5vw,4.5rem)]">Premium services, delivered with precision.</h2></Reveal>
        <ul className="mt-16 grid gap-x-6 gap-y-14 sm:grid-cols-2 lg:grid-cols-3">
          {services.map((s, i) => (
            <li key={s.id}>
              <Reveal delay={(i % 3) * 0.08}>
                <article className="group">
                  <div className="aspect-[4/5] overflow-hidden sm:aspect-[4/3]">
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
