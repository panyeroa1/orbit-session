import { NextRequest, NextResponse } from 'next/server';
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

const DEFAULT_MODEL = 'nova-2';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const meetingId = searchParams.get('meetingId');

    if (!meetingId) {
      return new NextResponse('meetingId is required', { status: 400 });
    }

    const supabase = getSupabaseClient();
    if (!supabase) {
      return new NextResponse('Supabase not configured', { status: 503 });
    }

    const { data, error } = await supabase
      .from('transcript_segments')
      .select('*')
      .eq('meeting_id', meetingId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Fetch transcripts failed', error);
      return new NextResponse('Database error', { status: 500 });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('GET transcripts error:', error);
    return new NextResponse('Internal error', { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const apiKey = process.env.DEEPGRAM_API_KEY || process.env.NEXT_PUBLIC_DEEPGRAM_API_KEY;
    if (!apiKey) {
      return new NextResponse('DEEPGRAM_API_KEY is not configured', { status: 500 });
    }

    const audioBuffer = await request.arrayBuffer();
    if (audioBuffer.byteLength === 0) {
      return new NextResponse('Empty audio payload', { status: 400 });
    }

    const contentType = request.headers.get('content-type') ?? 'application/octet-stream';
    const url = new URL('https://api.deepgram.com/v1/listen');
    
    // Parse language from query
    const { searchParams } = new URL(request.url);
    const language = searchParams.get('language');

    url.searchParams.set('model', DEFAULT_MODEL);
    url.searchParams.set('punctuate', 'true');
    url.searchParams.set('smart_format', 'true');

    if (language && language !== 'auto') {
      url.searchParams.set('language', language);
    } else {
      url.searchParams.set('detect_language', 'true');
    }

    const response = await fetch(url.toString(), {
      method: 'POST',
      headers: {
        Authorization: `Token ${apiKey}`,
        'Content-Type': contentType,
      },
      body: Buffer.from(audioBuffer),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return new NextResponse(errorText || 'Deepgram error', { status: response.status });
    }

    const data = await response.json();
    // Only return the transcript, do not save to DB here as we don't have meetingId context
    const transcript = data.results?.channels[0]?.alternatives[0]?.transcript || '';

    return NextResponse.json(
      { transcript },
      {
        headers: {
          'Cache-Control': 'no-store, max-age=0',
        },
      },
    );
  } catch (error) {
    console.error('Transcription error:', error);
    return new NextResponse('Transcription error', { status: 500 });
  }
}