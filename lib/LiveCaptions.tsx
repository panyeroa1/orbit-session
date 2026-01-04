'use client';

import React from 'react';
import { LocalAudioTrack, Room, RoomEvent, Track, createAudioAnalyser } from 'livekit-client';
import styles from '@/styles/SuccessClass.module.css';

export type TranscriptSegment = {
  text: string;
  source: 'microphone' | 'screen' | 'auto';
  timestamp: number;
  isFinal: boolean;
  language?: string;
};

type LiveCaptionsProps = {
  room?: Room;
  enabled: boolean;
  vadEnabled: boolean;
  broadcastEnabled: boolean;
  language: string;
  audioSource: 'auto' | 'microphone' | 'screen';
  onTranscriptSegment?: (segment: TranscriptSegment) => void;
};

// Global type declaration for Web Speech API
declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}

export function LiveCaptions({
  room,
  enabled,
  vadEnabled,
  broadcastEnabled,
  language,
  audioSource,
  onTranscriptSegment,
}: LiveCaptionsProps) {
  const [caption, setCaption] = React.useState('');
  const [statusMessage, setStatusMessage] = React.useState('');
  const [lastUpdateAt, setLastUpdateAt] = React.useState<number | null>(null);
  const captureEnabled = broadcastEnabled || enabled;

  // Refs for managing state without re-renders during callbacks
  const recognitionRef = React.useRef<any>(null);
  const latestInterimRef = React.useRef('');
  const lastUpdateAtRef = React.useRef<number | null>(null);

  const enabledRef = React.useRef(enabled);
  const audioSourceRef = React.useRef(audioSource);

  // Sync refs
  React.useEffect(() => {
    enabledRef.current = captureEnabled;
    audioSourceRef.current = audioSource;
  }, [captureEnabled, audioSource]);

  React.useEffect(() => {
    if (!enabled) {
      setCaption('');
      setStatusMessage('');
      setLastUpdateAt(null);
      return;
    }
    if (!captureEnabled) {
      setCaption('');
      setLastUpdateAt(null);
      setStatusMessage('Tap Broadcast to start transcription.');
      return;
    }
    setStatusMessage('');
  }, [enabled, captureEnabled]);

  // Web Speech API Effect
  React.useEffect(() => {
    if (!captureEnabled) {
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setStatusMessage('Web Speech API is not supported in this browser.');
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = language === 'auto' ? navigator.language : language; // Default to browser lang if auto
    recognitionRef.current = recognition;

    let emittedFinalText = '';

    recognition.onresult = (event: any) => {
      let interimTranscript = '';
      let latestFinal = '';

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          latestFinal += event.results[i][0].transcript;
        } else {
          interimTranscript += event.results[i][0].transcript;
        }
      }
      
      const fullText = latestFinal || interimTranscript;
      if (fullText) {
        setStatusMessage('');
        setCaption(fullText);
        setLastUpdateAt(Date.now());
        
        lastUpdateAtRef.current = Date.now();
        latestInterimRef.current = interimTranscript;

        if (latestFinal) {
          // Calculate what's truly new in this final result
          const newText = latestFinal.substring(emittedFinalText.length).trim();
          if (newText) {
            onTranscriptSegment?.({
              text: newText,
              source: audioSourceRef.current,
              timestamp: Date.now(),
              isFinal: true,
              language,
            });
            emittedFinalText = latestFinal;
            // Clear interim ref since we just emitted a final
            latestInterimRef.current = '';
          }
        }
      }
    };

    // Fast-paced optimization: Emit interim as pseudo-final if speaker pauses
    const silenceInterval = setInterval(() => {
      if (!recognitionRef.current) return;
      
      const now = Date.now();
      const lastUpdate = lastUpdateAtRef.current || 0;
      const interim = latestInterimRef.current || '';
      
      // If we have interim text and no updates for > 800ms, treat it as a pseudo-final
      if (interim.length > 10 && (now - lastUpdate) > 800) {
        onTranscriptSegment?.({
          text: interim,
          source: audioSourceRef.current,
          timestamp: now,
          isFinal: true, // Mark as final to trigger pipeline
          language,
        });
        
        // Reset to prevent double emission
        latestInterimRef.current = '';
        lastUpdateAtRef.current = null;
        setCaption('');
      }
    }, 500);

    recognition.onerror = (event: any) => {
      console.warn('Speech recognition error', event.error);
      if (event.error === 'not-allowed') {
        setStatusMessage('Microphone access denied for speech recognition.');
      } else if (event.error === 'network') {
        setStatusMessage('Network error occurred during speech recognition.');
      }
      recognition.stop();
    };

    recognition.onend = () => {
      // Auto-restart if still enabled (and not just stopped by error handler)
      if (enabledRef.current) {
        try {
          recognition.start();
        } catch (e) {
          // Ignore if already started
        }
      }
    };

    try {
      recognition.start();
    } catch (e) {
      console.error('Failed to start speech recognition', e);
    }

    return () => {
      clearInterval(silenceInterval);
      recognition.onend = null; // Prevent restart loop on cleanup
      recognition.stop();
      recognitionRef.current = null;
    };
  }, [captureEnabled, language, onTranscriptSegment]);

  // Cleanup timeout
  React.useEffect(() => {
    if (!enabled || !lastUpdateAt) return;
    const timeout = window.setTimeout(() => setCaption(''), 4000);
    return () => window.clearTimeout(timeout);
  }, [enabled, lastUpdateAt]);

  if (!enabled) return null;

  return (
    <div className={styles.captionsOverlay} aria-live="polite">
      <div className={styles.captionsBar}>
        {caption || statusMessage || 'Listening...'}
      </div>
    </div>
  );
}
