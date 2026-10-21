"use client";
import Image from "next/image";
import { useCallback, useEffect, useRef } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import type { GalleryImage } from "@/content/galleries";

type Props = { items: GalleryImage[]; index: number | null; onClose: () => void; onIndex: (i: number) => void };

/** Accessible image lightbox: Esc closes, arrows navigate, focus returns to the trigger. */
export default function Lightbox({ items, index, onClose, onIndex }: Props) {
  const reduce = useReducedMotion();
  const closeRef = useRef<HTMLButtonElement>(null);
  const open = index !== null;
  const go = useCallback((d: number) => { if (index !== null) onIndex((index + d + items.length) % items.length); }, [index, items.length, onIndex]);

  useEffect(() => {
    if (!open) return;
    const prevFocus = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
      else if (e.key === "Tab") { e.preventDefault(); closeRef.current?.focus(); }
    };
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prevOverflow; prevFocus?.focus?.(); };
  }, [open, go, onClose]);

  const item = index !== null ? items[index] : null;
  return (
    <AnimatePresence>
      {item && index !== null && (
        <motion.div
          role="dialog" aria-modal="true" aria-label="Image viewer"
          className="fixed inset-0 z-[70] flex flex-col bg-obsidian/95 backdrop-blur-sm"
          initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={reduce ? undefined : { opacity: 0 }} transition={{ duration: 0.3 }}
          onClick={onClose}
        >
          <div className="flex items-center justify-between px-5 py-4 text-[11px] uppercase tracking-[0.22em] text-silver" onClick={(e) => e.stopPropagation()}>
            <span aria-live="polite">{index + 1} / {items.length}</span>
            <button ref={closeRef} type="button" onClick={onClose} aria-label="Close image viewer" className="p-2 text-warm hover:text-silver focus-visible:outline focus-visible:outline-2 focus-visible:outline-silver"><X size={24} /></button>
          </div>
          <div className="relative flex min-h-0 flex-1 items-center justify-center px-4 sm:px-16">
            <motion.div key={item.src} initial={reduce ? false : { opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.4 }} onClick={(e) => e.stopPropagation()} className="max-h-full">
              <Image src={item.src} alt={item.alt} width={item.width} height={item.height} sizes="100vw" priority className="max-h-[78vh] w-auto max-w-full object-contain" />
            </motion.div>
            {items.length > 1 && (
              <>
                <button type="button" onClick={(e) => { e.stopPropagation(); go(-1); }} aria-label="Previous image" className="absolute left-1 top-1/2 -translate-y-1/2 p-3 text-warm hover:text-silver sm:left-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-silver"><ChevronLeft size={32} /></button>
                <button type="button" onClick={(e) => { e.stopPropagation(); go(1); }} aria-label="Next image" className="absolute right-1 top-1/2 -translate-y-1/2 p-3 text-warm hover:text-silver sm:right-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-silver"><ChevronRight size={32} /></button>
              </>
            )}
          </div>
          <p className="min-h-14 px-5 py-4 text-center text-xs leading-relaxed text-silver" onClick={(e) => e.stopPropagation()}>{item.caption ?? item.alt}</p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
