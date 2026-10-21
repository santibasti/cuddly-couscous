import type { Metadata } from "next";
import PageHeader from "@/components/PageHeader";
import ProcessTimeline from "@/components/ProcessTimeline";
import Provenance from "@/components/Provenance";
import ConsultationCta from "@/components/ConsultationCta";
import { methodologies } from "@/content/process";

export const metadata: Metadata = {
  title: "Our Restoration Process | Frame-On & Frame-Off",
  description: "Explore Alex Car Restoration's two official 10-stage methodologies, Frame-On and Frame-Off restoration, and the Provenance Collection offered with completed Frame-Off restorations.",
  alternates: { canonical: "/process" },
};

export default function ProcessPage() {
  return (
    <>
      <PageHeader className="bg-graphite" eyebrow="Our Restoration Process" title="Two approaches. One standard of excellence."
        intro="Every vehicle deserves a restoration approach tailored to its condition, heritage, and intended outcome." />
      <section id="process" aria-label="Restoration methodologies" className="bg-graphite pb-14 sm:pb-20 lg:pb-32">
        <div className="container-x"><ProcessTimeline methodologies={methodologies} /></div>
      </section>
      <Provenance />
      <ConsultationCta heading="Not sure which restoration your vehicle needs?" button="Discuss Your Restoration Project" />
    </>
  );
}
