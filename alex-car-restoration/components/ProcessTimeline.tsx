"use client";
import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Plus } from "lucide-react";
import Media from "./Media";
import Reveal from "./Reveal";
import type { Methodology } from "@/content/process";

/**
 * Two selectable methodology cards, each driving a 10-stage interactive
 * timeline. One stage open at a time. Desktop: timeline left, stage image right.
 * Mobile/tablet: accordion with the image inside each panel.
 */
export default function ProcessTimeline({ methodologies }: { methodologies: Methodology[] }) {
  const [methodId, setMethodId] = useState(methodologies[0].id);
  const [active, setActive] = useState(0);
  const reduce = useReducedMotion();
  const method = methodologies.find((m) => m.id === methodId) ?? methodologies[0];
  const stages = method.stages;
  const current = stages[active];

  const choose = (id: Methodology["id"]) => {
    if (id === methodId) return;
    setMethodId(id);
    setActive(0);
  };

  return (
    <div className="mt-10 sm:mt-16">
      {/* Methodology selector */}
      <div role="group" aria-label="Choose a restoration approach" className="grid gap-4 md:grid-cols-2 lg:gap-6">
        {methodologies.map((m) => {
          const selected = m.id === methodId;
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => choose(m.id)}
              aria-pressed={selected}
              className={`group relative isolate flex min-h-[300px] flex-col justify-end overflow-hidden border text-left transition-colors duration-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-silver sm:min-h-[380px] ${selected ? "border-racing" : "border-silver/20 hover:border-silver/60"}`}
            >
              <div className="absolute inset-0 -z-10 transition-transform duration-[1200ms] ease-out group-hover:scale-105">
                <Media src={m.image} alt={m.imageAlt} label={m.name} tone={m.id === "frame-on" ? 0 : 2} className="h-full w-full" sizes="(min-width:768px) 50vw, 100vw" />
              </div>
              <div className={`absolute inset-0 -z-10 transition-colors duration-500 ${selected ? "bg-obsidian/55" : "bg-obsidian/70 group-hover:bg-obsidian/55"}`} aria-hidden />
              <div className="p-6 sm:p-9">
                <p className="eyebrow">10 stages</p>
                <h3 className="mt-3 font-display text-3xl font-semibold uppercase leading-none tracking-tight sm:text-4xl">{m.name}</h3>
                <p className="mt-4 max-w-md text-sm leading-relaxed text-warm/80">{m.description}</p>
                <span className={`mt-6 inline-flex items-center gap-3 text-[11px] font-semibold uppercase tracking-[0.22em] ${selected ? "text-warm" : "text-silver"}`}>
                  <span className={`h-px transition-all duration-500 ${selected ? "w-12 bg-racing" : "w-6 bg-silver/60 group-hover:w-10"}`} aria-hidden />
                  {selected ? "Selected" : "View the 10 stages"}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={method.id}
          initial={reduce ? false : { opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduce ? undefined : { opacity: 0, y: -12 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="mt-14 sm:mt-20"
        >
          {/* Progress indicator */}
          <div className="mb-8 sm:mb-10">
            <div className="flex items-end justify-between gap-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-baseline sm:gap-6">
                <p className="eyebrow">{method.name}</p>
                {method.link && (
                  <a href={method.link.href} className="inline-flex items-center gap-2 self-start border-b border-brass/50 pb-0.5 text-[11px] uppercase tracking-[0.2em] text-brass transition-colors hover:border-brass hover:text-warm">
                    {method.link.label} <span aria-hidden>&darr;</span>
                  </a>
                )}
              </div>
              <p className="font-display text-sm tabular-nums text-silver" aria-live="polite">
                <span className="text-warm">{current.n}</span> / {String(stages.length).padStart(2, "0")}
              </p>
            </div>
            <ol className="mt-4 flex gap-1.5" aria-label="Stage progress">
              {stages.map((s, i) => (
                <li key={s.n} className="flex-1">
                  <button
                    type="button"
                    onClick={() => setActive(i)}
                    aria-label={`Go to stage ${s.n}: ${s.title}`}
                    aria-current={i === active ? "step" : undefined}
                    className="group block h-6 w-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-silver"
                  >
                    <span className={`mt-2.5 block h-0.5 w-full transition-colors duration-500 ${i === active ? "bg-racing" : i < active ? "bg-silver" : "bg-silver/20 group-hover:bg-silver/50"}`} />
                  </button>
                </li>
              ))}
            </ol>
          </div>

          <div className="grid gap-10 lg:grid-cols-12 lg:gap-16">
            <ol className="lg:col-span-6 xl:col-span-5">
              {stages.map((s, i) => {
                const open = i === active;
                const pid = `${method.id}-panel-${s.n}`;
                const tid = `${method.id}-tab-${s.n}`;
                return (
                  <li key={s.n} className="border-t border-silver/15 last:border-b">
                    <Reveal y={16}>
                      <h3>
                        <button
                          type="button"
                          onClick={() => setActive(i)}
                          aria-expanded={open}
                          aria-controls={pid}
                          id={tid}
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
                        id={pid}
                        role="region"
                        aria-labelledby={tid}
                        className={`grid transition-[grid-template-rows] duration-500 ease-out ${open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}
                      >
                        <div className={`overflow-hidden ${open ? "visible" : "invisible transition-[visibility] delay-500"}`}>
                          <div className="pb-7 sm:pl-[5.75rem]">
                            <p className="text-base leading-relaxed text-warm">{s.summary}</p>
                            <p className="mt-3 text-sm leading-relaxed text-warm/65">{s.detail}</p>
                            <div className="mt-5 lg:hidden">
                              <Media src={s.image} alt={s.imageAlt} label={`${method.name} · Stage ${s.n}`} tone={i} className="aspect-[4/3] w-full" sizes="(min-width:640px) 80vw, 100vw" />
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
                <div className="relative aspect-[4/5] overflow-hidden bg-graphite xl:aspect-[5/4]">
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={`${method.id}-${current.n}`}
                      className="absolute inset-0"
                      initial={reduce ? false : { opacity: 0, scale: 1.04 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={reduce ? undefined : { opacity: 0 }}
                      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                    >
                      <Media src={current.image} alt={current.imageAlt} label={`${method.name} · Stage ${current.n}`} tone={active} className="h-full w-full" sizes="(min-width:1024px) 50vw, 100vw" />
                    </motion.div>
                  </AnimatePresence>
                  <span className="absolute left-5 top-5 font-display text-7xl font-semibold leading-none text-warm/90 mix-blend-difference xl:text-8xl">{current.n}</span>
                </div>
                <p className="mt-4 text-[11px] uppercase tracking-[0.22em] text-silver">Stage {current.n} of {stages.length} · {current.title}</p>
              </div>
            </div>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
