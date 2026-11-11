import bcrypt from 'bcryptjs';
import { query } from '@/lib/db';
import { createSession, homeFor } from '@/lib/auth';
import { ok, fail, handler, readJson } from '@/lib/api';

export const POST = handler(async (request) => {
  const { email, password } = await readJson(request);
  if (!email || !password) return fail('Enter your email and password.');

  const rows = await query(
    `SELECT u.user_id, u.full_name, u.password_hash, u.ward_id, u.department_id, r.role_name
     FROM app_user u
     JOIN role r ON r.role_id = u.role_id
     WHERE lower(u.email) = lower($1)`,
    [String(email).trim()]
  );
  const user = rows[0];

  // compare the typed password with the stored bcrypt hash
  const valid = user ? await bcrypt.compare(String(password), user.password_hash) : false;
  if (!valid) return fail('Wrong email or password.', 401);

  await createSession({
    id: user.user_id,
    name: user.full_name,
    role: user.role_name,
    wardId: user.ward_id,
    departmentId: user.department_id,
  });
  return ok({ redirect: homeFor(user.role_name) });
});
