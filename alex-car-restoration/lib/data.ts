import { projects, type Project } from "@/content/projects";
import { services } from "@/content/services";
import { testimonials } from "@/content/testimonials";

/**
 * Single data-access layer. Today it reads local files; to adopt a CMS
 * (Sanity, Contentful, Payload...), replace these functions with fetches and
 * keep the return types — no page or component needs to change.
 */
export async function getProjects(): Promise<Project[]> { return projects; }
export async function getProject(slug: string): Promise<Project | undefined> {
  return projects.find((p) => p.slug === slug);
}
export async function getServices() { return services; }
export async function getTestimonials() { return testimonials; }
