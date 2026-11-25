// Which owner alerts are texted (SMS). The owner wants a text ONLY when a client approves a quotation, or when the chat books a job automatically.
// Every other alert (chat needs a person, AI reply waits for approval, new leads, photos, on-site signatures, additional scope, discount requests, errors ...) stays in the app (alert_outbox / AI Chat / Jarvis) and is NOT texted.
// 'test' is the Admin "send a test SMS" button.
export const SMS_KINDS: readonly string[] = ['quotation', 'booking', 'test'];
export const shouldText = (kind: string | null | undefined): boolean => SMS_KINDS.includes(String(kind ?? ''));
export const NOT_TEXTED = 'Not texted: only approved quotations and automatic bookings are sent by SMS';
