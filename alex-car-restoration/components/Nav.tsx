"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Menu, X } from "lucide-react";
import { nav, site } from "@/content/site";

export default function Nav() {
  const [open, setOpen] = useState(false);
  const [solid, setSolid] = useState(false);
  useEffect(() => {
    const on = () => setSolid(window.scrollY > 40);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  return (
    <header className={`fixed inset-x-0 top-0 z-50 transition-colors duration-500 ${solid || open ? "bg-obsidian/95 backdrop-blur" : "bg-transparent"}`}>
      <div className="container-x flex h-16 items-center justify-between lg:h-20">
        <Link href="/" aria-label={`${site.name} — home`} className="font-display text-sm font-semibold uppercase tracking-[0.3em]">
          Alex <span className="text-silver">Car Restoration</span>
        </Link>
        <nav aria-label="Primary" className="hidden items-center gap-8 xl:flex">
          {nav.map((n) => (
            <Link key={n.href} href={n.href} className="text-[11px] uppercase tracking-[0.22em] text-silver transition-colors hover:text-warm">{n.label}</Link>
          ))}
        </nav>
        <Link href="/#contact" className="btn-primary hidden xl:inline-flex">Discuss Your Project</Link>
        <button className="xl:hidden" aria-label={open ? "Close menu" : "Open menu"} aria-expanded={open} aria-controls="mobile-menu" onClick={() => setOpen(!open)}>
          {open ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>
      <AnimatePresence>
        {open && (
          <motion.nav id="mobile-menu" aria-label="Mobile" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-x-0 bottom-0 top-16 flex flex-col justify-between bg-obsidian px-5 pb-10 pt-8">
            <ul className="space-y-1">
              {nav.map((n, i) => (
                <motion.li key={n.href} initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.05 * i }}>
                  <Link href={n.href} onClick={() => setOpen(false)} className="block border-b border-silver/10 py-4 font-display text-3xl font-semibold uppercase tracking-tight">{n.label}</Link>
                </motion.li>
              ))}
            </ul>
            <Link href="/#contact" onClick={() => setOpen(false)} className="btn-primary w-full">Discuss Your Project</Link>
          </motion.nav>
        )}
      </AnimatePresence>
    </header>
  );
}
