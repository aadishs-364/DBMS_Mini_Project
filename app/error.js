'use client';

import { useEffect } from 'react';

// Shown when a page fails to load, for example if the database is briefly
// unreachable. The user can retry without reloading the whole site.
export default function ErrorPage({ error, reset }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="narrow">
      <h1>Something went wrong</h1>
      <p className="muted">
        This page could not be loaded. Please try again in a moment.
      </p>
      <div className="actions">
        <button type="button" onClick={() => reset()}>
          Try again
        </button>
      </div>
    </div>
  );
}
