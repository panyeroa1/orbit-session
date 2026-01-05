'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import * as orbitService from '@/lib/orbit/services/orbitService';
import { LANGUAGES } from '@/lib/orbit/types';
import { toast } from 'react-hot-toast';
import styles from './OrbitTranslator.module.css';

// Orbit Planet Icon SVG
const OrbitIcon = ({ size = 20 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="planetGradient" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#60666e" />
        <stop offset="50%" stopColor="#3d4147" />
        <stop offset="100%" stopColor="#1a1c1f" />
      </linearGradient>
      <linearGradient id="ringGradient" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stopColor="#888" stopOpacity="0.3" />
        <stop offset="50%" stopColor="#ccc" stopOpacity="0.8" />
        <stop offset="100%" stopColor="#888" stopOpacity="0.3" />
      </linearGradient>
    </defs>
    {/* Ring behind planet */}
    <ellipse cx="16" cy="16" rx="14" ry="5" stroke="url(#ringGradient)" strokeWidth="1.5" fill="none" transform="rotate(-20 16 16)" />
    {/* Planet sphere */}
    <circle cx="16" cy="16" r="9" fill="url(#planetGradient)" />
    {/* Ring in front (clipped) */}
    <path d="M 2 16 Q 16 21, 30 16" stroke="url(#ringGradient)" strokeWidth="1.5" fill="none" transform="rotate(-20 16 16)" />
  </svg>
);

interface OrbitTranslatorVerticalProps {
  roomCode: string;
  userId: string;
}

export function OrbitTranslatorVertical({ roomCode, userId }: OrbitTranslatorVerticalProps) {
  const [mode, setMode] = useState<'idle' | 'speaking' | 'listening'>('idle');
  const [targetLanguage, setTargetLanguage] = useState(LANGUAGES[0].code);
  const [transcript, setTranscript] = useState('');
  const [liveText, setLiveText] = useState(''); // Real-time subtitle
  const [translation, setTranslation] = useState('');
  const [isLockedByOther, setIsLockedByOther] = useState(false);
  const [roomUuid, setRoomUuid] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recognitionRef = useRef<any>(null);

  // Initialize Room UUID
  useEffect(() => {
    async function init() {
      const uuid = await orbitService.ensureRoomState(roomCode);
      setRoomUuid(uuid);
    }
    init();
  }, [roomCode]);

  // Subscribe to Room State for Lock status
  useEffect(() => {
    if (!roomUuid) return;
    
    const sub = orbitService.subscribeToRoomState(roomUuid, (state) => {
      const activeSpeaker = state.active_speaker_user_id;
      setIsLockedByOther(!!activeSpeaker && activeSpeaker !== userId);
    });

    return () => {
      sub.unsubscribe();
    };
  }, [roomUuid, userId]);

  // Get Audio Context
  const getAudioContext = useCallback(() => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    return audioCtxRef.current;
  }, []);

  // Start WebSpeech for real-time subtitles
  const startWebSpeech = useCallback(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = navigator.language || 'en-US';

    recognition.onresult = async (event: any) => {
      let interim = '';
      let final = '';

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        const t = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          final += t;
        } else {
          interim += t;
        }
      }

      // Show live text (interim or final)
      setLiveText(interim || final);

      // When we get a final result, save to database
      if (final.trim() && roomUuid) {
        setTranscript(final);
        setLiveText('');
        console.log('Final transcript:', final);
        await orbitService.saveUtterance(roomUuid, userId, final);
      }
    };

    recognition.onerror = (e: any) => {
      console.error('Speech recognition error:', e.error);
    };

    recognition.onend = () => {
      // Auto-restart if still speaking
      if (mode === 'speaking' && recognitionRef.current) {
        try {
          recognition.start();
        } catch (e) {
          // Ignore
        }
      }
    };

    recognition.start();
    recognitionRef.current = recognition;
  }, [roomUuid, userId, mode]);

  // Stop WebSpeech
  const stopWebSpeech = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.onend = null;
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setLiveText('');
  }, []);

  // Start Speaking Mode
  const startSpeaking = useCallback(async () => {
    if (mode === 'listening') return;
    if (!roomUuid) {
      toast.error('Connecting to room...');
      return;
    }

    const acquired = await orbitService.acquireSpeakerLock(roomCode, userId);
    if (!acquired) {
      toast.error('Someone else is speaking');
      return;
    }

    startWebSpeech();
    setMode('speaking');
  }, [mode, roomCode, roomUuid, userId, startWebSpeech]);

  // Stop Speaking Mode
  const stopSpeaking = useCallback(async () => {
    stopWebSpeech();
    await orbitService.releaseSpeakerLock(roomCode, userId);
    setMode('idle');
  }, [roomCode, userId, stopWebSpeech]);

  // Handle new utterance for listening mode
  const handleNewUtterance = useCallback(async (utterance: any) => {
    if (mode !== 'listening') return;
    if (utterance.speaker_user_id === userId) return;

    try {
      // Translate
      const res = await fetch('/api/orbit/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: utterance.text, targetLang: targetLanguage })
      });
      const { translation: translated } = await res.json();
      setTranslation(translated);

      // Save translation
      const transRecord = await orbitService.saveTranslation(roomUuid!, utterance.id, userId, targetLanguage, translated);

      // TTS
      const ctx = getAudioContext();
      const ttsRes = await fetch('/api/orbit/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: translated,
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
      console.error('Translation error:', e);
    }
  }, [mode, roomUuid, userId, targetLanguage, getAudioContext]);

  // Subscribe to utterances when listening
  useEffect(() => {
    if (mode === 'listening' && roomUuid) {
      const sub = orbitService.subscribeToUtterances(roomUuid, handleNewUtterance);
      return () => {
        sub.unsubscribe();
      };
    }
    return undefined;
  }, [mode, roomUuid, handleNewUtterance]);

  const toggleListen = () => {
    if (mode === 'speaking') return;
    setMode(mode === 'listening' ? 'idle' : 'listening');
  };

  // Status helpers
  const getStatusClass = () => {
    if (!roomUuid) return styles.statusConnecting;
    if (mode === 'speaking') return styles.statusSpeaking;
    if (mode === 'listening') return styles.statusListening;
    if (isLockedByOther) return styles.statusLocked;
    return styles.statusReady;
  };

  const getStatusText = () => {
    if (!roomUuid) return 'Connecting...';
    if (mode === 'speaking') return 'Speaking...';
    if (mode === 'listening') return 'Listening...';
    if (isLockedByOther) return 'Locked';
    return 'Ready';
  };

  const speakDisabled = isLockedByOther || mode === 'listening' || !roomUuid;
  const listenDisabled = mode === 'speaking' || !roomUuid;

  return (
    <div className={styles.container}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerTitle}>
          <OrbitIcon size={20} /> Translator
        </div>
        <div className={`${styles.headerStatus} ${getStatusClass()}`}>● {getStatusText()}</div>
      </div>

      {/* Real-time Subtitle Overlay */}
      {(liveText || (mode === 'speaking' && transcript)) && (
        <div className={styles.subtitleOverlay}>
          <div className={styles.subtitleText}>
            {liveText || transcript}
          </div>
        </div>
      )}

      {/* Controls */}
      <div className={styles.controls}>
        {/* Language Dropdown */}
        <div>
          <div className={styles.fieldLabel}>Target Language</div>
          <select
            value={targetLanguage}
            onChange={(e) => setTargetLanguage(e.target.value)}
            title="Target Language"
            className={styles.select}
          >
            {LANGUAGES.map((lang) => (
              <option key={lang.code} value={lang.code}>
                {lang.name}
              </option>
            ))}
          </select>
        </div>

        {/* Speak Button */}
        <button
          onClick={mode === 'speaking' ? stopSpeaking : startSpeaking}
          disabled={speakDisabled}
          className={`${styles.button} ${mode === 'speaking' ? styles.speakButtonActive : styles.speakButton} ${speakDisabled ? styles.buttonDisabled : ''}`}
        >
          {mode === 'speaking' ? '⏹️ Stop' : '🎤 Speak'}
        </button>

        {/* Listen Button */}
        <button
          onClick={toggleListen}
          disabled={listenDisabled}
          className={`${styles.button} ${mode === 'listening' ? styles.listenButtonActive : styles.listenButton} ${listenDisabled ? styles.buttonDisabled : ''}`}
        >
          {mode === 'listening' ? '🔊 Listening' : '🎧 Listen'}
        </button>
      </div>

      {/* Activity Section */}
      <div className={styles.activitySection}>
        <div className={styles.activityLabel}>Activity</div>
        <div className={styles.activityBox}>
          {transcript && (
            <div className={styles.transcriptOriginal}>
              <span className={styles.transcriptLabel}>You:</span> {transcript}
            </div>
          )}
          {translation && (
            <div className={styles.translationText}>
              <span className={styles.translationLabel}>→</span> {translation}
            </div>
          )}
          {!transcript && !translation && (
            <div className={styles.noActivity}>No activity yet</div>
          )}
        </div>
      </div>
    </div>
  );
}

// Export the icon for use in control bar
export { OrbitIcon };
