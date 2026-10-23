import type { MetadataRoute } from "next";
import { site } from "@/content/site";
import { getProjects } from "@/lib/data";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const projects = (await getProjects()).filter((p) => !p.placeholder && p.detailsConfirmed);
  const pages = [
    { path: "", priority: 1 },
    { path: "/about", priority: 0.8 },
    { path: "/services", priority: 0.8 },
    { path: "/process", priority: 0.8 },
    { path: "/portfolio", priority: 0.8 },
    { path: "/visualiser", priority: 0.5 },
    { path: "/contact", priority: 0.7 },
  ];
  return [
    ...pages.map((p) => ({ url: `${site.url}${p.path}`, changeFrequency: "monthly" as const, priority: p.priority })),
    ...projects.map((p) => ({ url: `${site.url}/portfolio/${p.slug}`, priority: 0.6 })),
  ];
}
