// The price a rep is about to spend, shown while a button waits for its
// confirming second click.
//
// Root CLAUDE.md: every generative action states its cost before the rep
// commits, because they are spending their own Anthropic key. Topbar buttons
// have no room for a caption underneath — one would make the whole bar taller —
// so this floats beneath the button instead, and only during the confirm step.
//
// pointer-events-none on purpose. The confirm step cancels when the button loses
// focus, so a hint that could take focus would cancel the very action it is
// describing. role="status" so the price is announced, not just drawn.
type Props = {
  text: string
  show: boolean
}

export default function CostConfirmHint({ text, show }: Props) {
  if (!show) return null
  return (
    <span
      role="status"
      className="pointer-events-none absolute right-0 top-full z-50 mt-[6px] whitespace-nowrap rounded-[6px] px-2 py-[4px] text-[10px]"
      style={{ background: 'var(--sl-surface)', border: '1px solid var(--sl-border)', color: 'var(--sl-text2)' }}
    >
      {text}
    </span>
  )
}
