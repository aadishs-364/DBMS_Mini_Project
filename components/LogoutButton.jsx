'use client';

import { send } from '@/lib/client';

export default function LogoutButton() {
  async function logout() {
    await send('/api/auth/logout');
    window.location.href = '/login';
  }
  return (
    <button type="button" onClick={logout}>
      Log out
    </button>
  );
}
