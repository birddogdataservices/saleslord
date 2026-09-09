// Structured output for the generation routes.
//
// Instead of asking Claude to hand-write JSON as text and then parsing it (fragile —
// the model can wrap it in prose or, in non-English output, emit an unescaped quote
// or newline inside a value), we get the result through TOOL USE. We force a call to
// an `emit_result` tool; the Anthropic API serializes the tool input as JSON itself,
// so the result is guaranteed to be valid JSON in any language. No text parsing.
//
// - Single-call routes (email, pitch, case-study match): call generateStructured
//   directly — one call, always valid.
// - Web-search routes (research, check-updates): the search call can't ALSO be forced
//   to emit a tool (forcing it would stop the model searching), so they run two phases —
//   the existing web_search loop, then generateStructured over the model's own findings.
//
// Server-side only: imported by API route handlers.

import type Anthropic from '@anthropic-ai/sdk'

const EMIT_TOOL = {
  name: 'emit_result',
  description: 'Return the final result strictly as a JSON object matching the requested shape.',
  input_schema: { type: 'object' as const, additionalProperties: true },
}

export type StructuredResult = {
  value: any
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
}

// Forces a single structured-output call. `messages` is the full conversation;
// `system` should describe the expected JSON shape (the tool schema is permissive,
// so the shape comes from the prompt). Returns the tool input (guaranteed valid
// JSON) plus token usage for cost tracking.
// `cache` opts into prompt caching for this call. Worth it only when the prefix
// repeats: the web-search routes send this same large system prompt during their
// search loop, so the emit call reads it back at ~0.1x instead of paying full
// price a second time. The short Haiku routes leave it off — their prefixes are
// small, single-shot, and may not even reach the model's minimum cacheable size.
export async function generateStructured(args: {
  client: Anthropic
  model: string
  system: string
  messages: Anthropic.MessageParam[]
  maxTokens?: number
  cache?: boolean
}): Promise<StructuredResult> {
  const res = await args.client.messages.create({
    model:      args.model,
    max_tokens: args.maxTokens ?? 4096,
    system:     args.system,
    ...(args.cache ? { cache_control: { type: 'ephemeral' as const } } : {}),
    tools:      [EMIT_TOOL] as any,
    tool_choice: { type: 'tool', name: EMIT_TOOL.name } as any,
    messages:   args.messages,
  })

  const toolUse = res.content.find(b => b.type === 'tool_use')
  if (!toolUse || toolUse.type !== 'tool_use') {
    throw new Error('No structured tool output')
  }
  return {
    value:            toolUse.input,
    inputTokens:      res.usage.input_tokens,
    outputTokens:     res.usage.output_tokens,
    cacheReadTokens:  res.usage.cache_read_input_tokens ?? 0,
    cacheWriteTokens: res.usage.cache_creation_input_tokens ?? 0,
  }
}
