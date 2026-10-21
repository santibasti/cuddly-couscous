"use client";
import { useState } from "react";
import { Plus } from "lucide-react";
import Reveal from "./Reveal";
import { faqs, faqIntro } from "@/content/faq";

/** Client FAQ: accessible single-open accordion + FAQPage structured data. */
export default function FaqSection() {
  const [open, setOpen] = useState<number | null>(0);
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
  };
  return (
    <section id="faq" aria-labelledby="faq-heading" className="bg-obsidian py-14 sm:py-20 lg:py-40">
      <div className="container-x grid gap-10 lg:grid-cols-12 lg:gap-20">
        <div className="lg:col-span-4">
          <Reveal><p className="eyebrow mb-6">{faqIntro.eyebrow}</p></Reveal>
          <Reveal delay={0.1}><h2 id="faq-heading" className="h-display text-[clamp(1.9rem,4.2vw,4rem)]">{faqIntro.heading}</h2></Reveal>
        </div>
        <ul className="lg:col-span-8">
          {faqs.map((f, i) => {
            const isOpen = open === i;
            return (
              <li key={f.q} className="border-t border-silver/15 last:border-b">
                <Reveal y={14}>
                  <h3>
                    <button type="button" aria-expanded={isOpen} aria-controls={`faq-a-${i}`} id={`faq-q-${i}`} onClick={() => setOpen(isOpen ? null : i)}
                      className="group flex w-full items-start justify-between gap-6 py-5 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-silver sm:py-6">
                      <span className={`font-display text-lg font-semibold uppercase leading-tight tracking-tight transition-colors sm:text-2xl ${isOpen ? "text-warm" : "text-warm/80 group-hover:text-warm"}`}>{f.q}</span>
                      <Plus aria-hidden size={22} className={`mt-1 shrink-0 text-silver transition-transform duration-500 ${isOpen ? "rotate-45 text-racing" : ""}`} />
                    </button>
                  </h3>
                  <div id={`faq-a-${i}`} role="region" aria-labelledby={`faq-q-${i}`}
                    className={`grid transition-[grid-template-rows] duration-500 ease-out ${isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
                    <div className={`overflow-hidden ${isOpen ? "visible" : "invisible transition-[visibility] delay-500"}`}>
                      <p className="max-w-2xl pb-6 text-base leading-relaxed text-warm/75">{f.a}</p>
                    </div>
                  </div>
                </Reveal>
              </li>
            );
          })}
        </ul>
      </div>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
    </section>
  );
}
