"use client";
import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Plus } from "lucide-react";
import Media from "./Media";
import Reveal from "./Reveal";
import type { ProcessStage } from "@/content/process";

/**
 * Interactive 10-stage process. One stage open at a time.
 * Desktop: timeline left, large stage image right (changes with selection).
 * Mobile/tablet: touch-friendly accordion with the image inside each panel.
 */
export default function ProcessTimeline({ stages }: { stages: ProcessStage[] }) {
  const [active, setActive] = useState(0);
  const reduce = useReducedMotion();
  const current = stages[active];

  return (
    <div className="mt-10 grid gap-10 sm:mt-16 lg:grid-cols-12 lg:gap-16">
      <ol className="lg:col-span-6 xl:col-span-5">
        {stages.map((s, i) => {
          const open = i === active;
          return (
            <li key={s.n} className="border-t border-silver/15 last:border-b">
              <Reveal y={16}>
                <h3>
                  <button
                    type="button"
                    onClick={() => setActive(i)}
                    aria-expanded={open}
                    aria-controls={`stage-panel-${s.n}`}
                    id={`stage-tab-${s.n}`}
                    className="group flex w-full items-center gap-4 py-5 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-silver sm:gap-6 sm:py-6"
                  >
                    <span className={`w-12 shrink-0 font-display text-3xl font-semibold leading-none transition-colors duration-500 sm:w-[4.25rem] sm:text-5xl ${open ? "text-racing" : "text-silver/30 group-hover:text-silver/60"}`}>{s.n}</span>
                    <span className={`flex-1 font-display text-lg font-semibold uppercase leading-tight tracking-tight transition-colors sm:text-2xl ${open ? "text-warm" : "text-warm/70 group-hover:text-warm"}`}>
                      <span className="sr-only">Stage {s.n}: </span>{s.title}
                    </span>
                    <Plus size={20} aria-hidden className={`shrink-0 text-silver transition-transform duration-500 ${open ? "rotate-45" : ""}`} />
                  </button>
                </h3>
                <div
                  id={`stage-panel-${s.n}`}
                  role="region"
                  aria-labelledby={`stage-tab-${s.n}`}
                  className={`grid transition-[grid-template-rows] duration-500 ease-out ${open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}
                >
                  <div className={`overflow-hidden ${open ? "visible" : "invisible transition-[visibility] delay-500"}`}>
                    <div className="pb-7 pl-0 sm:pl-[5.75rem]">
                      <p className="text-base leading-relaxed text-warm">{s.summary}</p>
                      <p className="mt-3 text-sm leading-relaxed text-warm/65">{s.detail}</p>
                      <div className="mt-5 lg:hidden">
                        <Media src={s.image} alt={s.imageAlt} label={`Stage ${s.n}`} tone={i} className="aspect-[4/3] w-full" sizes="(min-width:640px) 80vw, 100vw" />
                      </div>
                    </div>
                  </div>
                </div>
              </Reveal>
            </li>
          );
        })}
      </ol>

      <div className="hidden lg:col-span-6 lg:block xl:col-span-7">
        <div className="sticky top-28">
          <div className="relative aspect-[4/5] overflow-hidden bg-graphite xl:aspect-[5/4]" aria-live="polite">
            <AnimatePresence mode="wait">
              <motion.div
                key={current.n}
                className="absolute inset-0"
                initial={reduce ? false : { opacity: 0, scale: 1.04 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={reduce ? undefined : { opacity: 0 }}
                transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
              >
                <Media src={current.image} alt={current.imageAlt} label={`Stage ${current.n}`} tone={active} className="h-full w-full" sizes="(min-width:1024px) 50vw, 100vw" />
              </motion.div>
            </AnimatePresence>
            <span className="absolute left-5 top-5 font-display text-7xl font-semibold leading-none text-warm/90 mix-blend-difference xl:text-8xl">{current.n}</span>
          </div>
          <p className="mt-4 text-[11px] uppercase tracking-[0.22em] text-silver">Stage {current.n} of {stages.length} · {current.title}</p>
        </div>
      </div>
    </div>
  );
}
