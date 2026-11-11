import { query } from './db';

// One complaint with everything the detail page and the API checks need.
// The officer is looked up on the cluster's first complaint, because an issue
// reported by many citizens is handled once.
const DETAIL_SQL = `
  SELECT c.*,
         w.ward_number, w.ward_name,
         cat.category_name, d.department_id, d.dept_name,
         cit.full_name AS citizen_name,
         cl.report_count, cl.representative_complaint_id,
         asg.officer_id, asg.officer_name
  FROM complaint c
  JOIN ward w              ON w.ward_id = c.ward_id
  JOIN app_user cit        ON cit.user_id = c.citizen_id
  LEFT JOIN category cat   ON cat.category_id = c.category_id
  LEFT JOIN department d   ON d.department_id = cat.department_id
  LEFT JOIN complaint_cluster cl ON cl.cluster_id = c.cluster_id
  LEFT JOIN LATERAL (
      SELECT a.officer_id, u.full_name AS officer_name
      FROM assignment a
      JOIN app_user u ON u.user_id = a.officer_id
      WHERE a.complaint_id = cl.representative_complaint_id
      ORDER BY a.assigned_at DESC
      LIMIT 1
  ) asg ON TRUE
  WHERE c.complaint_id = $1`;

// Shared SELECT for every complaint list. Pages add their own WHERE / ORDER BY.
export const LIST_SQL = `
  SELECT c.complaint_id, c.title, c.status, c.priority, c.created_at, c.sla_due_at,
         w.ward_name, cat.category_name, d.dept_name,
         cit.full_name AS citizen_name, cl.report_count
  FROM complaint c
  JOIN ward w              ON w.ward_id = c.ward_id
  JOIN app_user cit        ON cit.user_id = c.citizen_id
  LEFT JOIN category cat   ON cat.category_id = c.category_id
  LEFT JOIN department d   ON d.department_id = cat.department_id
  LEFT JOIN complaint_cluster cl ON cl.cluster_id = c.cluster_id`;

export async function loadComplaint(id) {
  const complaintId = Number(id);
  if (!Number.isInteger(complaintId) || complaintId <= 0) return null;
  const rows = await query(DETAIL_SQL, [complaintId]);
  return rows[0] ?? null;
}

/** Citizens see their own complaints, officers their department's, admins everything. */
export function canView(user, complaint) {
  if (user.role === 'ADMIN') return true;
  if (user.role === 'CITIZEN') return complaint.citizen_id === user.id;
  return complaint.department_id === user.departmentId || complaint.officer_id === user.id;
}
