"use client";
import Link from "next/link";
import Image from "next/image";
import { useEffect, useRef, useState, type PointerEvent } from "react";
import { motion, useMotionValue, useReducedMotion, useSpring, useTransform } from "framer-motion";
import { Check } from "lucide-react";
import { cars, paints, leathers, visualiserIntro, type Option } from "@/content/visualiser";

type Prepared = { base: Uint8ClampedArray; lum: Float32Array; body: Uint8ClampedArray; inter: Uint8ClampedArray };

const hexRgb = (h: string): [number, number, number] => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255) as [number, number, number];
const smooth = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => { const i = new window.Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
}
function pixels(img: HTMLImageElement) {
  const c = document.createElement("canvas"); c.width = img.naturalWidth; c.height = img.naturalHeight;
  const ctx = c.getContext("2d", { willReadFrequently: true })!; ctx.drawImage(img, 0, 0);
  return ctx.getImageData(0, 0, c.width, c.height).data;
}

/** Recolour keeping the photograph's own shading, reflections and highlights. */
function shadeFn(rgb: [number, number, number], ref: number, gloss: number) {
  const cl = 0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2];
  const dark = Math.min(1, Math.max(0, 1 - cl / 0.35));
  return (lum: number, out: [number, number, number]) => {
    const t = Math.min(lum / ref, 1.35);
    const shade = Math.pow(Math.min(t, 1), 1.35);
    const lift = dark * 0.16 * Math.min(1, Math.max(0, lum - 0.5));
    const spec = Math.pow(smooth(0.8, 1.0, lum), 1.4) * (0.1 + 0.38 * (1 - cl)) * gloss;
    for (let k = 0; k < 3; k++) out[k] = Math.min(1, rgb[k] * shade + lift + spec);
  };
}

function Swatches({ label, options, value, onChange }: { label: string; options: Option[]; value: string; onChange: (id: string) => void }) {
  const light = ["ivory", "silver", "cream"];
  return (
    <fieldset className="border-t border-silver/15 pt-5">
      <legend className="eyebrow mb-4">{label}: <span className="normal-case tracking-normal text-warm">{options.find((o) => o.id === value)?.name}</span></legend>
      <div className="flex flex-wrap gap-3">
        {options.map((o) => {
          const on = o.id === value;
          return (
            <button key={o.id} type="button" onClick={() => onChange(o.id)} aria-pressed={on} aria-label={`${label}: ${o.name}`} title={o.name}
              className={`relative h-11 w-11 rounded-full border-2 transition-transform duration-300 hover:scale-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-silver ${on ? "border-warm" : "border-silver/30"}`}
              style={{ backgroundColor: o.hex }}>
              {on && <Check size={16} className="absolute inset-0 m-auto" style={{ color: light.includes(o.id) ? "#0B0D0F" : "#F5F5F2" }} aria-hidden />}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

export default function Visualiser() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const cache = useRef<Record<string, Prepared>>({});
  const reduce = useReducedMotion();
  const px = useMotionValue(0), py = useMotionValue(0);
  const sx = useSpring(px, { stiffness: 90, damping: 18, mass: 0.6 });
  const sy = useSpring(py, { stiffness: 90, damping: 18, mass: 0.6 });
  const rotateY = useTransform(sx, [-0.5, 0.5], [-7, 7]);
  const rotateX = useTransform(sy, [-0.5, 0.5], [5, -5]);
  const shiftX = useTransform(sx, [-0.5, 0.5], [5, -5]);
  const sheen = useTransform(sx, [-0.5, 0.5], ["0%", "100%"]);
  const track = (e: PointerEvent<HTMLDivElement>) => {
    if (reduce) return;
    const r = e.currentTarget.getBoundingClientRect();
    px.set((e.clientX - r.left) / r.width - 0.5); py.set((e.clientY - r.top) / r.height - 0.5);
  };
  const reset = () => { px.set(0); py.set(0); };
  const [carId, setCarId] = useState(cars[0].id);
  const car = cars.find((c) => c.id === carId) ?? cars[0];
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [paint, setPaint] = useState("racing");
  const [leather, setLeather] = useState("red");
  const get = (list: Option[], id: string) => list.find((o) => o.id === id)!;

  useEffect(() => {
    let alive = true;
    setFailed(false);
    if (cache.current[car.id]) { setReady(true); return; }
    setReady(false);
    Promise.all([loadImage(car.base), loadImage(car.masks)]).then(([b, m]) => {
      if (!alive) return;
      const base = pixels(b), mk = pixels(m);
      const n = base.length / 4, lum = new Float32Array(n), body = new Uint8ClampedArray(n), inter = new Uint8ClampedArray(n);
      for (let i = 0; i < n; i++) {
        lum[i] = (0.299 * base[i * 4] + 0.587 * base[i * 4 + 1] + 0.114 * base[i * 4 + 2]) / 255;
        body[i] = mk[i * 4]; inter[i] = mk[i * 4 + 1];
      }
      cache.current[car.id] = { base, lum, body, inter };
      setReady(true);
    }).catch(() => alive && setFailed(true));
    return () => { alive = false; };
  }, [car]);

  useEffect(() => {
    const d = cache.current[car.id], c = canvas.current;
    if (!ready || !d || !c) return;
    const ctx = c.getContext("2d")!;
    const img = ctx.createImageData(car.width, car.height), o = img.data;
    const paintFn = shadeFn(hexRgb(get(paints, paint).hex), car.paintRef, 1);
    const leatherFn = shadeFn(hexRgb(get(leathers, leather).hex), car.interiorRef, 0.5);
    const pc: [number, number, number] = [0, 0, 0], lc: [number, number, number] = [0, 0, 0];
    const n = d.lum.length;
    for (let i = 0; i < n; i++) {
      const j = i * 4;
      let wb = d.body[i] / 255, wi = d.inter[i] / 255;
      if (wb + wi > 1) { const s = wb + wi; wb /= s; wi /= s; }
      if (wb < 0.004 && wi < 0.004) { o[j] = d.base[j]; o[j + 1] = d.base[j + 1]; o[j + 2] = d.base[j + 2]; o[j + 3] = 255; continue; }
      const wo = 1 - wb - wi;
      const lum = d.lum[i];
      if (wb > 0) paintFn(lum, pc); if (wi > 0) leatherFn(lum, lc);
      for (let k = 0; k < 3; k++) {
        const v = (d.base[j + k] / 255) * wo + (wb > 0 ? pc[k] * wb : 0) + (wi > 0 ? lc[k] * wi : 0);
        o[j + k] = Math.round(Math.min(1, v) * 255);
      }
      o[j + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
  }, [ready, paint, leather, car]);

  const summary = `Design visualiser choices (illustrative, ${car.name}): Paint - ${get(paints, paint).name}${car.hasInterior ? `; Interior leather - ${get(leathers, leather).name}` : ""}.`;
  const href = `/contact?visualiser=${encodeURIComponent(summary)}`;

  return (
    <section aria-label="Colour and interior visualiser" className="bg-obsidian pb-14 sm:pb-20 lg:pb-32">
      <div className="container-x grid gap-8 lg:grid-cols-12 lg:gap-14">
        <div className="lg:col-span-7">
          <div role="group" aria-label="Choose a demo car" className="mb-4 flex flex-wrap gap-2">
            {cars.map((c) => (
              <button key={c.id} type="button" onClick={() => setCarId(c.id)} aria-pressed={c.id === carId}
                className={`border px-5 py-3 text-[11px] uppercase tracking-[0.22em] transition-colors ${c.id === carId ? "border-warm bg-warm text-obsidian" : "border-silver/30 text-silver hover:border-warm hover:text-warm"}`}>{c.name}</button>
            ))}
          </div>
          <div className="relative aspect-[4/3] cursor-grab touch-pan-y select-none overflow-hidden border border-silver/15 bg-graphite active:cursor-grabbing"
            style={{ perspective: 1000 }} onPointerMove={track} onPointerLeave={reset} onPointerCancel={reset}>
            <motion.div className="absolute inset-0" style={reduce ? undefined : { rotateX, rotateY, x: shiftX, scale: 1.03, transformStyle: "preserve-3d" }}>
              <Image key={car.id} src={car.base} alt={car.alt} fill priority sizes="(min-width:1024px) 58vw, 100vw" className="object-cover" />
              <canvas ref={canvas} width={car.width} height={car.height} role="img"
                aria-label={`${car.name} shown with ${get(paints, paint).name} paint${car.hasInterior ? ` and ${get(leathers, leather).name} leather interior` : ""}`}
                className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-500 ${ready ? "opacity-100" : "opacity-0"}`} />
              {!reduce && <motion.div aria-hidden className="pointer-events-none absolute inset-0 mix-blend-soft-light opacity-40"
                style={{ background: "linear-gradient(105deg, transparent 35%, rgba(255,255,255,.55) 50%, transparent 65%)", backgroundSize: "260% 100%", backgroundPositionX: sheen }} />}
            </motion.div>
            <span className="absolute bottom-3 left-3 border border-silver/30 bg-obsidian/70 px-2 py-1 text-[9px] uppercase tracking-[0.22em] text-silver">Illustrative recolour</span>
            {!reduce && <span className="pointer-events-none absolute bottom-3 right-3 bg-obsidian/70 px-2 py-1 text-[9px] uppercase tracking-[0.22em] text-silver">Move or drag to tilt</span>}
          </div>
          <p className="mt-4 text-xs leading-relaxed text-silver">{visualiserIntro.disclaimer}{car.credit ? ` Photo: ${car.credit}.` : ""}</p>
          {failed && <p role="alert" className="mt-2 text-xs text-racing">The colour tool could not load. Please refresh the page.</p>}
        </div>

        <div className="space-y-6 lg:col-span-5">
          <Swatches label="Paint" options={paints} value={paint} onChange={setPaint} />
          {car.hasInterior ? <Swatches label="Interior" options={leathers} value={leather} onChange={setLeather} /> : <p className="border-t border-silver/15 pt-5 text-xs leading-relaxed text-silver">Interior colours are available on the roadster. This coupe photo shows paint only.</p>}
          <div className="border border-silver/15 bg-graphite p-5" aria-live="polite">
            <p className="eyebrow mb-3">Your selection</p>
            <ul className="space-y-1 text-sm text-warm/80">
              <li>Paint: {get(paints, paint).name}</li>
              {car.hasInterior && <li>Interior: {get(leathers, leather).name} leather</li>}
            </ul>
            <Link href={href} className="btn-primary mt-5 w-full">Send My Choices</Link>
          </div>
        </div>
      </div>
    </section>
  );
}
