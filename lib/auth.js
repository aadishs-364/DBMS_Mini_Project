import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { NextResponse } from 'next/server';
import { SignJWT, jwtVerify } from 'jose';

const COOKIE = 'civic_session';
const EIGHT_HOURS = 60 * 60 * 8;

function secretKey() {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('SESSION_SECRET must be set in .env.local (at least 32 characters).');
  }
  return new TextEncoder().encode(secret);
}

/** Sign the user's id/role into a JWT and store it in an httpOnly cookie. */
export async function createSession(user) {
  const token = await new SignJWT({ user })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${EIGHT_HOURS}s`)
    .sign(secretKey());

  (await cookies()).set(COOKIE, token, {
    httpOnly: true, // JavaScript in the browser cannot read it
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: EIGHT_HOURS,
  });
}

export async function destroySession() {
  (await cookies()).delete(COOKIE);
}

/** The logged-in user ({ id, name, role, wardId, departmentId }) or null. */
export async function getUser() {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey());
    return payload.user;
  } catch {
    return null; // expired or tampered with
  }
}

/** For pages: send the visitor away unless they have one of the roles. */
export async function requireRole(...roles) {
  const user = await getUser();
  if (!user) redirect('/login');
  if (roles.length && !roles.includes(user.role)) redirect('/forbidden');
  return user;
}

/** For API routes: returns { user } or { error: Response }. */
export async function apiUser(...roles) {
  const user = await getUser();
  if (!user) return { error: NextResponse.json({ error: 'Please log in.' }, { status: 401 }) };
  if (roles.length && !roles.includes(user.role)) {
    return { error: NextResponse.json({ error: 'You are not allowed to do this.' }, { status: 403 }) };
  }
  return { user };
}

export function homeFor(role) {
  if (role === 'ADMIN') return '/admin';
  if (role === 'OFFICER') return '/officer/queue';
  return '/citizen/complaints';
}
