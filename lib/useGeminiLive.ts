import { useState, useCallback, useRef, useEffect } from 'react';
import { GoogleGenAI, Modality, LiveServerMessage } from '@google/genai';
import { encode, decode, createPCM16Blob } from '../services/audioUtils';

export function useGeminiLive() {
  const [isRecording, setIsRecording] = useState(false);
  const [transcription, setTranscription] = useState('');
  const [status, setStatus] = useState<'idle' | 'connecting' | 'connected' | 'error'>('idle');
  
  const sessionRef = useRef<Promise<any> | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  
  const currentTranscriptionRef = useRef('');

  const stopRecording = useCallback(() => {
    // 1. Disconnect the processor
    if (processorRef.current) {
      try {
        processorRef.current.disconnect();
      } catch (e) {}
      processorRef.current = null;
    }

    // 2. Stop all microphone tracks
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }

    // 3. Safely close the AudioContext
    if (audioContextRef.current) {
      if (audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close().catch(() => {
          // Ignore errors if context is already closing or closed
        });
      }
      audioContextRef.current = null;
    }

    // 4. Close the Gemini session if it exists
    if (sessionRef.current) {
      sessionRef.current.then((session) => {
        try {
          if (typeof session.close === 'function') {
            session.close();
          }
        } catch (e) {}
      });
      sessionRef.current = null;
    }
    
    setIsRecording(false);
    setStatus('idle');
  }, []);

  const startRecording = useCallback(async () => {
    // Prevent multiple concurrent recording attempts
    if (status === 'connecting' || isRecording) return;

    setStatus('connecting');
    try {
      const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY || process.env.GEMINI_API_KEY || '';
      if (!apiKey) {
        console.error('No Gemini API key found');
        setStatus('error');
        return;
      }

      const ai = new GoogleGenAI({ apiKey });
      
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      audioContextRef.current = audioContext;
      
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        config: {
          responseModalities: [Modality.AUDIO],
          inputAudioTranscription: {},
        //   outputAudioTranscription: {}, // Removed as it might not be needed/supported in this config
          systemInstruction: 'Transcribe the user audio accurately. Do not reply, just transcribe.',
        },
        callbacks: {
          onopen: () => {
            console.log('Gemini Live session opened');
            setStatus('connected');
            setIsRecording(true);
            
            const source = audioContext.createMediaStreamSource(stream);
            // ScriptProcessor is deprecated but compatible. For production, AudioWorklet is preferred.
            const processor = audioContext.createScriptProcessor(4096, 1, 1);
            processorRef.current = processor;
            
            processor.onaudioprocess = (e) => {
              const inputData = e.inputBuffer.getChannelData(0);
              const pcmBlob = createPCM16Blob(inputData);
              sessionPromise.then(session => {
                // Ensure session is still the active one before sending
                if (sessionRef.current === sessionPromise) {
                  session.sendRealtimeInput({ media: { mimeType: "audio/pcm;rate=16000", data: pcmBlob } });
                }
              });
            };
            
            source.connect(processor);
            processor.connect(audioContext.destination);
          },
          onmessage: async (message: LiveServerMessage) => {
            if (message.serverContent?.modelTurn?.parts) {
                // Handle model response if needed, but we instructed to just transcribe
            }
            // Note: inputTranscription is not standard in serverContent for all models.
            // Using userTurn logic usually. But for "transcription only", we'd expect it mirrored or we use STT.
            // The user's code expects inputTranscription. Let's keep it but check structure.
            if ((message as any).serverContent?.inputTranscription) { // Type assertion as types might be strict
              const text = (message as any).serverContent.inputTranscription.text;
              if (text) {
                  currentTranscriptionRef.current += " " + text;
                  setTranscription(currentTranscriptionRef.current);
              }
            }
          },
          onerror: (e) => {
            console.error('Gemini Live error:', e);
            setStatus('error');
            stopRecording();
          },
          onclose: () => {
            console.log('Gemini Live session closed callback');
            stopRecording();
          }
        }
      });

      sessionRef.current = sessionPromise;

    } catch (err) {
      console.error('Failed to start recording:', err);
      setStatus('error');
      stopRecording();
    }
  }, [status, isRecording, stopRecording]);

  const toggleRecording = useCallback(() => {
    if (isRecording || status === 'connecting') {
      stopRecording();
    } else {
      startRecording();
    }
  }, [isRecording, status, startRecording, stopRecording]);

  useEffect(() => {
    if (transcription === '') {
        currentTranscriptionRef.current = '';
    }
  }, [transcription]);

  // Cleanup on unmount
  useEffect(() => {
      return () => {
          stopRecording();
      }
  }, [stopRecording]);

  return {
    isRecording,
    transcription,
    setTranscription,
    toggleRecording,
    status
  };
}
