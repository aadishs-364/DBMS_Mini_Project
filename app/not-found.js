import Link from 'next/link';

// Shown for any URL that does not match a page, and when a page calls notFound()
// (for example a complaint number that does not exist).
export default function NotFound() {
  return (
    <div className="narrow">
      <p className="small muted">Error 404</p>
      <h1>Page not found</h1>
      <p className="muted">
        The page you are looking for does not exist, or the complaint number is wrong.
      </p>
      <p>
        <Link href="/">Go back to your home page</Link>
      </p>
    </div>
  );
}
