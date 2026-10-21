"use client";
import { motion, useReducedMotion } from "framer-motion";
import Reveal from "./Reveal";
import { value, timeline } from "@/content/value";

/** Restoration value + indicative timeline (two related blocks, one section). */
export default function RestorationValue() {
  const reduce = useReducedMotion();
  return (
    <section id="value" aria-label="Restoration value and timeline" className="bg-obsidian py-14 sm:py-20 lg:py-40">
      <div className="container-x">
        {/* Value */}
        <div className="grid gap-10 lg:grid-cols-12 lg:gap-20">
          <div className="lg:col-span-6">
            <Reveal><p className="eyebrow mb-6">{value.eyebrow}</p></Reveal>
            <Reveal delay={0.1}><h2 className="h-display text-[clamp(1.9rem,4.8vw,4.5rem)]">{value.heading}</h2></Reveal>
            <Reveal delay={0.2}><p className="mt-6 max-w-xl text-base leading-relaxed text-warm/75 sm:mt-8 sm:text-lg">{value.intro}</p></Reveal>
            <Reveal delay={0.25}>
              <div className="mt-8 border-t border-silver/15 pt-6 sm:mt-12">
                <p className="text-sm leading-relaxed text-warm/70">{value.sourcing.text}</p>
                <ul className="mt-4 flex flex-wrap gap-2">
                  {value.sourcing.regions.map((r) => (
                    <li key={r} className="border border-silver/30 px-4 py-2 text-[11px] uppercase tracking-[0.2em] text-warm">{r}</li>
                  ))}
                </ul>
              </div>
            </Reveal>
          </div>
          <ol className="lg:col-span-6">
            {value.factors.map((f, i) => (
              <li key={f} className="border-t border-silver/15 last:border-b">
                <Reveal y={14} delay={Math.min(i * 0.04, 0.2)}>
                  <div className="flex items-baseline gap-5 py-4 sm:gap-8 sm:py-5">
                    <span className="w-8 shrink-0 font-display text-sm text-racing">{String(i + 1).padStart(2, "0")}</span>
                    <span className="font-display text-lg font-semibold uppercase leading-tight tracking-tight sm:text-xl">{f}</span>
                  </div>
                </Reveal>
              </li>
            ))}
          </ol>
        </div>

        {/* Timeline */}
        <div className="mt-20 grid gap-10 border-t border-silver/15 pt-14 sm:mt-32 sm:pt-20 lg:grid-cols-12 lg:gap-20">
          <div className="lg:col-span-7">
            <Reveal><p className="eyebrow mb-6">{timeline.eyebrow}</p></Reveal>
            <Reveal delay={0.1}><h2 className="h-display text-[clamp(1.9rem,4.8vw,4.5rem)]">{timeline.heading}</h2></Reveal>
            <Reveal delay={0.2}>
              <p className="mt-6 font-display text-xl uppercase leading-snug tracking-tight sm:mt-8 sm:text-2xl">{timeline.lead}</p>
              <p className="mt-4 max-w-xl text-base leading-relaxed text-warm/75">{timeline.body}</p>
            </Reveal>
            <Reveal delay={0.25}>
              <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-[11px] uppercase tracking-[0.18em] text-silver">
                {timeline.variables.map((v) => <li key={v} className="flex items-center gap-2"><span className="h-1 w-1 rounded-full bg-racing" aria-hidden />{v}</li>)}
              </ul>
            </Reveal>
          </div>
          <Reveal className="lg:col-span-5" delay={0.15}>
            <div className="border border-silver/20 bg-graphite p-8 sm:p-10">
              <p className="font-display font-semibold leading-none">
                <span className="text-[clamp(5rem,14vw,9rem)]"><span className="sr-only">Approximately </span>~{timeline.figure.value}</span>
                <span className="ml-3 text-2xl uppercase tracking-tight text-silver sm:text-3xl">{timeline.figure.unit}</span>
              </p>
              <div className="mt-6 grid grid-cols-12 gap-1" aria-hidden>
                {Array.from({ length: 12 }, (_, i) => (
                  <motion.span key={i} className="h-1 bg-silver/25"
                    initial={reduce ? false : { backgroundColor: "rgba(184,189,195,0.25)" }}
                    whileInView={{ backgroundColor: "#A51C30" }}
                    viewport={{ once: true, margin: "-40px" }}
                    transition={{ delay: 0.15 + i * 0.12, duration: 0.5 }}
                    style={{ gridColumn: "span 1 / span 1" }} />
                ))}
              </div>
              <p className="mt-5 text-sm text-warm/80">{timeline.figure.label}</p>
              <p className="mt-2 text-xs leading-relaxed text-silver">{timeline.disclaimer}</p>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
