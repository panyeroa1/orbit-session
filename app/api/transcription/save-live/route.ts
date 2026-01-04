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

    // 1. Try to find an existing row for this meeting
    const { data: existingRows, error: fetchError } = await supabase
      .from('transcript_segments')
      .select('id, source_text, translated_text')
      .eq('meeting_id', meetingId)
      .order('created_at', { ascending: false })
      .limit(1);

    if (fetchError) {
      console.error('Fetch existing transcript failed', fetchError);
      return new NextResponse('Database error', { status: 500 });
    }

    const existing = existingRows && existingRows.length > 0 ? existingRows[0] : null;

    if (existing) {
      // 2. Accumulate: Append new text to the existing row
      const newSource = existing.source_text ? existing.source_text + '\n' + sourceText : sourceText;
      const newTranslated = translatedText 
        ? (existing.translated_text ? existing.translated_text + '\n' + translatedText : translatedText)
        : existing.translated_text;

      const { error: updateError } = await supabase
        .from('transcript_segments')
        .update({
          source_text: newSource,
          translated_text: newTranslated,
          source_lang: sourceLang ?? null,
          target_lang: targetLang ?? null,
          speaker_id: speakerId ?? null,
          created_at: new Date().toISOString(), // Optional: update timestamp to show latest activity
        })
        .eq('id', existing.id);

      if (updateError) {
        console.error('Update transcript failed', updateError);
        return new NextResponse('Failed to update transcript', { status: 500 });
      }
    } else {
      // 3. Insert new row if none exists for this meeting
      const { error: insertError } = await supabase.from('transcript_segments').insert({
        meeting_id: meetingId,
        source_text: sourceText,
        source_lang: sourceLang ?? null,
        speaker_id: speakerId ?? null,
        target_lang: targetLang ?? null,
        translated_text: translatedText ?? null,
      });

      if (insertError) {
        console.error('Insert transcript failed', insertError);
        return new NextResponse('Failed to save transcript', { status: 500 });
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Save live transcription error', error);
    return new NextResponse('Internal error', { status: 500 });
  }
}
