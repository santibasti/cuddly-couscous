import type { Metadata } from "next";
import Portfolio from "@/components/Portfolio";
import { getProjects } from "@/lib/data";

export const metadata: Metadata = {
  title: "Our Work",
  description: "Restoration, bodywork and refinishing projects by Alex Car Restoration.",
  alternates: { canonical: "/projects" },
};

export default async function ProjectsPage() {
  const projects = await getProjects();
  return (
    <div className="pt-24">
      <div className="container-x pt-10"><p className="eyebrow">Our Work</p>
        <h1 className="h-display mt-6 max-w-5xl text-[clamp(2.2rem,6vw,6rem)]">Every vehicle has a story.</h1></div>
      <Portfolio projects={projects} showHeading={false} />
    </div>
  );
}
