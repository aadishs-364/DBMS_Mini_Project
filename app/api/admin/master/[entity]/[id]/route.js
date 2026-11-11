import { withTransaction } from '@/lib/db';
import { apiUser } from '@/lib/auth';
import { ENTITIES, valuesFor } from '@/lib/master';
import { ok, fail, handler, readJson } from '@/lib/api';

async function setup(params) {
  const { user, error } = await apiUser('ADMIN');
  if (error) return { error };
  const { entity: entityName, id } = await params;
  const entity = ENTITIES[entityName];
  const rowId = Number(id);
  if (!entity || !Number.isInteger(rowId)) return { error: fail('Unknown record.', 404) };
  return { user, entity, entityName, rowId };
}

export const PUT = handler(async (request, { params }) => {
  const ctx = await setup(params);
  if (ctx.error) return ctx.error;

  const values = await valuesFor(ctx.entityName, await readJson(request), { creating: false });
  const columns = Object.keys(values);
  if (!columns.length) return fail('Nothing to save.');
  const assignments = columns.map((c, i) => `${c} = $${i + 1}${c === 'embedding' ? '::vector' : ''}`);

  await withTransaction(ctx.user.id, (client) =>
    client.query(
      `UPDATE ${ctx.entity.table} SET ${assignments.join(', ')} WHERE ${ctx.entity.pk} = $${columns.length + 1}`,
      [...Object.values(values), ctx.rowId]
    )
  );
  return ok();
});

export const DELETE = handler(async (request, { params }) => {
  const ctx = await setup(params);
  if (ctx.error) return ctx.error;
  if (ctx.entityName === 'app_user' && ctx.rowId === ctx.user.id) {
    return fail('You cannot delete your own account.');
  }

  // If other rows still point at this one, the foreign key refuses the delete
  // and handler() shows that message to the admin.
  await withTransaction(ctx.user.id, (client) =>
    client.query(`DELETE FROM ${ctx.entity.table} WHERE ${ctx.entity.pk} = $1`, [ctx.rowId])
  );
  return ok();
});
