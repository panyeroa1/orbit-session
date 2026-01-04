import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function getSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return null;
  }

  return createClient(supabaseUrl, supabaseKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { meetingId, segments } = body;

    if (!meetingId) {
      return new NextResponse('Meeting ID is required', { status: 400 });
    }

    if (!Array.isArray(segments)) {
      return new NextResponse('Segments array is required', { status: 400 });
    }

    const supabase = getSupabaseClient();
    if (!supabase) {
      return new NextResponse('Supabase client not configured', { status: 503 });
    }

    if (segments.length === 0) {
      return NextResponse.json({ success: true, count: 0 });
    }

    const rows = segments.map((segment: any) => ({
      meeting_id: meetingId,
      source_text: segment.text,
      source_lang: segment.language || null,
      speaker_id: 'unknown', // Bulk save from client state does not preserve speaker identity currently
      created_at: segment.timestamp ? new Date(segment.timestamp).toISOString() : new Date().toISOString(),
    }));

    const { error } = await supabase.from('transcript_segments').insert(rows);

    if (error) {
      console.error('Error saving transcript segments:', error);
      return new NextResponse('Database error', { status: 500 });
    }

    return NextResponse.json({ success: true, count: rows.length });
  } catch (error) {
    console.error('Error in save route:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}