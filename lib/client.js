// Browser-side helper: send JSON to one of our API routes.
export async function send(url, body, method = 'POST') {
  const response = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Something went wrong.');
  return data;
}

/** Read every named field of a <form> into a plain object. */
export function formValues(form) {
  return Object.fromEntries(new FormData(form).entries());
}
