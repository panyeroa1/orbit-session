
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

  // Get status text for display
  const getStatusText = () => {
    if (!roomUuid) return 'Connecting...';
    if (mode === 'speaking') return 'You are speaking';
    if (mode === 'listening') return 'Listening for translations';
    if (isLockedByOther) return 'Someone else is speaking';
    return 'Ready';
  };

  const getStatusColor = () => {
    if (!roomUuid) return 'text-yellow-400';
    if (mode === 'speaking') return 'text-red-400';
    if (mode === 'listening') return 'text-emerald-400';
    if (isLockedByOther) return 'text-orange-400';
    return 'text-gray-400';
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-white/10">
        <h2 className="text-lg font-bold text-white flex items-center gap-2">
          🌐 ORBIT Translator
        </h2>
        <p className={`text-sm mt-1 ${getStatusColor()}`}>
          ● {getStatusText()}
        </p>
      </div>

      {/* Controls */}
      <div className="flex-1 p-4 space-y-4">
        {/* Language Selection */}
        <div>
          <label className="block text-xs text-gray-400 mb-2 uppercase tracking-wider">
            Translate To
          </label>
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
              className="w-full py-3 px-4 bg-zinc-800/80 text-white rounded-lg border border-white/10 appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all text-sm font-medium"
            >
              {LANGUAGES.map((lang) => (
                <option key={lang.code} value={lang.code}>
                  {lang.name}
                </option>
              ))}
            </select>
            <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-500 text-xs">
              ▼
            </div>
          </div>
        </div>

        {/* Speak Button */}
        <button
          onClick={mode === 'speaking' ? stopSpeaking : startSpeaking}
          disabled={isLockedByOther || mode === 'listening' || !roomUuid}
          className={`w-full flex items-center justify-center gap-3 py-4 px-6 rounded-xl font-semibold text-sm transition-all duration-300 ${
            mode === 'speaking' 
              ? 'bg-gradient-to-r from-red-600 to-red-500 text-white shadow-lg shadow-red-500/30 animate-pulse' 
              : 'bg-gradient-to-r from-white to-gray-100 text-gray-900 hover:shadow-lg hover:shadow-white/20'
          } disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:shadow-none`}
        >
          <span className="text-lg">
            {mode === 'speaking' ? '⏹️' : '🎤'}
          </span>
          {mode === 'speaking' ? 'Stop Speaking' : isLockedByOther ? '🔒 Locked' : 'Speak Now'}
        </button>

        {/* Listen Button */}
        <button
          onClick={toggleListen}
          disabled={mode === 'speaking' || !roomUuid}
          className={`w-full flex items-center justify-center gap-3 py-4 px-6 rounded-xl font-semibold text-sm transition-all duration-300 ${
            mode === 'listening'
              ? 'bg-gradient-to-r from-emerald-600 to-emerald-500 text-white shadow-lg shadow-emerald-500/30'
              : 'bg-zinc-800 text-white hover:bg-zinc-700 border border-white/10'
          } disabled:opacity-40 disabled:cursor-not-allowed`}
        >
          <span className="text-lg">
            {mode === 'listening' ? '🔊' : '🎧'}
          </span>
          {mode === 'listening' ? 'Listening...' : 'Listen to Translations'}
        </button>
      </div>

      {/* Transcript Display */}
      <div className="p-4 border-t border-white/10">
        <div className="text-xs text-gray-500 uppercase tracking-wider mb-2">
          Recent Activity
        </div>
        <div className="bg-black/30 rounded-lg p-3 min-h-[80px] max-h-[150px] overflow-y-auto">
          {lastFinalText || lastTranslatedText ? (
            <div className="space-y-2 text-sm">
              {lastFinalText && (
                <div className="text-gray-400">
                  <span className="text-gray-600">Original:</span> &quot;{lastFinalText}&quot;
                </div>
              )}
              {lastTranslatedText && (
                <div className="text-emerald-400 font-medium">
                  <span className="text-emerald-600">Translated:</span> {lastTranslatedText}
                </div>
              )}
            </div>
          ) : (
            <div className="text-gray-600 text-sm italic">
              No recent translations
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
