// Live builds: demo sample data is never used, so it is not bundled up front.
import type { DB } from './types';
export const seedDB = (): DB => { throw new Error('Demo data is not available on the live site.'); };
