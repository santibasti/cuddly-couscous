"use client";
import Link from "next/link";
import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Check } from "lucide-react";
import { paints, wheels, leathers, stitching, carpets, visualiserIntro, type Option } from "@/content/visualiser";

const fade = { transition: "fill 600ms ease, stroke 600ms ease" } as const;

/** Illustrative generic classic coupe (side view). Not a specific vehicle. */
function Exterior({ paint, wheel }: { paint: string; wheel: string }) {
  const dark = "#0B0D0F";
  return (
    <svg viewBox="0 0 800 360" role="img" aria-label="Illustrative classic coupe in the selected colour" className="h-full w-full">
      <ellipse cx="400" cy="322" rx="330" ry="14" fill="#000" opacity=".45" />
      <path d="M62 258 L62 222 C62 200 80 190 108 184 L186 172 C226 124 268 98 330 95 L470 95 C522 97 562 122 604 162 L694 178 C730 184 746 198 748 224 L748 258 Z" fill={paint} style={fade} />
      <path d="M62 236 L748 236 L748 258 L62 258 Z" fill="#000" opacity=".28" />
      <path d="M186 172 C226 124 268 98 330 95 L470 95" fill="none" stroke="#fff" strokeOpacity=".22" strokeWidth="3" />
      <path d="M212 170 C244 126 282 107 332 105 L404 105 L404 170 Z" fill="#161a1e" />
      <path d="M416 105 L470 105 C506 107 538 126 568 168 L416 170 Z" fill="#161a1e" />
      <path d="M212 170 C244 126 282 107 332 105" fill="none" stroke="#fff" strokeOpacity=".18" strokeWidth="2" />
      <line x1="410" y1="105" x2="410" y2="236" stroke={dark} strokeOpacity=".5" strokeWidth="2" />
      <rect x="372" y="186" width="26" height="6" rx="3" fill="#C9CDD1" />
      <path d="M700 226 L752 226 M62 232 L112 232" stroke="#C9CDD1" strokeWidth="7" strokeLinecap="round" />
      <circle cx="718" cy="206" r="14" fill="#E9E6DA" opacity=".9" />
      <rect x="62" y="206" width="14" height="22" rx="4" fill="#A51C30" />
      {[190, 590].map((cx) => (
        <g key={cx}>
          <circle cx={cx} cy="252" r="64" fill={dark} />
          <circle cx={cx} cy="252" r="52" fill="#16181b" />
          <circle cx={cx} cy="252" r="36" fill={wheel} style={fade} />
          {[0, 72, 144, 216, 288].map((a) => (
            <rect key={a} x={cx - 4} y={252 - 34} width="8" height="26" rx="3" fill={dark} opacity=".55" transform={`rotate(${a} ${cx} 252)`} />
          ))}
          <circle cx={cx} cy="252" r="9" fill={dark} />
        </g>
      ))}
    </svg>
  );
}

/** Illustrative cabin cut-away: dash, wheel, seat, door card, carpet. */
function Interior({ leather, thread, carpet }: { leather: string; thread: string; carpet: string }) {
  const stitch = { stroke: thread, strokeWidth: 2, strokeDasharray: "7 6", fill: "none", style: fade } as const;
  return (
    <svg viewBox="0 0 800 360" role="img" aria-label="Illustrative cabin in the selected leather, stitching and carpet" className="h-full w-full">
      <rect width="800" height="360" fill="#101215" />
      <path d="M40 40 L360 28 L330 128 L40 140 Z" fill="#1d242b" />
      <path d="M40 150 L350 138 L350 214 L40 226 Z" fill={leather} style={fade} />
      <path d="M52 168 L338 157" {...stitch} />
      <rect x="120" y="178" width="46" height="24" rx="4" fill="#0B0D0F" opacity=".6" />
      <rect x="188" y="178" width="46" height="24" rx="4" fill="#0B0D0F" opacity=".6" />
      <rect x="40" y="226" width="320" height="74" fill="#0B0D0F" opacity=".35" />
      <g transform="rotate(-16 330 200)">
        <ellipse cx="330" cy="200" rx="13" ry="62" fill="none" stroke={leather} strokeWidth="13" style={fade} />
        <ellipse cx="330" cy="200" rx="13" ry="62" fill="none" stroke={thread} strokeWidth="2" strokeDasharray="6 6" style={fade} />
        <rect x="320" y="194" width="10" height="12" fill="#C9CDD1" />
      </g>
      <rect x="352" y="196" width="10" height="70" rx="4" fill="#2a2d31" transform="rotate(-16 357 230)" />
      <rect x="420" y="236" width="190" height="48" rx="14" fill={leather} style={fade} />
      <path d="M432 262 L598 262" {...stitch} />
      <path d="M560 244 L600 108 C604 94 624 90 640 98 L668 112 C680 120 680 134 676 148 L630 256 Z" fill={leather} style={fade} />
      <path d="M606 140 L648 252 M634 128 L670 138" {...stitch} />
      <rect x="590" y="62" width="58" height="46" rx="14" fill={leather} style={fade} transform="rotate(16 619 85)" />
      <rect x="700" y="40" width="70" height="262" rx="12" fill={leather} style={fade} />
      <rect x="700" y="40" width="70" height="262" rx="12" fill="#000" opacity=".28" />
      <rect x="708" y="170" width="54" height="26" rx="10" fill={leather} style={fade} />
      <path d="M712 110 L758 110 M712 230 L758 230" {...stitch} />
      <rect x="0" y="300" width="800" height="60" fill={carpet} style={fade} />
      <rect x="0" y="300" width="800" height="6" fill="#000" opacity=".35" />
    </svg>
  );
}

function Swatches({ label, options, value, onChange }: { label: string; options: Option[]; value: string; onChange: (id: string) => void }) {
  return (
    <fieldset className="border-t border-silver/15 pt-5">
      <legend className="eyebrow mb-4">{label}: <span className="text-warm normal-case tracking-normal">{options.find((o) => o.id === value)?.name}</span></legend>
      <div className="flex flex-wrap gap-3">
        {options.map((o) => {
          const on = o.id === value;
          return (
            <button key={o.id} type="button" onClick={() => onChange(o.id)} aria-pressed={on} aria-label={`${label}: ${o.name}`} title={o.name}
              className={`relative h-11 w-11 rounded-full border-2 transition-transform duration-300 hover:scale-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-silver ${on ? "border-warm" : "border-silver/30"}`}
              style={{ backgroundColor: o.hex }}>
              {on && <Check size={16} className="absolute inset-0 m-auto" style={{ color: ["ivory", "silver", "polished", "cream", "contrast-cream", "sand"].includes(o.id) ? "#0B0D0F" : "#F5F5F2" }} aria-hidden />}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

export default function Visualiser() {
  const reduce = useReducedMotion();
  const [view, setView] = useState<"exterior" | "interior">("exterior");
  const [paint, setPaint] = useState("racing");
  const [wheel, setWheel] = useState("polished");
  const [leather, setLeather] = useState("tan");
  const [thread, setThread] = useState("contrast-cream");
  const [carpet, setCarpet] = useState("carbon");
  const get = (list: Option[], id: string) => list.find((o) => o.id === id)!;

  const summary = `Design visualiser choices (illustrative): Paint - ${get(paints, paint).name}; Wheels - ${get(wheels, wheel).name}; Leather - ${get(leathers, leather).name}; Stitching - ${get(stitching, thread).name}; Carpet - ${get(carpets, carpet).name}.`;
  const href = `/contact?visualiser=${encodeURIComponent(summary)}`;

  return (
    <section aria-label="Colour and interior visualiser" className="bg-obsidian pb-14 sm:pb-20 lg:pb-32">
      <div className="container-x grid gap-8 lg:grid-cols-12 lg:gap-14">
        <div className="lg:col-span-7">
          <div role="tablist" aria-label="View" className="mb-4 flex gap-2">
            {(["exterior", "interior"] as const).map((v) => (
              <button key={v} role="tab" aria-selected={view === v} onClick={() => setView(v)}
                className={`border px-5 py-3 text-[11px] uppercase tracking-[0.22em] transition-colors ${view === v ? "border-warm bg-warm text-obsidian" : "border-silver/30 text-silver hover:border-warm hover:text-warm"}`}>{v}</button>
            ))}
          </div>
          <div className="relative aspect-[20/9] overflow-hidden border border-silver/15 bg-graphite sm:aspect-[800/360]">
            <AnimatePresence mode="wait">
              <motion.div key={view} className="absolute inset-0" initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={reduce ? undefined : { opacity: 0 }} transition={{ duration: 0.35 }}>
                {view === "exterior"
                  ? <Exterior paint={get(paints, paint).hex} wheel={get(wheels, wheel).hex} />
                  : <Interior leather={get(leathers, leather).hex} thread={get(stitching, thread).hex} carpet={get(carpets, carpet).hex} />}
              </motion.div>
            </AnimatePresence>
            <span className="absolute bottom-3 left-3 border border-silver/30 bg-obsidian/70 px-2 py-1 text-[9px] uppercase tracking-[0.22em] text-silver">Illustrative demo car</span>
          </div>
          <p className="mt-4 text-xs leading-relaxed text-silver">{visualiserIntro.disclaimer}</p>
        </div>

        <div className="space-y-6 lg:col-span-5">
          {view === "exterior" ? (
            <>
              <Swatches label="Paint" options={paints} value={paint} onChange={setPaint} />
              <Swatches label="Wheels" options={wheels} value={wheel} onChange={setWheel} />
            </>
          ) : (
            <>
              <Swatches label="Leather" options={leathers} value={leather} onChange={setLeather} />
              <Swatches label="Stitching" options={stitching} value={thread} onChange={setThread} />
              <Swatches label="Carpet" options={carpets} value={carpet} onChange={setCarpet} />
            </>
          )}
          <div className="border border-silver/15 bg-graphite p-5" aria-live="polite">
            <p className="eyebrow mb-3">Your selection</p>
            <ul className="space-y-1 text-sm text-warm/80">
              <li>Paint: {get(paints, paint).name}</li>
              <li>Wheels: {get(wheels, wheel).name}</li>
              <li>Leather: {get(leathers, leather).name}</li>
              <li>Stitching: {get(stitching, thread).name}</li>
              <li>Carpet: {get(carpets, carpet).name}</li>
            </ul>
            <Link href={href} className="btn-primary mt-5 w-full">Send My Choices</Link>
          </div>
        </div>
      </div>
    </section>
  );
}
