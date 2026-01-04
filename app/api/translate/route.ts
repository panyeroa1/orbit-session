import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

type TranslationBody = {
  text: string;
  targetLanguage: string;
  provider?: 'google' | 'ollama';
};

export async function POST(request: Request) {
  try {
    const { text, targetLanguage, provider = 'google' } = (await request.json()) as TranslationBody;

    if (!text || !targetLanguage) {
      return new NextResponse('Missing text or targetLanguage', { status: 400 });
    }

    if (provider === 'google') {
      const googleKey = process.env.GOOGLE_TRANSLATE_API_KEY;
      if (!googleKey) {
        return new NextResponse('Google Translate API key is not configured', { status: 503 });
      }

      const payload = {
        q: text,
        target: targetLanguage,
        format: 'text',
      };

      const response = await fetch(
        `https://translation.googleapis.com/language/translate/v2?key=${googleKey}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        },
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Google Translate API error:', errorText);
        return new NextResponse('Google Translate failed', { status: 500 });
      }

      const data = await response.json();
      const translatedText = data?.data?.translations?.[0]?.translatedText?.trim();

      if (!translatedText) {
        return new NextResponse('Google Translate returned empty translation', { status: 500 });
      }

      return NextResponse.json({ translatedText });
    }

    const apiKey = process.env.OLLAMA_API_KEY;
    const baseUrl = process.env.OLLAMA_BASE_URL;
    const model = process.env.OLLAMA_MODEL || 'gemini-3-flash-preview:cloud';

    if (!apiKey || !baseUrl) {
      return new NextResponse('Ollama not configured', { status: 503 });
    }

    const systemPrompt = `You are a professional real-time translator. Translate the given text into ${targetLanguage}.\nOutput ONLY the translated text. Do not include explanations, notes, or quotes. \nKeep the tone warm, conversational, and ready for spoken playback.`;

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: text },
        ],
        temperature: 0.3,
        max_tokens: 500,
      }),
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error('Ollama API error:', errorData);
      return new NextResponse('Translation failed', { status: 500 });
    }

    const data = await response.json();
    const translatedText = data.choices?.[0]?.message?.content?.trim();

    if (!translatedText) {
      return new NextResponse('Empty translation returned', { status: 500 });
    }

    return NextResponse.json({ translatedText });
  } catch (error) {
    console.error('Translation route error:', error);
    return new NextResponse('Internal error', { status: 500 });
  }
}
