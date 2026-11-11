import { query } from '@/lib/db';
import { apiUser } from '@/lib/auth';
import { embedForDb } from '@/lib/embed.mjs';
import { ok, handler, readJson } from '@/lib/api';

// Preview: issues already reported in this ward that read like the text being typed.
export const POST = handler(async (request) => {
  const { error } = await apiUser('CITIZEN');
  if (error) return error;

  const body = await readJson(request);
  const text = `${body.title ?? ''}. ${body.description ?? ''}`.trim();
  const wardId = Number(body.ward_id);
  if (text.length < 15 || !wardId) return ok({ matches: [] });

  const embedding = await embedForDb(text);

  // <=> is pgvector's cosine distance; similarity = 1 - distance
  const matches = await query(
    `SELECT c.title, c.status, cl.report_count,
            ROUND((1 - (v.embedding <=> $1::vector))::numeric, 2) AS similarity
     FROM complaint_vector v
     JOIN complaint c          ON c.complaint_id = v.complaint_id
     JOIN complaint_cluster cl ON cl.representative_complaint_id = c.complaint_id
     WHERE c.ward_id = $2
       AND c.status NOT IN ('RESOLVED', 'CLOSED')
       AND 1 - (v.embedding <=> $1::vector) >= 0.45
     ORDER BY v.embedding <=> $1::vector
     LIMIT 4`,
    [embedding, wardId]
  );
  return ok({ matches, threshold: Number(process.env.DEDUP_THRESHOLD ?? 0.7) });
});
