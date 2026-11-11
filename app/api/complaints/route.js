import { withTransaction } from '@/lib/db';
import { apiUser } from '@/lib/auth';
import { embedForDb } from '@/lib/embed.mjs';
import { ok, fail, handler, readJson } from '@/lib/api';

// File a complaint. The database function decides whether it is a new issue
// or a duplicate of one already reported in the same ward.
export const POST = handler(async (request) => {
  const { user, error } = await apiUser('CITIZEN');
  if (error) return error;

  const body = await readJson(request);
  const title = String(body.title ?? '').trim();
  const description = String(body.description ?? '').trim();
  const wardId = Number(body.ward_id);
  const photoUrl = String(body.photo_url ?? '').trim();
  if (!title || !description || !wardId) return fail('Title, description and ward are required.');

  const embedding = await embedForDb(`${title}. ${description}`);
  const threshold = Number(process.env.DEDUP_THRESHOLD ?? 0.7);

  // One transaction: complaint + cluster + vector + history (inside the function)
  // and the optional photo link. If any step fails, nothing is saved.
  const result = await withTransaction(user.id, async (client) => {
    const { rows } = await client.query(
      'SELECT * FROM fn_file_complaint($1, $2, $3, $4, $5::vector, $6)',
      [user.id, wardId, title, description, embedding, threshold]
    );
    if (photoUrl) {
      await client.query(
        'INSERT INTO attachment (complaint_id, file_url, file_type) VALUES ($1, $2, $3)',
        [rows[0].new_complaint_id, photoUrl, 'image']
      );
    }
    return rows[0];
  });

  return ok({ complaint_id: result.new_complaint_id, merged: result.merged });
});
