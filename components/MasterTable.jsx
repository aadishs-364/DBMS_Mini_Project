'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { send, formValues } from '@/lib/client';

/** One input for one column: a dropdown when the column has options. */
function Field({ column, value, formId }) {
  const common = {
    name: column.name,
    form: formId,
    required: column.required,
    defaultValue: value ?? '',
    'aria-label': column.label,
  };
  if (column.options) {
    return (
      <select {...common}>
        <option value="">{column.required ? 'Choose' : 'None'}</option>
        {column.options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    );
  }
  return <input type={column.type ?? 'text'} {...common} />;
}

function display(column, value) {
  if (column.options) return column.options.find((o) => o.value === value)?.label ?? '-';
  return value ?? '-';
}

/** Editable table for one master-data table. All saving goes through /api/admin/master. */
export default function MasterTable({ entity, pk, columns, rows }) {
  const router = useRouter();
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState('');
  const shown = columns.filter((c) => !c.createOnly);
  const base = `/api/admin/master/${entity}`;

  async function run(work) {
    setError('');
    try {
      await work();
      setEditingId(null);
      router.refresh();
    } catch (err) {
      setError(err.message); // e.g. the foreign key or CHECK constraint that refused the change
    }
  }

  function onAdd(event) {
    event.preventDefault();
    const form = event.currentTarget;
    run(async () => {
      await send(base, formValues(form));
      form.reset();
    });
  }

  function onSave(event, id) {
    event.preventDefault();
    const form = event.currentTarget;
    run(() => send(`${base}/${id}`, formValues(form), 'PUT'));
  }

  function onDelete(id) {
    if (!window.confirm('Delete this record?')) return;
    run(() => send(`${base}/${id}`, undefined, 'DELETE'));
  }

  return (
    <>
      {error && (
        <div className="notice warn" role="alert">
          <strong>Not saved.</strong> {error}
        </div>
      )}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {shown.map((c) => (
                <th key={c.name}>{c.label}</th>
              ))}
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const id = row[pk];
              const formId = `edit-${id}`;
              const editing = editingId === id;
              return (
                <tr key={id}>
                  {shown.map((c) => (
                    <td key={c.name}>
                      {editing ? <Field column={c} value={row[c.name]} formId={formId} /> : display(c, row[c.name])}
                    </td>
                  ))}
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {editing ? (
                      <form id={formId} onSubmit={(e) => onSave(e, id)} style={{ display: 'inline' }}>
                        <button type="submit" className="small">Save</button>{' '}
                        <button type="button" className="plain small" onClick={() => setEditingId(null)}>Cancel</button>
                      </form>
                    ) : (
                      <>
                        <button type="button" className="plain small" onClick={() => setEditingId(id)}>Edit</button>{' '}
                        <button type="button" className="danger small" onClick={() => onDelete(id)}>Delete</button>
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={shown.length + 1} className="muted">No records.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <h2>Add new</h2>
      <form className="box filters" onSubmit={onAdd} id="add-form">
        {columns.map((c) => (
          <div key={c.name}>
            <label>{c.label}</label>
            <Field column={c} formId="add-form" />
          </div>
        ))}
        <button type="submit">Add</button>
      </form>
    </>
  );
}
