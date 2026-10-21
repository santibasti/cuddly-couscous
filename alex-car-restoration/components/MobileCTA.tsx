import Link from "next/link";
import { site } from "@/content/site";

/** Sticky contact bar for mobile only. Uses verified call/WhatsApp when available. */
export default function MobileCTA() {
  const { phone, whatsapp } = site.contact;
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 flex border-t border-silver/15 bg-obsidian/95 backdrop-blur lg:hidden">
      {phone && <a href={`tel:${phone.replace(/\s/g, "")}`} className="btn flex-1 border-r border-silver/15 text-warm">Call</a>}
      {whatsapp && <a href={`https://wa.me/${whatsapp}`} className="btn flex-1 border-r border-silver/15 text-warm">WhatsApp</a>}
      <Link href="/contact" className="btn-primary flex-[2]">Start Your Restoration</Link>
    </div>
  );
}
