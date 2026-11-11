import { pipeline } from '@huggingface/transformers';

// all-MiniLM-L6-v2 turns a sentence into 384 numbers. Sentences with a similar
// meaning get vectors that point in a similar direction. The model runs locally
// in Node (it is downloaded once, on first use) - no external API or key.
const MODEL = 'Xenova/all-MiniLM-L6-v2';

async function getExtractor() {
  globalThis._civicExtractor ??= pipeline('feature-extraction', MODEL, { dtype: 'q8' });
  return globalThis._civicExtractor;
}

/** Text -> array of 384 floats (unit length, so cosine similarity is meaningful). */
export async function embed(text) {
  const extractor = await getExtractor();
  const output = await extractor(text, { pooling: 'mean', normalize: true });
  return Array.from(output.data);
}

/** pgvector accepts a vector written as the text '[0.1,0.2,...]'. */
export function toVectorLiteral(numbers) {
  return `[${numbers.join(',')}]`;
}

export async function embedForDb(text) {
  return toVectorLiteral(await embed(text));
}
