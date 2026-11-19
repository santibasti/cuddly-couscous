// A customer's photo arrives in the chat as a link to the picture (ManyChat passes the attachment address as the message text; a direct Facebook message carries a marker sentence).
// The same test lives in supabase/functions/_shared/brain.ts (isPhotoMessage); a test keeps the two in step.
export const PHOTO_MARKER = '[The customer sent a photo or attachment]';
export const isPhotoMessage = (t: string): boolean => {
  const s = String(t ?? '').trim(); if (!s) return false; if (s === PHOTO_MARKER) return true;
  if (!/^https:\/\/[^\s]+$/i.test(s)) return false;
  return /(fbcdn\.net|fbsbx\.com|cdninstagram\.com|manychat\.com|chatfuel|\.(jpe?g|png|gif|webp|heic|mp4|mov)(\?|$))/i.test(s);
};
