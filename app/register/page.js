import Link from 'next/link';
import { redirect } from 'next/navigation';
import { query } from '@/lib/db';
import { getUser, homeFor } from '@/lib/auth';
import ApiForm from '@/components/ApiForm';

export default async function RegisterPage() {
  const user = await getUser();
  if (user) redirect(homeFor(user.role));

  const wards = await query('SELECT ward_id, ward_number, ward_name FROM ward ORDER BY ward_number');

  return (
    <div className="narrow">
      <div className="page-head">
        <h1>Create an account</h1>
        <p className="muted">For residents. Officers get their accounts from the administrator.</p>
      </div>
      <div className="box">
        <ApiForm action="/api/auth/register" submitLabel="Create account">
          <label htmlFor="full_name">Full name</label>
          <input id="full_name" name="full_name" required minLength={2} maxLength={100} />
          <label htmlFor="email">Email</label>
          <input id="email" name="email" type="email" required maxLength={120} />
          <label htmlFor="phone">
            Mobile number <span className="muted">(10 digits, optional)</span>
          </label>
          <input id="phone" name="phone" inputMode="numeric" maxLength={10} />
          <label htmlFor="ward_id">Your ward</label>
          <select id="ward_id" name="ward_id" required defaultValue="">
            <option value="" disabled>
              Choose a ward
            </option>
            {wards.map((w) => (
              <option key={w.ward_id} value={w.ward_id}>
                {w.ward_number} - {w.ward_name}
              </option>
            ))}
          </select>
          <label htmlFor="password">
            Password <span className="muted">(at least 8 characters)</span>
          </label>
          <input id="password" name="password" type="password" autoComplete="new-password" required minLength={8} />
        </ApiForm>
      </div>
      <p className="small" style={{ marginTop: 12 }}>
        Already registered? <Link href="/login">Log in</Link>
      </p>
    </div>
  );
}
