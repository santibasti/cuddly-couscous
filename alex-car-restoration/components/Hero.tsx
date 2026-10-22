"use client";
import Link from "next/link";
import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { heroSlides, heroTiming } from "@/content/hero";

/**
 * Two-slide cinematic hero. Crossfade only (no sliding), 7s autoplay.
 * Autoplay pauses on hover/focus, after a manual selection, and when the tab is
 * hidden; it is disabled entirely for reduced-motion users. All slides share one
 * grid cell so the hero height is stable (no layout shift).
 * Mobile: the full photograph sits above the text so the whole vehicle shows.
 * Desktop: photo anchored right, text on the left over a soft dark gradient.
 */
export default function Hero() {
  const reduce = useReducedMotion();
  const [active, setActive] = useState(0);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [manual, setManual] = useState(false);
  const [hidden, setHidden] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const n = heroSlides.length;
  const paused = reduce || manual || hovered || focused || hidden;

  useEffect(() => {
    const onVis = () => setHidden(document.hidden);
    onVis();
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  useEffect(() => {
    if (paused) return;
    timer.current = setTimeout(() => setActive((a) => (a + 1) % n), heroTiming.intervalMs);
    return () => clearTimeout(timer.current);
  }, [active, paused, n]);

  const select = useCallback((i: number) => { setActive(i); setManual(true); }, []);
  const fade = reduce ? 0 : heroTiming.fadeMs;

  return (
    <section
      id="top"
      aria-roledescription="carousel"
      aria-label="Featured vehicles"
      className="relative overflow-hidden bg-obsidian"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
    >
      <div className="grid min-h-[100svh] lg:min-h-[640px] lg:h-[88vh] lg:max-h-[1000px]">
        {heroSlides.map((s, i) => {
          const on = i === active;
          return (
            <div
              key={s.id}
              role="group"
              aria-roledescription="slide"
              aria-label={`${i + 1} of ${n}`}
              aria-hidden={!on}
              className={`col-start-1 row-start-1 flex flex-col lg:block ${on ? "visible opacity-100" : "invisible opacity-0"}`}
              style={{ transition: `opacity ${fade}ms ease-in-out, visibility 0s linear ${on ? 0 : fade}ms` }}
            >
              {/* Image: full photograph on mobile, right-anchored on desktop */}
              <div className="relative mt-16 aspect-[3/2] w-full shrink-0 lg:absolute lg:bottom-0 lg:right-0 lg:mt-0 lg:w-[min(64%,calc(max(88vh,640px)*1.5))] lg:[mask-image:linear-gradient(to_right,transparent,black_7%)] lg:[-webkit-mask-image:linear-gradient(to_right,transparent,black_7%)]">
                <Image
                  src={s.image}
                  alt={s.imageAlt}
                  fill
                  priority={i === 0}
                  loading={i === 0 ? undefined : "lazy"}
                  sizes="(min-width:1024px) 64vw, 100vw"
                  className="object-cover"
                  style={{ objectPosition: s.position }}
                />
                <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-obsidian to-transparent lg:hidden" aria-hidden />
              </div>
              <div className="absolute inset-x-0 top-0 hidden h-1/4 bg-gradient-to-b from-obsidian/70 to-transparent lg:block" aria-hidden />

              {/* Text */}
              <div className="container-x relative flex flex-1 flex-col justify-start pb-28 pt-6 lg:absolute lg:inset-0 lg:justify-center lg:pb-12 lg:pt-20">
                <div className={`max-w-[30rem] transition-transform ease-out ${on ? "translate-y-0" : "translate-y-2"}`} style={{ transitionDuration: `${fade}ms` }}>
                  <h2 className="h-display text-[clamp(2.1rem,9vw,2.8rem)] sm:text-5xl lg:text-[clamp(2.6rem,4.3vw,4.6rem)]">
                    {s.headline.map((l) => <span key={l} className="block">{l}</span>)}
                  </h2>
                  <p className="mt-5 max-w-md text-base leading-relaxed text-warm/80 sm:text-lg">{s.subheading}</p>
                  <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                    <Link href={s.secondary.href} tabIndex={on ? 0 : -1} className="btn-ghost">{s.secondary.label}</Link>
                    <Link href={s.primary.href} tabIndex={on ? 0 : -1} className="btn-primary">{s.primary.label}</Link>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Indicators */}
      <div className="container-x pointer-events-none absolute bottom-20 left-0 right-0 z-10 lg:bottom-8">
        <div className="pointer-events-auto flex items-center gap-3" role="group" aria-label="Choose slide">
          {heroSlides.map((s, i) => (
            <button
              key={s.id}
              type="button"
              onClick={() => select(i)}
              aria-label={`Show slide ${i + 1}: ${s.headline.join(" ")}`}
              aria-current={i === active ? "true" : undefined}
              className="group flex h-8 w-12 items-center focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-silver"
            >
              <span className={`block h-0.5 w-full transition-colors duration-500 ${i === active ? "bg-racing" : "bg-silver/40 group-hover:bg-silver"}`} />
            </button>
          ))}
          <span className="sr-only" aria-live={paused ? "polite" : "off"}>Slide {active + 1} of {n}</span>
        </div>
      </div>

      <a href="#heritage" aria-label="Scroll to content" className="absolute bottom-6 left-1/2 hidden -translate-x-1/2 text-silver lg:block"><ChevronDown /></a>
    </section>
  );
}
