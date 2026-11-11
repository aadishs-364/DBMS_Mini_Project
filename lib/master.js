import bcrypt from 'bcryptjs';
import { embedForDb } from './embed.mjs';
import { orNull } from './api';

// The master-data screens are driven by this list. Table and column names are
// taken ONLY from here (never from the request), and values always go in as
// query parameters, so the generic SQL below cannot be injected into.
export const ENTITIES = {
  ward: { table: 'ward', pk: 'ward_id', columns: ['ward_number', 'ward_name', 'zone'] },
  department: { table: 'department', pk: 'department_id', columns: ['dept_name', 'description'] },
  category: { table: 'category', pk: 'category_id', columns: ['category_name', 'description', 'department_id'] },
  sla_policy: { table: 'sla_policy', pk: 'sla_id', columns: ['category_id', 'resolution_hours', 'escalation_hours'] },
  app_user: {
    table: 'app_user',
    pk: 'user_id',
    columns: ['full_name', 'email', 'phone', 'role_id', 'ward_id', 'department_id'],
  },
};

/** Pick the allowed columns out of the request body, plus derived columns. */
export async function valuesFor(entityName, body, { creating }) {
  const entity = ENTITIES[entityName];
  const values = {};
  for (const column of entity.columns) {
    if (column in body) values[column] = orNull(body[column]);
  }

  // a category's embedding is what complaints are routed against
  if (entityName === 'category' && (values.category_name || values.description)) {
    values.embedding = await embedForDb(`${body.category_name ?? ''}: ${body.description ?? ''}`);
  }

  if (entityName === 'app_user') {
    if (creating && String(body.password ?? '').length < 8) {
      throw Object.assign(new Error('Password must be at least 8 characters.'), { userMessage: true });
    }
    if (body.password) values.password_hash = await bcrypt.hash(String(body.password), 10);
  }
  return values;
}
