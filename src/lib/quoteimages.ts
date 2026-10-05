// Quotation images / attachments: optional pictures that explain a quotation or a variation (scope areas, panel-counting areas, additional work,
// site conditions, access limits, exclusions). They live in their own table / storage bucket — never mixed with job or service photos.
import { store, RuleError } from './store';
import type { DB, Job, QuoteImage, QuoteImageCategory, Quotation, Variation } from './types';

const db = (): DB => store.getDB();
const fail = (m: string): never => { throw new RuleError(m); };
export const IMAGE_CATEGORIES: QuoteImageCategory[] = ['Scope Area', 'Panel Count', 'Additional Work', 'Site Condition', 'Access Limitation', 'Exclusion', 'Other'];
export const MAX_IMAGES_PER_RECORD = 12;
export type ImageTarget = { quotation_id: string } | { variation_id: string };

const targetOf = (d: DB, t: ImageTarget): { q?: Quotation; v?: Variation; job?: Job } => {
  if ('quotation_id' in t) { const q = d.quotations.find((x) => x.id === t.quotation_id); return { q, job: d.jobs.find((j) => j.quotation_id === t.quotation_id && !j.deleted_at && j.leader_id === store.user?.employee_id) }; }
  const v = d.variations.find((x) => x.id === t.variation_id); return { v, job: v ? d.jobs.find((j) => j.id === v.job_id) : undefined };
};
/** Why the current user may not add / delete images on this record, or undefined when they may. */
export function imageBlock(d: DB, t: ImageTarget): string | undefined {
  const { q, v, job } = targetOf(d, t);
  if (!q && !v) return 'The quotation or variation was not found.';
  if (!store.can('quoteimg.manage')) return 'Only the Admin, Operations Manager or the assigned Team Leader can add or delete quotation images.';
  const emp = store.user?.employee_id;
  const manager = store.can('sales.edit') || store.can('jobs.all');
  const assigned = !!emp && ((q && (q.ocular_assignee_id === emp || !!job)) || (v && job?.leader_id === emp));
  if (!manager && !assigned) return 'Only the assigned Team Leader can add or delete images on this record.';
  if (q && ['Approved', 'Rejected', 'Expired'].includes(q.status)) return `This quotation is ${q.status.toLowerCase()}: its images are locked with it. Duplicate the quotation to add new ones.`;
  if (v && ['Approved', 'Rejected'].includes(v.status)) return `This variation is ${v.status.toLowerCase()}: its images are locked with it.`;
  return undefined;
}
export const canManageImages = (d: DB, t: ImageTarget) => !imageBlock(d, t);

export interface QuoteImageInput {
  file: string; name: string; width: number; height: number;
  category: QuoteImageCategory; caption?: string; item_index?: number; share_with_client?: boolean;
}
function checkMeta(d: DB, t: ImageTarget, f: Pick<QuoteImageInput, 'category' | 'caption' | 'item_index'>): string | undefined {
  if (!IMAGE_CATEGORIES.includes(f.category)) fail('Choose a category for the image.');
  if ((f.caption ?? '').length > 140) fail('Keep the caption short (140 characters).');
  if (f.item_index === undefined) return undefined;
  const { q, v } = targetOf(d, t); const items = (q?.items ?? v?.items) ?? [];
  if (!Number.isInteger(f.item_index) || f.item_index < 0 || f.item_index >= items.length) fail('The linked line item no longer exists.');
  return items[f.item_index].description;
}
export function addQuoteImage(t: ImageTarget, f: QuoteImageInput): QuoteImage {
  const d = db();
  const block = imageBlock(d, t); if (block) fail(block);
  if (!f.file.startsWith('data:image/')) fail('Choose an image file.');
  if (f.file.length > 2_200_000) fail('That image is too large. Use a smaller picture.');
  if (d.quote_images.filter((i) => !i.deleted_at && ('quotation_id' in t ? i.quotation_id === t.quotation_id : i.variation_id === t.variation_id)).length >= MAX_IMAGES_PER_RECORD) fail(`A maximum of ${MAX_IMAGES_PER_RECORD} images can be attached to one quotation or variation.`);
  const label = checkMeta(d, t, f);
  const v = 'variation_id' in t ? d.variations.find((x) => x.id === t.variation_id) : undefined;
  const label2 = 'quotation_id' in t ? d.quotations.find((x) => x.id === t.quotation_id)?.number : v?.number;
  return store.insert('quote_images', { ...t, ...(v ? { job_id: v.job_id } : {}), category: f.category, caption: (f.caption ?? '').trim(), item_index: f.item_index, item_label: label, file: f.file, name: f.name, width: f.width, height: f.height, share_with_client: !!f.share_with_client } as never,
    `Quotation image added to ${label2}: ${f.category}${f.caption ? ` — ${f.caption.trim()}` : ''}`) as QuoteImage;
}
export function updateQuoteImage(id: string, patch: Partial<Pick<QuoteImage, 'category' | 'caption' | 'item_index' | 'share_with_client'>>) {
  const d = db(); const img = d.quote_images.find((i) => i.id === id) ?? fail('Image not found.');
  const t: ImageTarget = img.quotation_id ? { quotation_id: img.quotation_id } : { variation_id: img.variation_id! };
  const block = imageBlock(d, t); if (block) fail(block);
  const next = { category: patch.category ?? img.category, caption: patch.caption ?? img.caption, item_index: 'item_index' in patch ? patch.item_index : img.item_index };
  const label = checkMeta(d, t, next);
  return store.update('quote_images', id, { ...patch, caption: next.caption.trim(), item_label: next.item_index === undefined ? undefined : label } as never, 'update', `Quotation image updated: ${next.category}${next.caption ? ` — ${next.caption}` : ''}`);
}
export function deleteQuoteImage(id: string) {
  const d = db(); const img = d.quote_images.find((i) => i.id === id) ?? fail('Image not found.');
  const block = imageBlock(d, img.quotation_id ? { quotation_id: img.quotation_id } : { variation_id: img.variation_id! }); if (block) fail(block);
  store.remove('quote_images', id);
}
/** Images of one quotation / variation; `sharedOnly` is what the client sees and what goes into a client PDF. */
export function quoteImagesOf(d: Pick<DB, 'quote_images'>, t: ImageTarget, sharedOnly = false): QuoteImage[] {
  return d.quote_images.filter((i) => !i.deleted_at && ('quotation_id' in t ? i.quotation_id === t.quotation_id : i.variation_id === t.variation_id) && (!sharedOnly || i.share_with_client))
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
}
/** Copy a quotation's images onto its revision (the original keeps its own, unchanged). */
export function copyQuoteImages(fromQuotationId: string, toQuotationId: string) {
  for (const i of quoteImagesOf(db(), { quotation_id: fromQuotationId })) {
    const { id: _i, created_at: _c, updated_at: _u, created_by: _b, ...rest } = i; void [_i, _c, _u, _b];
    store.insert('quote_images', { ...rest, quotation_id: toQuotationId } as never, `Quotation image copied to the revision: ${i.category}`);
  }
}
