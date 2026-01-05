
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { text } = await request.json();
    
    // Mock TTS for now to avoid Cartesia dep errors immediately
    // In a real restore, we'd add back the Cartesia client code here
    
    // Return empty buffer or simple sine wave for mock success
    // This allows the frontend to "play" something without crashing
    const sampleRate = 24000;
    const duration = 1; // 1 second
    const numSamples = sampleRate * duration;
    const buffer = new Float32Array(numSamples);
    for (let i = 0; i < numSamples; i++) {
      buffer[i] = Math.sin(2 * Math.PI * 440 * i / sampleRate) * 0.1;
    }
    
    return new NextResponse(buffer.buffer as any, {
      headers: {
        'Content-Type': 'application/octet-stream',
      },
    });
  } catch (error) {
    console.error('Orbit TTS route error:', error);
    return new NextResponse('Internal error', { status: 500 });
  }
}
