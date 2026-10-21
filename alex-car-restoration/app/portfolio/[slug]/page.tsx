import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import BeforeAfter from "@/components/BeforeAfter";
import Media from "@/components/Media";
import Reveal from "@/components/Reveal";
import GalleryGrid from "@/components/GalleryGrid";
import { getProject, getProjects } from "@/lib/data";
import { categoryLabels } from "@/content/projects";

type Params = { params: { slug: string } };

export async function generateStaticParams() {
  return (await getProjects()).map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const p = await getProject(params.slug);
  if (!p) return {};
  return {
    title: `${p.make} ${p.model} — ${categoryLabels[p.category]}`,
    description: p.summary,
    alternates: { canonical: `/portfolio/${p.slug}` },
    robots: p.placeholder || !p.detailsConfirmed ? { index: false, follow: true } : undefined,
  };
}

export default async function ProjectPage({ params }: Params) {
  const p = await getProject(params.slug);
  if (!p) notFound();
  const name = `${p.make} ${p.model}`;
  return (
    <article className="pt-24">
      <Media src={p.hero} alt={name} label="Project hero" className="h-[60svh] w-full" priority />
      <div className="container-x grid gap-14 py-20 lg:grid-cols-12 lg:py-28">
        <div className="lg:col-span-7">
          <p className="eyebrow">{categoryLabels[p.category]}</p>
          <h1 className="h-display mt-5 text-[clamp(2.2rem,6vw,5.5rem)]">{p.headline ?? name}</h1>
          {p.placeholder && <p className="mt-6 inline-block bg-racing px-3 py-1 text-[10px] uppercase tracking-[0.22em]">Placeholder project — replace with authorised content</p>}
          <div className="mt-10 max-w-2xl space-y-6 text-base leading-relaxed text-warm/75">{p.narrative.map((t) => <p key={t}>{t}</p>)}</div>
        </div>
        {p.scope.length > 0 && (
          <aside className="lg:col-span-4 lg:col-start-9">
            <h2 className="eyebrow mb-4">Scope of restoration</h2>
            <ul className="divide-y divide-silver/15 border-y border-silver/15 text-sm">{p.scope.map((s) => <li key={s} className="py-3">{s}</li>)}</ul>
          </aside>
        )}
      </div>
      {(p.placeholder || (p.before && p.after)) && (
        <div className="container-x pb-20">
          <Reveal><h2 className="eyebrow mb-4">Before &amp; after</h2>
            <BeforeAfter before={p.before} after={p.after} altBefore={`${name} before restoration`} altAfter={`${name} after restoration`} /></Reveal>
        </div>
      )}
      {p.gallery && p.gallery.length > 0 ? (
        <div className="container-x pb-24">
          <Reveal><h2 className="eyebrow mb-6">Gallery</h2></Reveal>
          <GalleryGrid items={p.gallery} layout="masonry" />
        </div>
      ) : p.placeholder ? (
        <div className="container-x grid gap-3 pb-24 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Reveal key={i}><Media alt={`${name} placeholder photograph ${i + 1}`} label="Process" tone={i} className="aspect-[4/3] w-full" sizes="(min-width:1024px) 30vw, 100vw" /></Reveal>
          ))}
        </div>
      ) : null}
      <div className="border-t border-silver/15 py-20 text-center">
        <Link href="/contact" className="btn-primary">Start Your Restoration</Link>
        <div className="mt-8"><Link href="/portfolio" className="text-[11px] uppercase tracking-[0.22em] text-silver hover:text-warm">← Portfolio</Link></div>
      </div>
    </article>
  );
}
