import Link from "next/link";
import { Facebook, Instagram, Youtube } from "lucide-react";
import { nav, site } from "@/content/site";
import { services } from "@/content/services";

export default function Footer() {
  const c = site.contact;
  const socials = [
    { href: site.social.facebook, label: "Facebook", Icon: Facebook },
    { href: site.social.instagram, label: "Instagram", Icon: Instagram },
    { href: site.social.youtube, label: "YouTube", Icon: Youtube },
  ].filter((s) => s.href);
  return (
    <footer className="border-t border-silver/15 bg-obsidian pb-28 pt-20 lg:pb-12">
      <div className="container-x grid gap-12 md:grid-cols-12">
        <div className="md:col-span-4">
          <p className="font-display text-lg font-semibold uppercase tracking-[0.3em]">Alex <span className="text-silver">Car Restoration</span></p>
          <p className="mt-4 text-xs uppercase tracking-[0.28em] text-silver">Heritage. Precision. Perfection.</p>
          {socials.length > 0 && (
            <div className="mt-8 flex gap-4">
              {socials.map(({ href, label, Icon }) => (
                <a key={label} href={href!} aria-label={label} target="_blank" rel="noopener noreferrer" className="text-silver hover:text-warm"><Icon size={20} /></a>
              ))}
            </div>
          )}
        </div>
        <nav aria-label="Footer" className="md:col-span-2">
          <p className="eyebrow mb-4">Navigate</p>
          <ul className="space-y-2 text-sm">{nav.map((n) => <li key={n.href}><Link href={n.href} className="text-warm/70 hover:text-warm">{n.label}</Link></li>)}</ul>
        </nav>
        <div className="md:col-span-3">
          <p className="eyebrow mb-4">Services</p>
          <ul className="space-y-2 text-sm text-warm/70">{services.map((s) => <li key={s.id}>{s.title}</li>)}</ul>
        </div>
        <div className="md:col-span-3">
          <p className="eyebrow mb-4">Contact</p>
          <ul className="space-y-2 text-sm text-warm/70">
            {c.phone && <li><a href={`tel:${c.phone.replace(/\s/g, "")}`}>{c.phone}</a></li>}
            {c.email && <li><a href={`mailto:${c.email}`}>{c.email}</a></li>}
            {c.address && <li>{c.address}</li>}
            {!c.phone && !c.email && !c.address && <li>Contact details to be confirmed.</li>}
            <li>Philippines</li>
          </ul>
        </div>
      </div>
      <div className="container-x mt-16 border-t border-silver/10 pt-6 text-xs text-silver/70">
        © {new Date().getFullYear()} {site.name}. All rights reserved.
      </div>
    </footer>
  );
}
