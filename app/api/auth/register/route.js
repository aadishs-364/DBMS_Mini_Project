import bcrypt from 'bcryptjs';
import { query } from '@/lib/db';
import { createSession, homeFor } from '@/lib/auth';
import { ok, fail, handler, readJson, orNull } from '@/lib/api';

// Only citizens register themselves. Officers and admins are created by an admin.
export const POST = handler(async (request) => {
  const { full_name, email, phone, password, ward_id } = await readJson(request);
  if (!full_name || !email || !password) return fail('Name, email and password are required.');
  if (String(password).length < 8) return fail('Password must be at least 8 characters.');

  const passwordHash = await bcrypt.hash(String(password), 10);

  // email format, phone format and uniqueness are enforced by the table's constraints
  const rows = await query(
    `INSERT INTO app_user (full_name, email, phone, password_hash, role_id, ward_id)
     VALUES ($1, $2, $3, $4, (SELECT role_id FROM role WHERE role_name = 'CITIZEN'), $5)
     RETURNING user_id, full_name, ward_id`,
    [String(full_name).trim(), String(email).trim().toLowerCase(), orNull(phone), passwordHash, orNull(ward_id)]
  );
  const user = rows[0];

  await createSession({
    id: user.user_id,
    name: user.full_name,
    role: 'CITIZEN',
    wardId: user.ward_id,
    departmentId: null,
  });
  return ok({ redirect: homeFor('CITIZEN') });
});
