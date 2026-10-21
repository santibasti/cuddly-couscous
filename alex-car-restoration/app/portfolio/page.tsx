import type { Metadata } from "next";
import PageHeader from "@/components/PageHeader";
import Portfolio from "@/components/Portfolio";
import ConsultationCta from "@/components/ConsultationCta";
import { getProjects } from "@/lib/data";

export const metadata: Metadata = {
  title: "Portfolio",
  description: "Real vehicles from the Alex Car Restoration workshop: classic Porsche 911, classic Mini, Ford Mustang, Ford GT, Nissan GT-R and more.",
  alternates: { canonical: "/portfolio" },
};

export default async function PortfolioPage() {
  const projects = await getProjects();
  return (
    <>
      <PageHeader eyebrow="Portfolio" title="Every vehicle has a story." intro="Photographs from the Alex Car Restoration workshop. Select a vehicle to view its gallery." />
      <Portfolio projects={projects} showHeading={false} tight />
      <ConsultationCta />
    </>
  );
}
