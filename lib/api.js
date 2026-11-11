import { NextResponse } from 'next/server';
import { dbErrorMessage } from './db';

export const ok = (data = {}) => NextResponse.json(data);
export const fail = (message, status = 400) => NextResponse.json({ error: message }, { status });

/** Wrap a route handler so database constraint errors become readable 400s. */
export function handler(fn) {
  return async (request, context) => {
    try {
      return await fn(request, context);
    } catch (err) {
      const message = dbErrorMessage(err);
      if (message) return fail(message, 400);
      console.error(err);
      return fail('Something went wrong on the server.', 500);
    }
  };
}

export async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

/** '' and undefined become null so optional columns are stored as NULL. */
export const orNull = (value) => (value === '' || value === undefined ? null : value);
