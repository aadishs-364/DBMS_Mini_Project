import { query, withTransaction } from '@/lib/db';
import { apiUser } from '@/lib/auth';
import { loadComplaint } from '@/lib/complaints';
import { ok, fail, handler, readJson } from '@/lib/api';

// Admin assigns any officer. An officer may only take an unassigned
// complaint of their own department.
export const POST = handler(async (request, { params }) => {
  const { user, error } = await apiUser('OFFICER', 'ADMIN');
  if (error) return error;

  const { id } = await params;
  const complaint = await loadComplaint(id);
  if (!complaint) return fail('Complaint not found.', 404);

  const body = await readJson(request);
  const officerId = user.role === 'OFFICER' ? user.id : Number(body.officer_id);
  if (!officerId) return fail('Choose an officer.');

  if (user.role === 'OFFICER') {
    if (complaint.department_id !== user.departmentId) return fail('This complaint belongs to another department.', 403);
    if (complaint.officer_id) return fail('This complaint is already assigned.');
  }

  const officers = await query(
    `SELECT u.full_name FROM app_user u JOIN role r ON r.role_id = u.role_id
     WHERE u.user_id = $1 AND r.role_name = 'OFFICER'`,
    [officerId]
  );
  if (!officers[0]) return fail('That user is not an officer.');

  // Transaction: the assignment row and the status change succeed or fail together.
  await withTransaction(
    user.id,
    async (client) => {
      await client.query(
        'INSERT INTO assignment (complaint_id, officer_id, assigned_by) VALUES ($1, $2, $3)',
        [complaint.representative_complaint_id, officerId, user.id]
      );
      await client.query("UPDATE complaint SET status = 'ASSIGNED' WHERE cluster_id = $1 AND status = 'OPEN'", [
        complaint.cluster_id,
      ]);
    },
    `Assigned to ${officers[0].full_name}`
  );
  return ok();
});
