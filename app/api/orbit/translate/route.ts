
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { text, targetLang } = await request.json();

    if (!text || !targetLang) {
      return new NextResponse('Missing text or targetLang', { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY || process.env.NEXT_PUBLIC_GEMINI_API_KEY;
    if (!apiKey) {
      return new NextResponse('Missing Gemini API Key', { status: 500 });
    }

    // Use 2.5-flash as it is confirmed available in the model list
    const model = 'gemini-2.5-flash';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{
          parts: [{ 
            text: `You are a professional translator. Translate the following text to ${targetLang}. Output ONLY the translated text without any quotes, notes, or preambles.\n\nText: ${text}` 
          }]
        }],
        generationConfig: {
          temperature: 0.1
        }
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error(`[Orbit Translation Error] Gemini API returned ${response.status}:`, err);
      return new NextResponse(err, { status: response.status });
    }

    const data = await response.json();
    const translation = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";

    return NextResponse.json({ translation });
  } catch (error) {
    console.error('Orbit translation route error:', error);
    return new NextResponse('Internal error', { status: 500 });
  }
}