import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

// Health check for uptime monitors.
//
//   GET /api/health        -> 200 if the app is up. Does NOT touch the database,
//                             so a monitor pinging every 5 minutes keeps the Render
//                             service awake without keeping Neon awake (Neon's free
//                             plan has limited compute hours and sleeps when idle).
//   GET /api/health?db=1   -> also runs SELECT 1 on the database; 503 if it fails.
//                             Use this to check the database by hand, not on a schedule.

export const dynamic = 'force-dynamic'; // never cache: every ping must reach the server

export async function GET(request) {
  const body = { status: 'ok', uptime_seconds: Math.round(process.uptime()), time: new Date().toISOString() };

  if (new URL(request.url).searchParams.get('db') === '1') {
    const started = Date.now();
    try {
      await query('SELECT 1');
      body.database = { status: 'ok', ms: Date.now() - started };
    } catch {
      body.status = 'degraded';
      body.database = { status: 'unreachable' };
      return NextResponse.json(body, { status: 503, headers: { 'Cache-Control': 'no-store' } });
    }
  }
  return NextResponse.json(body, { headers: { 'Cache-Control': 'no-store' } });
}

// UptimeRobot's free monitors may use HEAD requests.
export async function HEAD() {
  return new Response(null, { status: 200, headers: { 'Cache-Control': 'no-store' } });
}
