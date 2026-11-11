import { STATUSES, statusLabel } from '@/lib/format';

/** Plain GET form: the chosen filters end up in the URL, the page re-queries. */
export default function StatusFilter({ status = '', q, searchLabel = 'Search' }) {
  return (
    <form className="filters" method="get">
      <div>
        <label htmlFor="status">Status</label>
        <select id="status" name="status" defaultValue={status}>
          <option value="">All</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {statusLabel(s)}
            </option>
          ))}
        </select>
      </div>
      {q !== undefined && (
        <div style={{ flex: 1 }}>
          <label htmlFor="q">{searchLabel}</label>
          <input id="q" name="q" defaultValue={q} />
        </div>
      )}
      <button type="submit" className="plain">
        Apply
      </button>
    </form>
  );
}
