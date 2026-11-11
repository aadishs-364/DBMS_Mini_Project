import { query } from '@/lib/db';
import { apiUser } from '@/lib/auth';
import { loadComplaint, canView } from '@/lib/complaints';
import { ok, fail, handler, readJson } from '@/lib/api';

export const POST = handler(async (request, { params }) => {
  const { user, error } = await apiUser();
  if (error) return error;

  const { id } = await params;
  const complaint = await loadComplaint(id);
  if (!complaint) return fail('Complaint not found.', 404);
  if (!canView(user, complaint)) return fail('You cannot comment on this complaint.', 403);

  const { body } = await readJson(request);
  const text = String(body ?? '').trim();
  if (!text) return fail('Write something first.');

  await query('INSERT INTO comment (complaint_id, author_id, body) VALUES ($1, $2, $3)', [
    complaint.complaint_id,
    user.id,
    text,
  ]);
  return ok();
});
