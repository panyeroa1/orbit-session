import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const { text, targetLang } = await request.json();

    if (!text || !targetLang) {
      return new NextResponse('Missing text or targetLang', { status: 400 });
    }

    const apiKey = process.env.OLLAMA_API_KEY;
    const baseUrl = process.env.OLLAMA_BASE_URL || 'https://ollama.com';
    const model = process.env.OLLAMA_MODEL || 'gpt-oss:120b';

    if (!apiKey) {
      return new NextResponse('Ollama API key not configured', { status: 503 });
    }

    const response = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: model,
        messages: [
          {
            role: 'system',
            content: `You are a professional translator. Translate the following text into ${targetLang}. Only provide the translation.`,
          },
          { role: 'user', content: text },
        ],
        stream: false,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('Ollama Translation API Error:', err);
      return new NextResponse(err, { status: response.status });
    }

    const data = await response.json();
    const translation = data.message?.content || text;

    return NextResponse.json({ translation });
  } catch (error) {
    console.error('Translation route internal error:', error);
    return new NextResponse('Internal error', { status: 500 });
  }
}
