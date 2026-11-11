'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { send } from '@/lib/client';

/** A button that calls an API route, then refreshes the page's data. */
export default function ActionButton({ action, body, method = 'POST', confirmText, className = 'plain small', children }) {
  const router = useRouter();
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  async function run() {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(true);
    setMessage('');
    try {
      const data = await send(action, body, method);
      if (typeof data.escalated === 'number') {
        setMessage(data.escalated ? `${data.escalated} complaint(s) escalated.` : 'Nothing to escalate.');
      }
      router.refresh();
    } catch (err) {
      setMessage(err.message);
    }
    setBusy(false);
  }

  return (
    <>
      <button type="button" className={className} onClick={run} disabled={busy}>
        {children}
      </button>
      {message && <span className="small muted"> {message}</span>}
    </>
  );
}
