import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getUser, homeFor } from '@/lib/auth';
import ApiForm from '@/components/ApiForm';

export default async function LoginPage() {
  const user = await getUser();
  if (user) redirect(homeFor(user.role));

  return (
    <div className="narrow">
      <div className="page-head">
        <h1>Log in</h1>
        <p className="muted">Report a civic issue in your ward and follow it until it is fixed.</p>
      </div>
      <div className="box">
        <ApiForm action="/api/auth/login" submitLabel="Log in">
          <label htmlFor="email">Email</label>
          <input id="email" name="email" type="email" autoComplete="username" required />
          <label htmlFor="password">Password</label>
          <input id="password" name="password" type="password" autoComplete="current-password" required />
        </ApiForm>
      </div>
      <p className="small" style={{ marginTop: 12 }}>
        New here? <Link href="/register">Create a citizen account</Link>
      </p>
    </div>
  );
}
