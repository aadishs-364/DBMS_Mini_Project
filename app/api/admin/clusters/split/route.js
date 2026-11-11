import { withTransaction } from '@/lib/db';
import { apiUser } from '@/lib/auth';
import { loadComplaint } from '@/lib/complaints';
import { ok, fail, handler, readJson } from '@/lib/api';

// Undo a wrong merge: move one report out of its cluster into a cluster of its own.
export const POST = handler(async (request) => {
  const { user, error } = await apiUser('ADMIN');
  if (error) return error;

  const { complaint_id } = await readJson(request);
  const complaint = await loadComplaint(complaint_id);
  if (!complaint) return fail('Complaint not found.', 404);
  if (complaint.representative_complaint_id === complaint.complaint_id) {
    return fail('This is the first report of the issue, so it cannot be separated.');
  }

  await withTransaction(user.id, async (client) => {
    const { rows } = await client.query(
      `INSERT INTO complaint_cluster (representative_complaint_id, centroid_summary)
       VALUES ($1, $2) RETURNING cluster_id`,
      [complaint.complaint_id, complaint.title]
    );
    await client.query('UPDATE complaint SET cluster_id = $1 WHERE complaint_id = $2', [
      rows[0].cluster_id,
      complaint.complaint_id,
    ]);
    await client.query('UPDATE complaint_cluster SET report_count = report_count - 1 WHERE cluster_id = $1', [
      complaint.cluster_id,
    ]);
  });
  return ok();
});
