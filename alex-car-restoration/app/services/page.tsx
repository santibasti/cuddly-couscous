import type { Metadata } from "next";
import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import Services from "@/components/Services";
import RestorationValue from "@/components/RestorationValue";
import ConsultationCta from "@/components/ConsultationCta";
import { getServices } from "@/lib/data";

export const metadata: Metadata = {
  title: "Restoration Services",
  description: "Classic and vintage restoration, luxury vehicle restoration, precision bodywork and refinishing, custom projects, paint correction and complete vehicle transformation in the Philippines.",
  alternates: { canonical: "/services" },
};

export default async function ServicesPage() {
  const services = await getServices();
  return (
    <>
      <PageHeader className="bg-graphite" eyebrow="Our Expertise" title="Premium services, delivered with precision."
        intro="From classic and vintage restoration to precision bodywork and refinishing, every service is carried out with the same standard of craftsmanship." />
      <Services services={services} showHeading={false} />
      <section aria-label="Restoration approaches" className="border-t border-silver/10 bg-obsidian py-10">
        <div className="container-x flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-warm/75">Frame-On or Frame-Off? Explore both 10-stage restoration methodologies.</p>
          <Link href="/process" className="btn-ghost">Our Process</Link>
        </div>
      </section>
      <RestorationValue />
      <ConsultationCta />
    </>
  );
}
