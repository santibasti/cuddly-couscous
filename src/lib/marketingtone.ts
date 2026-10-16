/** The moods the Marketing AI can write in. "Mixed" lets it vary from post to post. */
export const TONES = ['Mixed', 'Friendly', 'Professional', 'Warm & caring', 'Excited & upbeat', 'Fun & playful', 'Calm & reassuring', 'Inspiring', 'Expert & educational', 'Urgent (limited slots)'] as const;
export type Tone = (typeof TONES)[number];
