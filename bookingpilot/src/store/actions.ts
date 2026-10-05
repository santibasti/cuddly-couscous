import { toast } from 'sonner';
import { useStore, type BookingDraft, type SaveResult } from './store';
import { useFlow } from './flow';

/** Shared handling of SaveResults: toasts for outcomes, opens the conflict modal for conflicts. */
export function handleResult(out: SaveResult, okMessage?: string): boolean {
  if (out.kind === 'saved') {
    toast.success(okMessage ?? out.note ?? `Saved ${out.booking.ref}`);
    return true;
  }
  if (out.kind === 'conflict') {
    useFlow.getState().openConflict({ draft: out.draft, report: out.report, context: out.context });
    return false;
  }
  toast.error(out.message);
  return false;
}

export const bookingActions = {
  save: (draft: BookingDraft, msg?: string) => handleResult(useStore.getState().saveBooking(draft), msg),
  confirm: (id: string) => handleResult(useStore.getState().confirmBooking(id), 'Booking confirmed — no conflicts found'),
  move: (id: string, resourceId: string, checkIn: string) => handleResult(useStore.getState().moveBooking(id, resourceId, checkIn), 'Booking moved'),
  cancel: (id: string, reason: string) => handleResult(useStore.getState().cancelBooking(id, reason), 'Booking cancelled'),
  setStatus: (id: string, s: Parameters<ReturnType<typeof useStore.getState>['setStatus']>[1]) => handleResult(useStore.getState().setStatus(id, s), 'Status updated'),
};
