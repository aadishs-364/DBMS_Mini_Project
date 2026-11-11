'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { send, formValues } from '@/lib/client';

/**
 * A form that posts its fields as JSON to an API route.
 * On success it follows the redirect the API returned, or goes to `then`,
 * or simply reloads the page's data.
 */
export default function ApiForm({ action, method = 'POST', submitLabel, then, reset = false, children }) {
  const router = useRouter();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    setError('');
    setBusy(true);
    try {
      const data = await send(action, formValues(form), method);
      const target = data.redirect ?? then;
      if (target) {
        window.location.href = target; // full load so the header picks up the new session
        return;
      }
      if (reset) form.reset();
      router.refresh();
    } catch (err) {
      setError(err.message);
    }
    setBusy(false);
  }

  return (
    <form onSubmit={onSubmit}>
      {children}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="actions">
        <button type="submit" disabled={busy}>
          {busy ? 'Please wait…' : submitLabel}
        </button>
      </div>
    </form>
  );
}
