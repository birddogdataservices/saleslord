// Slop phrase list — keep in sync with .claude/skills/slop-detection.md
// Detection runs client-side on all generated copy before display.
// Flag, don't silently strip.

export const SLOP_PHRASES = [
  'i hope this finds you well',
  'hope this email finds you',
  'just wanted to reach out',
  'i wanted to touch base',
  'circling back',
  'following up on my previous',
  'as per my last',
  'synergies',
  'leverage',
  'at the end of the day',
  'move the needle',
  'low-hanging fruit',
  'boil the ocean',
  'game changer',
  'thought leader',
  'reach out',
  'ping me',
  "let's connect",
  'would love to',
  'excited to share',
  "i hope you're doing well",
  'quick question',
  'quick call',
  '15 minutes',
  '15-minute call',
  'pick your brain',
  'just following up',
  'bumping this',
  'wanted to connect',
  'i came across your',
  'i noticed that you',
] as const

export function detectSlop(text: string): string[] {
  if (!text) return []
  const lower = text.toLowerCase()
  return SLOP_PHRASES.filter(p => lower.includes(p))
}
