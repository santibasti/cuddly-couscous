import type { Metadata } from "next";
import PageHeader from "@/components/PageHeader";
import Visualiser from "@/components/Visualiser";
import ConsultationCta from "@/components/ConsultationCta";
import { visualiserIntro as v } from "@/content/visualiser";

export const metadata: Metadata = {
  title: "Colour & Interior Visualiser",
  description: "Explore paint, wheel and interior combinations on an illustrative demo car, then discuss your restoration with Alex Car Restoration.",
  alternates: { canonical: "/visualiser" },
};

export default function VisualiserPage() {
  return (
    <>
      <PageHeader eyebrow={v.eyebrow} title={v.title} intro={v.intro} />
      <Visualiser />
      <ConsultationCta />
    </>
  );
}
