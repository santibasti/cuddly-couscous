"use client";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { ChevronDown } from "lucide-react";
import Media from "./Media";
import { media } from "@/content/media";

const ease = [0.22, 1, 0.36, 1] as const;

export default function Hero() {
  const reduce = useReducedMotion();
  const line = (d: number) => ({ initial: reduce ? false : { opacity: 0, y: 40 }, animate: { opacity: 1, y: 0 }, transition: { duration: 1, delay: d, ease } });
  return (
    <section id="top" className="relative flex min-h-[100svh] items-end overflow-hidden">
      <motion.div className="absolute inset-0" initial={{ scale: 1.08 }} animate={{ scale: 1 }} transition={{ duration: 14, ease: "linear" }}>
        <Media {...media.hero} priority className="h-full w-full" />
      </motion.div>
      <div className="absolute inset-0 bg-obsidian/55" aria-hidden />
      <div className="absolute inset-x-0 bottom-0 h-1/3 bg-obsidian/60" aria-hidden />
      <div className="container-x relative pb-28 pt-40 lg:pb-32">
        <motion.p {...line(0.2)} className="eyebrow mb-6">Heritage · Precision · Perfection</motion.p>
        <h1 className="h-display max-w-5xl text-[clamp(2.4rem,6.6vw,7rem)]">
          <motion.span className="block" {...line(0.35)}>Craftsmanship</motion.span>
          <motion.span className="block" {...line(0.5)}>beyond restoration.</motion.span>
        </h1>
        <motion.p {...line(0.8)} className="mt-8 max-w-2xl text-base leading-relaxed text-warm/80 sm:text-lg">
          Preserving automotive heritage. Perfecting every detail. Bringing exceptional vehicles back to life through precision, passion, and uncompromising craftsmanship.
        </motion.p>
        <motion.div {...line(1)} className="mt-10 flex flex-col gap-3 sm:flex-row">
          <Link href="/#work" className="btn-ghost">Explore Our Work</Link>
          <Link href="/#contact" className="btn-primary">Start Your Restoration</Link>
        </motion.div>
      </div>
      <motion.a href="#about" aria-label="Scroll to content" className="absolute bottom-6 left-1/2 hidden -translate-x-1/2 text-silver sm:block"
        animate={reduce ? undefined : { y: [0, 8, 0] }} transition={{ repeat: Infinity, duration: 2.4, ease: "easeInOut" }}>
        <ChevronDown />
      </motion.a>
    </section>
  );
}
