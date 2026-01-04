import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

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
    const { 
      meetingId, 
      sourceText, 
      sourceLang, 
      speakerId,
      targetLang,
      translatedText
    } = body;

    if (!meetingId || !sourceText) {
      return new NextResponse('Missing meetingId or sourceText', { status: 400 });
    }

    const supabase = getSupabaseClient();
    if (!supabase) {
      return new NextResponse('Supabase not configured', { status: 503 });
    }

    // Insert a new segment row with optional translation data.
    const { error: insertError } = await supabase.from('transcript_segments').insert({
      meeting_id: meetingId,
      source_text: sourceText,
      source_lang: sourceLang ?? null,
      speaker_id: speakerId ?? null,
      target_lang: targetLang ?? null,
      translated_text: translatedText ?? null,
    });

    if (insertError) {
      console.error('Insert transcript segment failed', insertError);
      return new NextResponse('Failed to save segment', { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Save live transcription error', error);
    return new NextResponse('Internal error', { status: 500 });
  }
}
