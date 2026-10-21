import Hero from "@/components/Hero";
import HeritageTeaser from "@/components/HeritageTeaser";
import Portfolio from "@/components/Portfolio";
import ProcessPreview from "@/components/ProcessPreview";
import PhilosophyTeaser from "@/components/PhilosophyTeaser";
import ProvenanceTeaser from "@/components/ProvenanceTeaser";
import ConsultationCta from "@/components/ConsultationCta";
import { getProjects } from "@/lib/data";

/** Home: short, cinematic, conversion-focused. Each preview links to its full page. */
export default async function Home() {
  const projects = await getProjects();
  return (
    <>
      <Hero />
      <HeritageTeaser />
      <Portfolio projects={projects} limit={4} showFilters={false} />
      <ProcessPreview />
      <PhilosophyTeaser />
      <ProvenanceTeaser />
      <ConsultationCta />
    </>
  );
}
