import { query } from '@/lib/db';
import { requireRole } from '@/lib/auth';
import NewComplaintForm from '@/components/NewComplaintForm';

export default async function NewComplaintPage() {
  const user = await requireRole('CITIZEN');
  const wards = await query('SELECT ward_id, ward_number, ward_name FROM ward ORDER BY ward_number');

  return (
    <>
      <div className="page-head">
        <h1>Report an issue</h1>
        <p className="muted">
          Describe the problem in your own words. You don&apos;t need to pick a department; the complaint is sent to
          the right one automatically.
        </p>
      </div>
      <NewComplaintForm wards={wards} defaultWardId={user.wardId ?? ''} />
    </>
  );
}
