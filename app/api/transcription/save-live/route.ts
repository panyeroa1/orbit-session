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
    const meetingId = body.meetingId as string | undefined;
    const sourceText = body.sourceText as string | undefined;
    const sourceLang = body.sourceLang as string | undefined;
    const speakerId = body.speakerId as string | undefined;

    if (!meetingId || !sourceText) {
      return new NextResponse('Missing meetingId or sourceText', { status: 400 });
    }

    const supabase = getSupabaseClient();
    if (!supabase) {
      return new NextResponse('Supabase not configured', { status: 503 });
    }

    // Check for existing transcript, most recent first
    const { data: existingRows, error: fetchError } = await supabase
      .from('transcript_segments')
      .select('id, source_text')
      .eq('meeting_id', meetingId)
      .order('created_at', { ascending: false })
      .limit(1);

    if (fetchError) {
      console.error('Fetch existing transcript failed', fetchError);
      return new NextResponse('Database error', { status: 500 });
    }

    const existing = existingRows && existingRows.length > 0 ? existingRows[0] : null;

    if (existing) {
      // Append to the most recent existing row
      const updatedText = existing.source_text + '\n' + sourceText;
      const { error: updateError } = await supabase
        .from('transcript_segments')
        .update({
          source_text: updatedText,
          speaker_id: speakerId ?? null,
          source_lang: sourceLang ?? null,
          created_at: new Date().toISOString(), // Keep it "recent"
        })
        .eq('id', existing.id);

      if (updateError) {
        console.error('Update transcript segment failed', updateError);
        return new NextResponse('Failed to update', { status: 500 });
      }
    } else {
      // Insert new row if none exists
      const { error: insertError } = await supabase.from('transcript_segments').insert({
        meeting_id: meetingId,
        source_text: sourceText,
        source_lang: sourceLang ?? null,
        speaker_id: speakerId ?? null,
      });

      if (insertError) {
        console.error('Insert transcript segment failed', insertError);
        return new NextResponse('Failed to save', { status: 500 });
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Save live transcription error', error);
    return new NextResponse('Internal error', { status: 500 });
  }
}
