import { create } from 'zustand';
import type { BookingDraft, ConflictContext } from './store';
import type { ConflictReport } from '@/domain/conflicts';

/** Cross-page UI state for the booking flow (create/edit dialog, conflict modal, quick dialogs). */
interface Flow {
  form: null | { bookingId?: string; prefill?: Partial<BookingDraft>; conversationId?: string };
  conflict: null | { draft: BookingDraft; report: ConflictReport; context: ConflictContext; title?: string };
  searchOpen: boolean;
  openForm: (f?: NonNullable<Flow['form']>) => void;
  closeForm: () => void;
  openConflict: (c: NonNullable<Flow['conflict']>) => void;
  closeConflict: () => void;
  setSearchOpen: (v: boolean) => void;
}
export const useFlow = create<Flow>((set) => ({
  form: null, conflict: null, searchOpen: false,
  openForm: (f = {}) => set({ form: f }),
  closeForm: () => set({ form: null }),
  openConflict: (c) => set({ conflict: c }),
  closeConflict: () => set({ conflict: null }),
  setSearchOpen: (v) => set({ searchOpen: v }),
}));
