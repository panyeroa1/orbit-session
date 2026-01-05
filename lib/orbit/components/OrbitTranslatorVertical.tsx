
'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import * as orbitService from '@/lib/orbit/services/orbitService';
import { LANGUAGES } from '@/lib/orbit/types';
import { toast } from 'react-hot-toast';

interface OrbitTranslatorVerticalProps {
  roomCode: string; // the slug/id from URL
  userId: string; // uuid
}

export function OrbitTranslatorVertical({ roomCode, userId }: OrbitTranslatorVerticalProps) {
  const [mode, setMode] = useState<'idle' | 'speaking' | 'listening'>('idle');
  const [targetLanguage, setTargetLanguage] = useState(LANGUAGES[0].code);
  const [lastFinalText, setLastFinalText] = useState('');
  const [lastTranslatedText, setLastTranslatedText] = useState('');
  const [isLockedByOther, setIsLockedByOther] = useState(false);
  const [roomUuid, setRoomUuid] = useState<string | null>(null);

  const recognitionRef = useRef<any>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  // Initialize Room UUID
  useEffect(() => {
    async function init() {
      const uuid = await orbitService.ensureRoomState(roomCode);
      setRoomUuid(uuid);
    }
    init();
  }, [roomCode]);

  // Initialize Audio Context
  const getAudioContext = useCallback(() => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    return audioCtxRef.current;
  }, []);

  const stopSpeaking = useCallback(async () => {
    if (recognitionRef.current) {
      recognitionRef.current.onend = null;
      recognitionRef.current.stop();
    }
    await orbitService.releaseSpeakerLock(roomCode, userId);
    setMode('idle');
  }, [roomCode, userId]);

  // Subscribe to Room State for Lock status
  useEffect(() => {
    if (!roomUuid) return;
    
    const sub = orbitService.subscribeToRoomState(roomUuid, (state) => {
      const activeSpeaker = state.active_speaker_user_id;
      setIsLockedByOther(!!activeSpeaker && activeSpeaker !== userId);
      if (activeSpeaker === null && mode === 'speaking') {
          // If lock released by server, stop speaking
          stopSpeaking();
      }
    });

    return () => {
      sub.unsubscribe();
    };
  }, [roomUuid, userId, mode, stopSpeaking]);

  // STT Logic
  const startSpeaking = useCallback(async () => {
    if (mode === 'listening') return;
    if (!roomUuid) {
       toast.error('Initializing room state...');
       return;
    }
    
    const acquired = await orbitService.acquireSpeakerLock(roomCode, userId);
    if (!acquired) {
      toast.error('Someone else is currently speaking');
      return;
    }

    try {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (!SpeechRecognition) throw new Error('Speech recognition not supported');

      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'auto';

      recognition.onresult = async (event: any) => {
        let finalInThisTurn = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalInThisTurn += event.results[i][0].transcript;
          }
        }

        if (finalInThisTurn.trim()) {
          setLastFinalText(finalInThisTurn);
          await orbitService.saveUtterance(roomUuid, userId, finalInThisTurn);
        }
      };

      recognition.onerror = (event: any) => {
        console.error('STT Error:', event.error);
        stopSpeaking();
      };

      recognition.onend = () => {
        if (mode === 'speaking') {
            try {
                recognition.start();
            } catch (e) {
                console.error("Failed to restart speech recognition", e);
            }
        }
      };

      recognition.start();
      recognitionRef.current = recognition;
      setMode('speaking');
    } catch (e: any) {
      toast.error(e.message);
      await orbitService.releaseSpeakerLock(roomCode, userId);
    }
  }, [mode, roomCode, roomUuid, userId, stopSpeaking]);

  // Translation & TTS Pipeline Logic
  const handleNewUtterance = useCallback(async (utterance: any) => {
    if (mode !== 'listening') return;
    if (utterance.speaker_user_id === userId) return; // Don't translate self

    try {
      // 1. Translate
      const res = await fetch('/api/orbit/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: utterance.text, targetLang: targetLanguage })
      });
      const { translation } = await res.json();
      setLastTranslatedText(translation);

      // 2. Save Translation
      const transRecord = await orbitService.saveTranslation(roomUuid!, utterance.id, userId, targetLanguage, translation);

      // 3. TTS
      const ctx = getAudioContext();
      const ttsRes = await fetch('/api/orbit/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: translation,
          roomId: roomUuid,
          utteranceId: utterance.id,
          translationId: transRecord?.id,
          listenerUserId: userId
        })
      });

      if (ttsRes.ok) {
        const arrayBuf = await ttsRes.arrayBuffer();
        const floatData = new Float32Array(arrayBuf);
        const audioBuf = ctx.createBuffer(1, floatData.length, 24000);
        audioBuf.getChannelData(0).set(floatData);
        
        const source = ctx.createBufferSource();
        source.buffer = audioBuf;
        source.connect(ctx.destination);
        source.start();
      }
    } catch (e) {
      console.error('Listening flow error:', e);
    }
  }, [mode, roomUuid, userId, targetLanguage, getAudioContext]);

  useEffect(() => {
    if (mode === 'listening' && roomUuid) {
      const sub = orbitService.subscribeToUtterances(roomUuid, (u) => {
        handleNewUtterance(u);
      });
      return () => {
        sub.unsubscribe();
      };
    }
  }, [mode, roomUuid, handleNewUtterance]);

  const toggleListen = () => {
    if (mode === 'speaking') return;
    setMode(mode === 'listening' ? 'idle' : 'listening');
  };

  return (
    <div className="flex flex-col gap-4 w-full max-w-xs p-4 bg-black/40 backdrop-blur-xl rounded-2xl border border-white/10 shadow-2xl">
      {/* 1. Speak Now */}
      <button
        onClick={mode === 'speaking' ? stopSpeaking : startSpeaking}
        disabled={isLockedByOther || mode === 'listening'}
        className={`flex items-center justify-center gap-2 py-4 px-6 rounded-xl font-bold transition-all duration-300 ${
          mode === 'speaking' 
            ? 'bg-red-500 text-white shadow-[0_0_20px_rgba(239,68,68,0.4)] animate-pulse' 
            : 'bg-white text-black hover:bg-gray-200 shadow-lg'
        } disabled:opacity-50 disabled:cursor-not-allowed`}
      >
        <span className="text-xl">
          {mode === 'speaking' ? '●' : '🎤'}
        </span>
        {mode === 'speaking' ? 'Stop Speaking' : isLockedByOther ? 'Locked' : 'Speak Now'}
      </button>

      {/* 2. Listen Translation */}
      <button
        onClick={toggleListen}
        disabled={mode === 'speaking'}
        className={`flex items-center justify-center gap-2 py-4 px-6 rounded-xl font-bold transition-all duration-300 ${
          mode === 'listening'
            ? 'bg-emerald-500 text-white shadow-[0_0_20px_rgba(16,185,129,0.4)]'
            : 'bg-zinc-800 text-white hover:bg-zinc-700 border border-white/5'
        } disabled:opacity-50 disabled:cursor-not-allowed`}
      >
        <span className="text-xl">
          {mode === 'listening' ? '🔊' : '🎧'}
        </span>
        {mode === 'listening' ? 'Listening...' : 'Listen Translation'}
      </button>

      {/* 3. Full Languages Dropdown */}
      <div className="relative">
        <select
          value={targetLanguage}
          title="Select Target Language"
          onChange={(e) => {
            const lang = e.target.value;
            setTargetLanguage(lang);
            if (roomUuid) {
              orbitService.updateParticipantLanguage(roomUuid, userId, lang);
            }
          }}
          className="w-full py-4 px-6 bg-zinc-800/50 text-white rounded-xl border border-white/5 appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-white/20 transition-all font-medium"
        >
          {LANGUAGES.map((lang) => (
            <option key={lang.code} value={lang.code}>
              {lang.name}
            </option>
          ))}
        </select>
        <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none opacity-50">
          ▼
        </div>
      </div>

      {/* Debug Display (Optional based on requirements but helpful) */}
      {(lastFinalText || lastTranslatedText) && (
        <div className="mt-2 p-3 bg-white/5 rounded-lg text-xs space-y-2 animate-in fade-in duration-500">
          {lastFinalText && <div className="text-gray-400 italic">&quot;{lastFinalText}&quot;</div>}
          {lastTranslatedText && <div className="text-emerald-400 font-medium">→ {lastTranslatedText}</div>}
        </div>
      )}
    </div>
  );
}
