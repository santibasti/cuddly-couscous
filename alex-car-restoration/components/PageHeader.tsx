import Reveal from "./Reveal";

/** Consistent header for inner pages (h1 + optional intro). Sits below the fixed nav. */
export default function PageHeader({ eyebrow, title, intro, className = "bg-obsidian" }: { eyebrow: string; title: string; intro?: string; className?: string }) {
  return (
    <header className={`${className} pb-10 pt-32 sm:pb-14 sm:pt-40 lg:pt-52`}>
      <div className="container-x">
        <Reveal><p className="eyebrow mb-6">{eyebrow}</p></Reveal>
        <Reveal delay={0.1}><h1 className="h-display max-w-5xl text-[clamp(2.2rem,6vw,6rem)]">{title}</h1></Reveal>
        {intro && <Reveal delay={0.2}><p className="mt-6 max-w-2xl text-base leading-relaxed text-warm/75 sm:mt-8 sm:text-lg">{intro}</p></Reveal>}
      </div>
    </header>
  );
}
