// Shown by Next.js while a page is loading its data from the database,
// so the user sees that something is happening instead of a frozen screen.
export default function Loading() {
  return (
    <div className="page-loading" role="status" aria-live="polite">
      <span className="spinner" aria-hidden="true" />
      <span className="muted">Loading…</span>
    </div>
  );
}
