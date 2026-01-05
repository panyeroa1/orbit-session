import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const { text, targetLang } = await request.json();

    if (!text || !targetLang) {
      return new NextResponse('Missing text or targetLang', { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY || process.env.NEXT_PUBLIC_GEMINI_API_KEY;
    const modelId = "gemini-2.0-flash-lite";

    if (!apiKey) {
      return new NextResponse('Gemini API key not configured', { status: 503 });
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${apiKey}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              {
                text: `You are a professional translator. Translate the following text into ${targetLang}. Only provide the translation.\n\nText: ${text}`
              }
            ]
          }
        ],
        generationConfig: {
          temperature: 0.1,
          topP: 0.95,
          topK: 40,
          maxOutputTokens: 1024,
        }
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('Gemini Translation API Error:', err);
      return new NextResponse(err, { status: response.status });
    }

    const data = await response.json();
    const translation = data.candidates?.[0]?.content?.parts?.[0]?.text || text;

    return NextResponse.json({ translation: translation.trim() });
  } catch (error) {
    console.error('Translation route internal error:', error);
    return new NextResponse('Internal error', { status: 500 });
  }
}
