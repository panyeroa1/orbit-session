import { NextResponse } from 'next/server';
import { GoogleGenAI } from "@google/genai";

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const { text, targetLang } = await request.json();

    if (!text || !targetLang) {
      return new NextResponse('Missing text or targetLang', { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY || process.env.NEXT_PUBLIC_GEMINI_API_KEY;
    if (!apiKey) {
      return new NextResponse('Gemini API key not configured', { status: 503 });
    }

    const genAI = new GoogleGenAI({ apiKey });
    
    const result = await genAI.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        {
          role: "user",
          parts: [{ text: `You are a professional translator. Translate the following text into ${targetLang}. Only provide the translation.\n\nText: ${text}` }]
        }
      ]
    });
    
    // The response structure might differ, checking typical @google/genai response
    const translation = result.candidates?.[0]?.content?.parts?.[0]?.text || text;

    return NextResponse.json({ translation: translation.trim() });
  } catch (error: any) {
    console.error('Gemini SDK Translation Error:', error);
    return new NextResponse(error.message || 'Internal error', { status: 500 });
  }
}
