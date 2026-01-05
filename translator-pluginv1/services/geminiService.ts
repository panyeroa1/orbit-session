
import { GoogleGenAI, Modality, Type, LiveServerMessage } from "@google/genai";
import { TranslationResult, EmotionType } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

/**
 * Decodes base64 string to Uint8Array.
 */
function decode(base64: string) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

/**
 * Decodes raw PCM audio data into an AudioBuffer.
 */
async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number = 24000,
  numChannels: number = 1,
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

/**
 * Live Translation Stream: Uses Gemini 2.5 Flash Native Audio to translate text and generate 
 * high-fidelity audio in a single low-latency turn.
 * 
 * Updated with advanced nuance and emotion synthesis instructions.
 */
export async function streamTranslation(
  sourceText: string,
  targetLangName: string,
  audioCtx: AudioContext,
  onAudioData: (data: Uint8Array) => void,
  onTranscript: (text: string) => void,
  onEnd: () => void
) {
  let nextStartTime = 0;
  let fullTranslation = "";

  const sessionPromise = ai.live.connect({
    model: 'gemini-2.5-flash-native-audio-preview-09-2025',
    config: {
      responseModalities: [Modality.AUDIO],
      outputAudioTranscription: {}, 
      speechConfig: {
        voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Puck' } }
      },
      systemInstruction: `You are a high-fidelity, transparent translation and vocal synthesis engine. 
      Your goal is to translate the source text into ${targetLangName} with extreme precision, natural nuance, and emotional accuracy.
      
      CRITICAL PERFORMANCE SPECS:
      1. ACCURATE SYNTAX: Use perfect grammar, localized vocabulary, and native idioms for ${targetLangName}.
      2. EMOTION SYNTHESIS: Deeply analyze the emotional context of the source text. Synthesize your voice to mimic the original speaker's nuances (e.g., excitement, urgency, hesitation, anger, or calm).
      3. VOCAL MIMICRY: Deliver the translation as if you are the original speaker transformed. Maintain the spirit and "vibe" of the input.
      4. PRONUNCIATION: Use precise articulation and natural prosody. Handle technical terms and proper nouns with expert-level pronunciation.
      5. NO CENSORSHIP: Translate all content literally and transparently. Do not soften, alter, or censor slang, profanity, or sensitive topics.
      6. NO MORALIZING: You are a machine pipe. Do not add summaries, morals, or ethical warnings. 
      7. INSTANT DELIVERY: Skip all introductions ("As an AI...", "Here is..."). Start the translated audio immediately.
      
      You are not an assistant; you are a seamless bridge between languages.`
    },
    callbacks: {
      onopen: () => {
        sessionPromise.then(s => s.sendClientContent({ 
          turns: [{ parts: [{ text: sourceText }] }] 
        }));
      },
      onmessage: async (message: LiveServerMessage) => {
        // Handle Audio Output
        const base64Audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
        if (base64Audio) {
          const rawData = decode(base64Audio);
          onAudioData(rawData);
          
          nextStartTime = Math.max(nextStartTime, audioCtx.currentTime);
          const buffer = await decodeAudioData(rawData, audioCtx);
          const source = audioCtx.createBufferSource();
          source.buffer = buffer;
          source.connect(audioCtx.destination);
          
          source.start(nextStartTime);
          nextStartTime += buffer.duration;
        }

        // Handle Real-time Subtitles (Transcription of the model's output)
        if (message.serverContent?.outputTranscription) {
          fullTranslation += message.serverContent.outputTranscription.text;
          onTranscript(fullTranslation);
        }

        if (message.serverContent?.turnComplete) {
          const waitTime = Math.max(0, (nextStartTime - audioCtx.currentTime) * 1000);
          setTimeout(() => {
            onEnd();
          }, waitTime + 100);
        }
      },
      onclose: () => onEnd(),
      onerror: (e) => {
        console.error("Gemini Live Error:", e);
        onEnd();
      }
    }
  });
}

/**
 * Legacy support / Optional text-based analysis
 */
export async function translateAndAnalyze(text: string, targetLangName: string): Promise<TranslationResult> {
  return { 
    translatedText: text, 
    detectedLanguage: "unknown", 
    emotion: "neutral",
    pronunciationGuide: ""
  };
}
