
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: Request) {
  try {
    const { text, roomId, utteranceId, translationId, listenerUserId } = await request.json();

    if (!text || !roomId || !listenerUserId) {
      return new NextResponse('Missing required fields', { status: 400 });
    }

    const apiKey = process.env.CARTESIA_API_KEY;
    const voiceId = process.env.CARTESIA_VOICE_ID;
    const version = process.env.CARTESIA_VERSION || '2025-04-16';

    if (!apiKey || !voiceId) {
      return new NextResponse('Cartesia config missing', { status: 503 });
    }

    // 1. Log Queued state
    const { data: event, error: logError } = await supabase
      .from('tts_events')
      .insert({
        room_id: roomId,
        utterance_id: utteranceId,
        translation_id: translationId,
        listener_user_id: listenerUserId,
        provider: 'cartesia',
        voice_id: voiceId,
        status: 'queued'
      })
      .select()
      .single();

    if (logError) console.error('Error logging tts queued:', logError);

    // 2. Call Cartesia
    const response = await fetch('https://api.cartesia.ai/tts/bytes', {
      method: 'POST',
      headers: {
        'Cartesia-Version': version,
        'X-API-Key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model_id: 'sonic-3-latest',
        transcript: text,
        voice: {
          mode: 'id',
          id: voiceId,
        },
        output_format: {
          container: 'raw',
          encoding: 'pcm_f32le',
          sample_rate: 24000,
        },
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      if (event?.id) {
        await supabase.from('tts_events').update({ status: 'error', error: err }).eq('id', event.id);
      }
      return new NextResponse(err, { status: response.status });
    }

    const audioData = await response.arrayBuffer();

    // 3. Mark as done (simplified for this route, ideally would be 'playing' then 'done')
    if (event?.id) {
      await supabase.from('tts_events').update({ status: 'done' }).eq('id', event.id);
    }

    return new NextResponse(audioData, {
      headers: { 'Content-Type': 'audio/pcm' }
    });
  } catch (error) {
    console.error('Orbit TTS route error:', error);
    return new NextResponse('Internal error', { status: 500 });
  }
}
