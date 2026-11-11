import { withTransaction } from '@/lib/db';
import { apiUser } from '@/lib/auth';
import { ENTITIES, valuesFor } from '@/lib/master';
import { ok, fail, handler, readJson } from '@/lib/api';

// Create a master-data row (ward, department, category, SLA policy, user).
export const POST = handler(async (request, { params }) => {
  const { user, error } = await apiUser('ADMIN');
  if (error) return error;

  const { entity: entityName } = await params;
  const entity = ENTITIES[entityName];
  if (!entity) return fail('Unknown table.', 404);

  let values;
  try {
    values = await valuesFor(entityName, await readJson(request), { creating: true });
  } catch (err) {
    if (err.userMessage) return fail(err.message);
    throw err;
  }

  const columns = Object.keys(values);
  if (!columns.length) return fail('Nothing to save.');
  const placeholders = columns.map((c, i) => (c === 'embedding' ? `$${i + 1}::vector` : `$${i + 1}`));

  // constraint violations (UNIQUE, CHECK, FOREIGN KEY) are turned into messages by handler()
  await withTransaction(user.id, (client) =>
    client.query(
      `INSERT INTO ${entity.table} (${columns.join(', ')}) VALUES (${placeholders.join(', ')})`,
      Object.values(values)
    )
  );
  return ok();
});
