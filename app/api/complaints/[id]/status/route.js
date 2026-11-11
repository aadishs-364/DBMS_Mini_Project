import { withTransaction } from '@/lib/db';
import { apiUser } from '@/lib/auth';
import { loadComplaint } from '@/lib/complaints';
import { ok, fail, handler, readJson } from '@/lib/api';

const OFFICER_MAY_SET = ['IN_PROGRESS', 'RESOLVED'];
const ADMIN_MAY_SET = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'];

export const POST = handler(async (request, { params }) => {
  const { user, error } = await apiUser('OFFICER', 'ADMIN');
  if (error) return error;

  const { id } = await params;
  const complaint = await loadComplaint(id);
  if (!complaint) return fail('Complaint not found.', 404);

  const { status, remarks } = await readJson(request);
  const note = String(remarks ?? '').trim();
  const allowed = user.role === 'ADMIN' ? ADMIN_MAY_SET : OFFICER_MAY_SET;
  if (!allowed.includes(status)) return fail('That status cannot be set here.');
  if (!note) return fail('Add a short remark explaining the change.');
  if (user.role === 'OFFICER' && complaint.officer_id !== user.id) {
    return fail('Only the assigned officer can update this complaint.', 403);
  }

  // The UPDATE touches every report in the cluster. The trigger
  // trg_complaint_status_history writes one history row per report,
  // using the user id and remark passed to withTransaction.
  await withTransaction(
    user.id,
    (client) =>
      client.query('UPDATE complaint SET status = $1 WHERE cluster_id = $2 AND status <> $1', [
        status,
        complaint.cluster_id,
      ]),
    note
  );
  return ok();
});
