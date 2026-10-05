import type { BookingItem } from '@/types';
/** items[0] is the room/resource charge; its quantity follows the length of stay. */
export function retotalItems(items: BookingItem[], nights: number): BookingItem[] {
  return items.map((it, i) => (i === 0 ? { ...it, quantity: nights, description: it.description.replace(/· \d+ (night|day)s?/, `· ${nights} $1${nights === 1 ? '' : 's'}`) } : it));
}
