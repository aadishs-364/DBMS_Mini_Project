import Link from 'next/link';

export default function ForbiddenPage() {
  return (
    <div className="narrow">
      <h1>You don&apos;t have access to this page</h1>
      <p className="muted">Your account&apos;s role is not allowed to open it.</p>
      <p>
        <Link href="/">Go back to your home page</Link>
      </p>
    </div>
  );
}
