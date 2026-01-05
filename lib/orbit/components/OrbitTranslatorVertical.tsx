'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import * as orbitService from '@/lib/orbit/services/orbitService';
import { toast } from 'react-hot-toast';
import styles from './OrbitTranslator.module.css';
import { OrbitSubtitleOverlay } from './OrbitSubtitleOverlay';

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
  onLiveTextChange?: (text: string) => void;
}

export function OrbitTranslatorVertical({ roomCode, userId, onLiveTextChange }: OrbitTranslatorVerticalProps) {
  const [mode, setMode] = useState<'idle' | 'speaking'>('idle');
  const [transcript, setTranscript] = useState('');
  const [liveText, setLiveText] = useState(''); // Real-time subtitle
  const [isLockedByOther, setIsLockedByOther] = useState(false);
  const [roomUuid, setRoomUuid] = useState<string | null>(null);

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

      // When we get a final result, segment into sentences and save each
      if (final.trim() && roomUuid) {
        setTranscript(final);
        setLiveText('');
        
        // Split into sentences (handles . ! ? and common patterns)
        const sentences = final
          .split(/(?<=[.!?])\s+/)
          .map(s => s.trim())
          .filter(s => s.length > 0);
        
        console.log('Pipeline: Saving sentences:', sentences);
        
        // Just Save for STT
        for (const sentence of sentences) {
            try {
              const utterance = await orbitService.saveUtterance(roomUuid, userId, sentence);
              console.log('Saved utterance:', utterance?.id);
            } catch (saveErr) {
              console.warn('Save skipped (DB not configured):', saveErr);
            }
        }
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

  // Status helpers
  const getStatusClass = () => {
    if (!roomUuid) return styles.statusConnecting;
    if (mode === 'speaking') return styles.statusSpeaking;
    if (isLockedByOther) return styles.statusLocked;
    return styles.statusReady;
  };

  const getStatusText = () => {
    if (!roomUuid) return 'Connecting...';
    if (mode === 'speaking') return 'Speaking...';
    if (isLockedByOther) return 'Locked';
    return 'Ready';
  };

  const speakDisabled = isLockedByOther || !roomUuid;

  return (
    <div className={styles.container}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerTitle}>
          <OrbitIcon size={20} /> Translator
        </div>
        <div className={`${styles.headerStatus} ${getStatusClass()}`}>● {getStatusText()}</div>
      </div>

      {/* Global Subtitle Overlay (rendered above control bar via portal) */}
      {typeof document !== 'undefined' && (
        <OrbitSubtitleOverlay 
          text={liveText || (mode === 'speaking' ? transcript : '')} 
          isVisible={mode === 'speaking' && !!(liveText || transcript)} 
        />
      )}

      {/* Controls */}
      <div className={styles.controls}>
        {/* Speak Button */}
        <button
          onClick={mode === 'speaking' ? stopSpeaking : startSpeaking}
          disabled={speakDisabled}
          className={`${styles.button} ${mode === 'speaking' ? styles.speakButtonActive : styles.speakButton} ${speakDisabled ? styles.buttonDisabled : ''}`}
        >
          {mode === 'speaking' ? '⏹️ Stop' : '🎤 Speak'}
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
          {!transcript && (
            <div className={styles.noActivity}>No activity yet</div>
          )}
        </div>
      </div>
    </div>
  );
}

// Export the icon for use in control bar
export { OrbitIcon };
