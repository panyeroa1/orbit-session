
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { text } = await request.json();
    
    const apiKey = process.env.CARTESIA_API_KEY;
    if (!apiKey) {
      return new NextResponse('Cartesia API key not configured', { status: 503 });
    }

    const response = await fetch("https://api.cartesia.ai/tts/bytes", {
      method: "POST",
      headers: {
        "Cartesia-Version": "2025-04-16",
        "X-API-Key": apiKey,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model_id: "sonic-3",
        transcript: text,
        voice: {
          mode: "id",
          id: "9c7e6604-52c6-424a-9f9f-2c4ad89f3bb9"
        },
        output_format: {
          container: "wav",
          encoding: "pcm_f32le",
          sample_rate: 44100
        },
        speed: "normal",
        generation_config: { speed: 1, volume: 1 }
      })
    });

    if (!response.ok) {
      const err = await response.text();
      console.error("Cartesia TTS Error", err);
      return new NextResponse(err, { status: 500 });
    }

    const buffer = await response.arrayBuffer();
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'audio/wav',
      },
    });
  } catch (error) {
    console.error('Orbit TTS route error:', error);
    return new NextResponse('Internal error', { status: 500 });
  }
}