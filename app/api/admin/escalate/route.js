import { query } from '@/lib/db';
import { apiUser } from '@/lib/auth';
import { ok, handler } from '@/lib/api';

// Runs the stored procedure that escalates complaints past their escalation time.
export const POST = handler(async () => {
  const { error } = await apiUser('ADMIN');
  if (error) return error;

  const before = await query("SELECT COUNT(*)::int AS n FROM complaint WHERE status = 'ESCALATED'");
  await query('CALL sp_escalate_overdue()');
  const after = await query("SELECT COUNT(*)::int AS n FROM complaint WHERE status = 'ESCALATED'");

  return ok({ escalated: after[0].n - before[0].n });
});
