import Link from 'next/link';
import { query } from '@/lib/db';
import { requireRole } from '@/lib/auth';
import MasterTable from '@/components/MasterTable';

const TABS = [
  ['ward', 'Wards'],
  ['department', 'Departments'],
  ['category', 'Categories'],
  ['sla_policy', 'SLA policies'],
  ['app_user', 'Users'],
];

export default async function MasterDataPage({ searchParams }) {
  await requireRole('ADMIN');
  const { tab = 'ward' } = await searchParams;
  const active = TABS.some(([key]) => key === tab) ? tab : 'ward';

  // dropdown choices for the foreign-key columns
  const [wards, departments, categories, roles] = await Promise.all([
    query(`SELECT ward_id AS value, ward_number || ' - ' || ward_name AS label FROM ward ORDER BY ward_number`),
    query('SELECT department_id AS value, dept_name AS label FROM department ORDER BY dept_name'),
    query('SELECT category_id AS value, category_name AS label FROM category ORDER BY category_name'),
    query('SELECT role_id AS value, role_name AS label FROM role ORDER BY role_id'),
  ]);

  // what each tab shows: the query, the primary key and the editable columns
  const config = {
    ward: {
      pk: 'ward_id',
      sql: 'SELECT ward_id, ward_number, ward_name, zone FROM ward ORDER BY ward_number',
      columns: [
        { name: 'ward_number', label: 'Ward no.', type: 'number', required: true },
        { name: 'ward_name', label: 'Name', required: true },
        { name: 'zone', label: 'Zone', required: true },
      ],
    },
    department: {
      pk: 'department_id',
      sql: 'SELECT department_id, dept_name, description FROM department ORDER BY dept_name',
      columns: [
        { name: 'dept_name', label: 'Department', required: true },
        { name: 'description', label: 'Looks after' },
      ],
    },
    category: {
      pk: 'category_id',
      sql: 'SELECT category_id, category_name, description, department_id FROM category ORDER BY category_name',
      columns: [
        { name: 'category_name', label: 'Category', required: true },
        { name: 'description', label: 'Typical wording (used for routing)', required: true },
        { name: 'department_id', label: 'Department', options: departments, required: true },
      ],
    },
    sla_policy: {
      pk: 'sla_id',
      sql: 'SELECT sla_id, category_id, resolution_hours, escalation_hours FROM sla_policy ORDER BY sla_id',
      columns: [
        { name: 'category_id', label: 'Category', options: categories, required: true },
        { name: 'resolution_hours', label: 'Resolve within (hours)', type: 'number', required: true },
        { name: 'escalation_hours', label: 'Escalate after (hours)', type: 'number', required: true },
      ],
    },
    app_user: {
      pk: 'user_id',
      sql: 'SELECT user_id, full_name, email, phone, role_id, ward_id, department_id FROM app_user ORDER BY role_id DESC, full_name',
      columns: [
        { name: 'full_name', label: 'Name', required: true },
        { name: 'email', label: 'Email', type: 'email', required: true },
        { name: 'phone', label: 'Mobile' },
        { name: 'role_id', label: 'Role', options: roles, required: true },
        { name: 'ward_id', label: 'Ward', options: wards },
        { name: 'department_id', label: 'Department', options: departments },
        { name: 'password', label: 'Password', type: 'password', createOnly: true, required: true },
      ],
    },
  }[active];

  const rows = await query(config.sql);

  return (
    <>
      <div className="page-head">
        <h1>Master data</h1>
        <p className="muted">
          The database checks every change. A value that breaks a rule, or a delete that would orphan other records, is
          refused and the reason is shown.
        </p>
      </div>

      <div className="tabs">
        {TABS.map(([key, label]) => (
          <Link key={key} href={`/admin/master?tab=${key}`} className={key === active ? 'on' : undefined}>
            {label}
          </Link>
        ))}
      </div>

      <MasterTable key={active} entity={active} pk={config.pk} columns={config.columns} rows={rows} />
    </>
  );
}
