// Embedding provider — OpenAI-compatible endpoint (works with OpenAI or any compatible proxy).
// Produces 1536-dim vectors to match candidate_embeddings.embedding.
const EMBEDDINGS_BASE_URL = process.env.EMBEDDINGS_BASE_URL ?? 'https://api.openai.com/v1'
const EMBEDDINGS_MODEL = process.env.EMBEDDINGS_MODEL ?? 'text-embedding-3-small'

export async function embed(text: string): Promise<number[]> {
  const res = await fetch(`${EMBEDDINGS_BASE_URL}/embeddings`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.EMBEDDINGS_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model: EMBEDDINGS_MODEL, input: text.slice(0, 8000) }),
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Embeddings provider failed: ${res.status} ${err}`)
  }
  const data = await res.json()
  return data.data[0].embedding
}
