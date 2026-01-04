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

    if (!Array.isArray(segments) || segments.length === 0) {
      return NextResponse.json({ success: true, count: 0 });
    }

    const supabase = getSupabaseClient();
    if (!supabase) {
      return new NextResponse('Supabase client not configured', { status: 503 });
    }

    // Join all segments into a single text block
    const fullSourceText = segments.map(s => s.text).join('\n');
    const fullTranslatedText = segments.map(s => s.translatedText).filter(Boolean).join('\n');

    // 1. Try to find an existing row
    const { data: existingRows } = await supabase
      .from('transcript_segments')
      .select('id, source_text, translated_text')
      .eq('meeting_id', meetingId)
      .order('created_at', { ascending: false })
      .limit(1);

    const existing = existingRows && existingRows.length > 0 ? existingRows[0] : null;

    if (existing) {
      // 2. Update existing row
      const newSource = (existing.source_text || '') + '\n' + fullSourceText;
      const newTranslated = (existing.translated_text || '') + '\n' + fullTranslatedText;

      const { error } = await supabase
        .from('transcript_segments')
        .update({
          source_text: newSource.trim(),
          translated_text: newTranslated.trim(),
          created_at: new Date().toISOString(),
        })
        .eq('id', existing.id);

      if (error) throw error;
    } else {
      // 3. Create new row
      const { error } = await supabase.from('transcript_segments').insert({
        meeting_id: meetingId,
        source_text: fullSourceText.trim(),
        translated_text: fullTranslatedText.trim(),
        speaker_id: segments[0].speakerId || 'unknown',
      });

      if (error) throw error;
    }

    return NextResponse.json({ success: true, count: segments.length });
  } catch (error) {
    console.error('Error in bulk save route:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}