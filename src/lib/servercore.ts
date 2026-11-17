// The pure business code that the chat functions (which run on the server) share with the app: pricing, the internal quotation text and the Job Order content.
// Bundled into supabase/functions/_shared/appcore.mjs by `npm run build:core` (commit the result). Keep this file free of browser and store code.
export { priceService, docTotals } from './business';
export { defaultIntro, defaultMethodology, defaultDisclaimer, defaultCrew, syncMethodSections } from './quote-text';
export { buildContent, contentKey } from './joborder-core';
