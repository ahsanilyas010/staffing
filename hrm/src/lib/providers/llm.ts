// Anthropic API adapter for post-call scoring and CV parsing
const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages'

interface LlmParams {
  system: string
  messages: { role: 'user' | 'assistant'; content: string }[]
  maxTokens?: number
}

export async function complete(params: LlmParams): Promise<string> {
  const res = await fetch(ANTHROPIC_API, {
    method: 'POST',
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6-20250819',
      max_tokens: params.maxTokens ?? 2048,
      system: params.system,
      messages: params.messages,
    }),
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Anthropic API failed: ${res.status} ${err}`)
  }
  const data = await res.json()
  const block = data.content?.[0]
  if (block?.type === 'text') return block.text
  throw new Error('Unexpected response from Anthropic API')
}

export async function extractJson<T>(params: LlmParams): Promise<T> {
  const raw = await complete(params)
  const match = raw.match(/\{[\s\S]*\}/)
  if (!match) throw new Error('No JSON found in LLM response')
  return JSON.parse(match[0])
}
