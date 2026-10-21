"use client";
import Link from "next/link";
import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import Media from "./Media";
import Reveal from "./Reveal";
import { categoryLabels, type Project, type ProjectCategory } from "@/content/projects";

const filters: { id: "all" | ProjectCategory; label: string }[] = [
  { id: "all", label: "All Projects" },
  { id: "classic", label: "Classic" },
  { id: "luxury", label: "Luxury" },
  { id: "body", label: "Body & Paint" },
  { id: "custom", label: "Custom" },
];

export default function Portfolio({ projects, limit, showHeading = true, showFilters = true, tight = false }: { projects: Project[]; limit?: number; showHeading?: boolean; showFilters?: boolean; tight?: boolean }) {
  const [active, setActive] = useState<"all" | ProjectCategory>("all");
  const list = projects.filter((p) => active === "all" || p.category === active);
  const shown = limit ? list.slice(0, limit) : list;

  return (
    <section id="work" className={`bg-obsidian ${tight ? "pb-14 sm:pb-20 lg:pb-40" : "py-14 sm:py-20 lg:py-32"}`}>
      <div className="container-x">
        {showHeading && (
          <>
            <Reveal><p className="eyebrow mb-6">Featured Projects</p></Reveal>
            <Reveal delay={0.1}>
              <h2 className="h-display max-w-5xl text-[clamp(2rem,5.5vw,5.5rem)]">Every vehicle has a story. We help write its next chapter.</h2>
            </Reveal>
          </>
        )}
        {showFilters && <div role="group" aria-label="Filter projects" className="-mx-5 mt-8 flex gap-2 overflow-x-auto px-5 pb-2 sm:mx-0 sm:flex-wrap sm:px-0">
          {filters.map((f) => (
            <button key={f.id} onClick={() => setActive(f.id)} aria-pressed={active === f.id}
              className={`shrink-0 border px-5 py-3 text-[11px] uppercase tracking-[0.22em] transition-colors ${active === f.id ? "border-warm bg-warm text-obsidian" : "border-silver/30 text-silver hover:border-warm hover:text-warm"}`}>
              {f.label}
            </button>
          ))}
        </div>}
        <motion.ul layout className="-mx-5 mt-8 flex snap-x snap-mandatory gap-4 overflow-x-auto px-5 pb-4 md:mx-0 md:mt-12 md:grid md:snap-none md:grid-cols-2 md:gap-x-6 md:gap-y-16 md:overflow-visible md:px-0">
          <AnimatePresence mode="popLayout">
            {shown.map((p, i) => (
              <motion.li layout key={p.slug} className="w-[82%] shrink-0 snap-center md:w-auto" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.4 }}>
                <article className="group">
                  <Link href={`/portfolio/${p.slug}`} className="block" aria-label={`View project: ${p.make} ${p.model}`}>
                    <div className="relative aspect-[4/3] overflow-hidden">
                      <div className="h-full w-full transition-transform duration-[900ms] ease-out group-hover:scale-105">
                        <Media src={p.after ?? p.hero} alt={`${p.make} ${p.model}`} label="Project" tone={i} className="h-full w-full" sizes="(min-width:768px) 45vw, 100vw" />
                      </div>
                      {p.placeholder && <span className="absolute right-3 top-3 bg-racing px-2 py-1 text-[9px] uppercase tracking-[0.22em]">Placeholder project</span>}
                    </div>
                    <p className="eyebrow mt-6">{categoryLabels[p.category]}</p>
                    <h3 className="mt-2 font-display text-2xl font-semibold uppercase tracking-tight sm:text-3xl">{p.make} {p.model}</h3>
                    <p className="mt-3 line-clamp-2 max-w-xl text-sm leading-relaxed text-warm/70 md:line-clamp-none">{p.summary}</p>
                    {p.scope.length > 0 && <ul className="mt-4 hidden flex-wrap sm:flex gap-x-4 gap-y-1 text-[11px] uppercase tracking-[0.16em] text-silver/80">
                      {p.scope.map((s) => <li key={s}>{s}</li>)}
                    </ul>}
                    <span className="mt-6 inline-block border-b border-silver/40 pb-1 text-[11px] uppercase tracking-[0.22em] text-silver group-hover:border-warm group-hover:text-warm">View Project</span>
                  </Link>
                </article>
              </motion.li>
            ))}
          </AnimatePresence>
        </motion.ul>
        {limit && list.length > limit && (
          <div className="mt-16"><Link href="/portfolio" className="btn-ghost">View All Projects</Link></div>
        )}
      </div>
    </section>
  );
}
