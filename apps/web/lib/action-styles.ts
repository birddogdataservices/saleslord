import type { CSSProperties } from 'react'

// Prospect topbar actions, styled by what clicking them does — one colour per
// kind of action, not one per button.
//
//   research  blue     spends the rep's key on a web-search run ($0.30–$0.65)
//                      and confirms first. Blue already means "research" in this
//                      app: the empty-state Run research button uses it.
//   writing   purple   opens a drafting panel; cheap calls.
//   utility   neutral  free — export, archive.
//   confirm   amber    the step between a research click and the spend.
//
// Kept in one place because the topbar had drifted into three text colours on
// six identical outlines, and two of those buttons (Refresh company, Archive)
// used --sl-text3 — about 2.7:1 on white, well under the 4.5:1 that 11px text
// needs. Every pairing here clears 4.5:1. The tinted kinds keep a 1px border in
// their own background colour, so every button is the same size as the
// outlined ones and the row does not jitter between states.
export const ACTION_BUTTON_CLASS =
  'text-[11px] px-3 py-[5px] rounded-[6px] font-medium cursor-pointer transition-opacity hover:opacity-80 disabled:opacity-40 disabled:cursor-not-allowed'

export const ACTION_STYLE = {
  research: { border: '1px solid var(--sl-blue-bg)',   background: 'var(--sl-blue-bg)',   color: 'var(--sl-blue-t)' },
  writing:  { border: '1px solid var(--sl-purple-bg)', background: 'var(--sl-purple-bg)', color: 'var(--sl-purple-t)' },
  utility:  { border: '1px solid var(--sl-border)',    background: 'var(--sl-surface)',   color: 'var(--sl-text2)' },
  confirm:  { border: '1px solid var(--sl-amber-bg)',  background: 'var(--sl-amber-bg)',  color: 'var(--sl-amber-t)' },
} satisfies Record<string, CSSProperties>

export type ActionKind = keyof typeof ACTION_STYLE
