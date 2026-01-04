import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

// In-memory store for active broadcasters per room
// Format: { roomId: { identity: string, startedAt: number } }
const activeBroadcasters = new Map<string, { identity: string; startedAt: number }>();

// Cleanup stale broadcasters (older than 2 minutes without heartbeat)
const STALE_THRESHOLD_MS = 2 * 60 * 1000;

function cleanupStale() {
  const now = Date.now();
  for (const [roomId, data] of activeBroadcasters.entries()) {
    if (now - data.startedAt > STALE_THRESHOLD_MS) {
      activeBroadcasters.delete(roomId);
    }
  }
}

// GET: Check if room has an active broadcaster
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const roomId = searchParams.get('roomId');

  if (!roomId) {
    return NextResponse.json({ error: 'Missing roomId' }, { status: 400 });
  }

  cleanupStale();

  const broadcaster = activeBroadcasters.get(roomId);
  if (broadcaster) {
    return NextResponse.json({
      isLocked: true,
      broadcasterId: broadcaster.identity,
    });
  }

  return NextResponse.json({ isLocked: false, broadcasterId: null });
}

// POST: Claim or release broadcast lock
export async function POST(request: Request) {
  try {
    const { roomId, identity, action } = await request.json();

    if (!roomId || !identity || !action) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    cleanupStale();

    if (action === 'claim') {
      const existing = activeBroadcasters.get(roomId);
      if (existing && existing.identity !== identity) {
        return NextResponse.json({
          success: false,
          error: 'Room already has an active broadcaster',
          broadcasterId: existing.identity,
        });
      }
      activeBroadcasters.set(roomId, { identity, startedAt: Date.now() });
      return NextResponse.json({ success: true });
    }

    if (action === 'release') {
      const existing = activeBroadcasters.get(roomId);
      if (existing && existing.identity === identity) {
        activeBroadcasters.delete(roomId);
      }
      return NextResponse.json({ success: true });
    }

    if (action === 'heartbeat') {
      const existing = activeBroadcasters.get(roomId);
      if (existing && existing.identity === identity) {
        activeBroadcasters.set(roomId, { identity, startedAt: Date.now() });
      }
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('Broadcast status error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
