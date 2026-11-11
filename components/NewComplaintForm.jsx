'use client';

import { useState } from 'react';
import { send, formValues } from '@/lib/client';
import { statusLabel } from '@/lib/format';

export default function NewComplaintForm({ wards, defaultWardId }) {
  const [matches, setMatches] = useState(null); // null = not checked yet
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');

  // Ask the server for issues in this ward that mean the same thing.
  async function checkSimilar(form) {
    setError('');
    setBusy('check');
    try {
      const data = await send('/api/complaints/similar', formValues(form));
      setMatches(data.matches);
    } catch (err) {
      setError(err.message);
    }
    setBusy('');
  }

  async function onSubmit(event) {
    event.preventDefault();
    setError('');
    setBusy('submit');
    try {
      const data = await send('/api/complaints', formValues(event.currentTarget));
      window.location.href = `/complaints/${data.complaint_id}?filed=${data.merged ? 'merged' : 'new'}`;
    } catch (err) {
      setError(err.message);
      setBusy('');
    }
  }

  return (
    <div className="columns">
      <form className="box" onSubmit={onSubmit}>
        <label htmlFor="ward_id" style={{ marginTop: 0 }}>
          Ward where the problem is
        </label>
        <select id="ward_id" name="ward_id" required defaultValue={defaultWardId}>
          <option value="" disabled>
            Choose a ward
          </option>
          {wards.map((w) => (
            <option key={w.ward_id} value={w.ward_id}>
              {w.ward_number} - {w.ward_name}
            </option>
          ))}
        </select>

        <label htmlFor="title">Short title</label>
        <input id="title" name="title" required minLength={5} maxLength={150} placeholder="e.g. Streetlight not working near the bus stop" />

        <label htmlFor="description">What is the problem, and exactly where?</label>
        <textarea id="description" name="description" required minLength={10} placeholder="Landmark, how long it has been like this, any danger to people" />

        <label htmlFor="photo_url">
          Link to a photo <span className="muted">(optional)</span>
        </label>
        <input id="photo_url" name="photo_url" type="url" placeholder="https://" />

        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="actions">
          <button type="submit" disabled={busy !== ''}>
            {busy === 'submit' ? 'Submitting…' : 'Submit complaint'}
          </button>
          <button
            type="button"
            className="plain"
            disabled={busy !== ''}
            onClick={(event) => checkSimilar(event.currentTarget.form)}
          >
            {busy === 'check' ? 'Checking…' : 'Has this been reported already?'}
          </button>
        </div>
      </form>

      <div className="box">
        <h2 style={{ marginTop: 0 }}>Similar reports in this ward</h2>
        {matches === null && (
          <p className="muted">
            Fill in the form and press &quot;Has this been reported already?&quot; to see open complaints that describe
            the same thing, even in different words.
          </p>
        )}
        {matches && matches.length === 0 && <p className="muted">Nothing similar is open in this ward right now.</p>}
        {matches && matches.length > 0 && (
          <>
            <table>
              <thead>
                <tr>
                  <th>Issue</th>
                  <th>Status</th>
                  <th className="num">Reports</th>
                  <th className="num">Match</th>
                </tr>
              </thead>
              <tbody>
                {matches.map((m, i) => (
                  <tr key={i}>
                    <td>{m.title}</td>
                    <td>{statusLabel(m.status)}</td>
                    <td className="num">{m.report_count}</td>
                    <td className="num">{Math.round(m.similarity * 100)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="small muted" style={{ marginTop: 10 }}>
              You can still submit. If your report matches one of these closely enough, it is added to that complaint
              and raises its report count instead of creating a second ticket.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
