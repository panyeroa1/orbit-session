import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const { text, voiceId: requestedVoiceId } = await request.json();

    if (!text) {
      return new NextResponse('Missing text', { status: 400 });
    }

    const apiKey = process.env.CARTESIA_API_KEY;
    const voiceEnv = process.env.CARTESIA_VOICE_ID;
    const modelId = process.env.CARTESIA_MODEL_ID || 'sonic-3';

    const voiceToUse = requestedVoiceId?.trim() || voiceEnv;

    if (!apiKey || !voiceToUse) {
      return new NextResponse('Cartesia not configured', { status: 503 });
    }

    const response = await fetch('https://api.cartesia.ai/tts/bytes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey,
        'Cartesia-Version': '2024-06-10',
      },
      body: JSON.stringify({
        model_id: modelId,
        transcript: text,
        voice: {
          mode: 'id',
          id: voiceToUse,
        },
        output_format: {
          container: 'mp3',
          sample_rate: 44100,
          bit_rate: 128000,
        },
      }),
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error('Cartesia API error details:', {
        status: response.status,
        statusText: response.statusText,
        error: errorData,
        modelId,
        voiceToUse: voiceToUse.substring(0, 8) + '...',
      });
      return new NextResponse(`TTS failed: ${response.status}`, { status: response.status });
    }

    const audioBuffer = await response.arrayBuffer();
    console.log(`TTS successful: generated ${audioBuffer.byteLength} bytes for text: "${text.substring(0, 30)}..."`);

    return new NextResponse(audioBuffer, {
      headers: {
        'Content-Type': 'audio/mpeg',
        'Cache-Control': 'no-cache',
      },
    });
  } catch (error) {
    console.error('TTS route internal error:', error);
    return new NextResponse('Internal error', { status: 500 });
  }
}
