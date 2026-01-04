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
  engine: 'deepgram' | 'webspeech';
  language: string;
  audioSource: 'auto' | 'microphone' | 'screen';
  onEngineFallback?: (engine: 'deepgram') => void;
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
  engine,
  language,
  audioSource,
  onEngineFallback,
  onTranscriptSegment,
}: LiveCaptionsProps) {
  const [caption, setCaption] = React.useState('');
  const [statusMessage, setStatusMessage] = React.useState('');
  const [lastUpdateAt, setLastUpdateAt] = React.useState<number | null>(null);
  const [audioSourceVersion, setAudioSourceVersion] = React.useState(0);
  const captureEnabled = broadcastEnabled || enabled;

  // Refs for managing state without re-renders during callbacks
  const recorderRef = React.useRef<MediaRecorder | null>(null);
  const streamRef = React.useRef<MediaStream | null>(null);
  const recognitionRef = React.useRef<any>(null);

  const ownsStreamRef = React.useRef(false);
  const enabledRef = React.useRef(enabled);
  const engineRef = React.useRef(engine);
  const audioSourceRef = React.useRef(audioSource);
  const inFlightRef = React.useRef(false);
  const fallbackTriggeredRef = React.useRef(false);
  const vadEnabledRef = React.useRef(vadEnabled);
  const vadLastVoiceAtRef = React.useRef(0);
  const vadLoopRef = React.useRef<number | null>(null);
  const vadAnalyserRef = React.useRef<ReturnType<typeof createAudioAnalyser> | null>(null);

  const VAD_THRESHOLD = 0.02;
  const VAD_HANGOVER_MS = 700;

  // Sync refs
  React.useEffect(() => {
    enabledRef.current = captureEnabled;
    engineRef.current = engine;
    audioSourceRef.current = audioSource;
    vadEnabledRef.current = vadEnabled;
  }, [captureEnabled, engine, audioSource, vadEnabled]);

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

  React.useEffect(() => {
    if (engine !== 'webspeech') {
      fallbackTriggeredRef.current = false;
    }
  }, [engine]);

  const triggerFallback = React.useCallback(
    (reason: string) => {
      if (fallbackTriggeredRef.current || engineRef.current !== 'webspeech') {
        return;
      }
      fallbackTriggeredRef.current = true;
      console.warn('Web Speech failed, falling back to Deepgram:', reason);
      setStatusMessage('Web Speech unavailable. Switching to Deepgram...');
      onEngineFallback?.('deepgram');
    },
    [onEngineFallback],
  );

  // Cleanup timeout
  const cleanupVAD = React.useCallback(async () => {
    if (vadLoopRef.current) {
      clearInterval(vadLoopRef.current);
      vadLoopRef.current = null;
    }
    if (vadAnalyserRef.current) {
      try {
        await vadAnalyserRef.current.cleanup();
      } catch (error) {
        console.warn('Failed to cleanup VAD analyser', error);
      }
      vadAnalyserRef.current = null;
    }
  }, []);


  const startVAD = React.useCallback(
    async (track?: LocalAudioTrack) => {
      if (!vadEnabledRef.current || !track) {
        await cleanupVAD();
        return;
      }
      await cleanupVAD();
      try {
        vadAnalyserRef.current = createAudioAnalyser(track, {
          fftSize: 512,
          smoothingTimeConstant: 0.85,
          minDecibels: -90,
          maxDecibels: -30,
        });
        
        // Use setInterval instead of requestAnimationFrame for background persistence
        vadLoopRef.current = window.setInterval(() => {
          if (!vadAnalyserRef.current) return;
          const volume = vadAnalyserRef.current.calculateVolume();
          if (volume > VAD_THRESHOLD) {
            vadLastVoiceAtRef.current = Date.now();
          }
        }, 100); // Check every 100ms
      } catch (error) {
        console.warn('VAD setup failed', error);
      }
    },
    [cleanupVAD],
  );

  React.useEffect(() => {
    if (!vadEnabled) {
      cleanupVAD();
    }
  }, [vadEnabled, cleanupVAD]);

  React.useEffect(() => {
    if (!room || !captureEnabled) {
      return;
    }

    const handleLocalTrackChange = (publication: any) => {
      const source = publication?.source;
      if (source === Track.Source.Microphone || source === Track.Source.ScreenShareAudio) {
        setAudioSourceVersion((prev) => prev + 1);
      }
    };

    room.on(RoomEvent.LocalTrackPublished, handleLocalTrackChange);
    room.on(RoomEvent.LocalTrackUnpublished, handleLocalTrackChange);

    return () => {
      room.off(RoomEvent.LocalTrackPublished, handleLocalTrackChange);
      room.off(RoomEvent.LocalTrackUnpublished, handleLocalTrackChange);
    };
  }, [room, captureEnabled]);

  // Stream Setup Helper
  const setupStream = React.useCallback(async (): Promise<MediaStream | null> => {
    let stream: MediaStream | null = null;
    let ownsStream = false;

    const micPublication = room?.localParticipant.getTrackPublication(Track.Source.Microphone);
    const screenPublication = room?.localParticipant.getTrackPublication(Track.Source.ScreenShareAudio);
    const micTrack = micPublication?.track as LocalAudioTrack | undefined;
    const screenTrack = screenPublication?.track as LocalAudioTrack | undefined;

    const shouldUseScreen =
      audioSourceRef.current === 'screen' ||
      (audioSourceRef.current === 'auto' && !!screenTrack?.mediaStreamTrack);

    if (shouldUseScreen) {
      const mediaStreamTrack = screenTrack?.mediaStreamTrack;
      if (mediaStreamTrack) {
        stream = new MediaStream([mediaStreamTrack]);
        await startVAD(screenTrack);
      } else {
        setStatusMessage('Share a tab with audio to start captions.');
        return null;
      }
    } else {
      const mediaStreamTrack = micTrack?.mediaStreamTrack;
      if (mediaStreamTrack) {
        stream = new MediaStream([mediaStreamTrack]);
        await startVAD(micTrack);
      } else {
        try {
          stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          ownsStream = true;
          await startVAD(undefined);
        } catch (err) {
          console.warn('Could not get user media', err);
          return null;
        }
      }
    }

    ownsStreamRef.current = ownsStream;
    streamRef.current = stream;
    setStatusMessage('');
    return stream;
  }, [room, startVAD]);

  // Deepgram Effect
  React.useEffect(() => {
    if (!captureEnabled || engine !== 'deepgram') {
      return;
    }

    let cancelled = false;

    const startDeepgram = async () => {
      const stream = await setupStream();
      if (!stream || cancelled) return;

      const preferredType = 'audio/webm;codecs=opus';
      const mimeType = MediaRecorder.isTypeSupported(preferredType) ? preferredType : 'audio/webm';
      const recorder = new MediaRecorder(stream, { mimeType });
      recorderRef.current = recorder;

      recorder.ondataavailable = async (event) => {
        if (!enabledRef.current || engineRef.current !== 'deepgram' || !event.data || event.data.size === 0) return;
        if (inFlightRef.current) return;
        if (vadEnabledRef.current) {
          const now = Date.now();
          if (!vadLastVoiceAtRef.current || now - vadLastVoiceAtRef.current > VAD_HANGOVER_MS) {
            return;
          }
        }

        inFlightRef.current = true;
        try {
          const buffer = await event.data.arrayBuffer();
          // construct query params
          let url = '/api/transcription';
          if (language && language !== 'auto') {
             url += `?language=${language}`;
          }

          const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': event.data.type || 'audio/webm' },
            body: buffer,
          });
          
          if (!response.ok) {
             inFlightRef.current = false;
             return;
          }
          const data = await response.json();
          const transcript = typeof data?.transcript === 'string' ? data.transcript.trim() : '';
          if (transcript) {
            setCaption(transcript);
            setLastUpdateAt(Date.now());
            onTranscriptSegment?.({
              text: transcript,
              source: audioSourceRef.current,
              timestamp: Date.now(),
              isFinal: true,
              language,
            });
          }
        } catch (error) {
          console.error('Data send failed', error);
        } finally {
          inFlightRef.current = false;
        }
      };

      recorder.onstop = () => {
        if (!cancelled && enabledRef.current && engineRef.current === 'deepgram') {
             // Small delay to prevent tight loops in error cases
             setTimeout(() => {
                 if (recorder.state === 'inactive') {
                     recorder.start();
                     setTimeout(() => {
                         if (recorder.state === 'recording') recorder.stop();
                     }, 1000);
                 }
             }, 10);
        }
      };

      // Initial start
      recorder.start();
      setTimeout(() => {
        if (recorder.state === 'recording') recorder.stop();
      }, 1000);
    };

    startDeepgram();

    return () => {
      cancelled = true;
      if (recorderRef.current?.state !== 'inactive') recorderRef.current?.stop();
      recorderRef.current = null;
      if (ownsStreamRef.current && streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
      }
      streamRef.current = null;
      cleanupVAD();
    };
  }, [captureEnabled, engine, language, room, audioSource, audioSourceVersion, onTranscriptSegment, setupStream, cleanupVAD]);

  // Web Speech API Effect
  React.useEffect(() => {
    if (!captureEnabled || engine !== 'webspeech') {
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      triggerFallback('api_unavailable');
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = language === 'auto' ? navigator.language : language; // Default to browser lang if auto
    recognitionRef.current = recognition;

    recognition.onresult = (event: any) => {
      let interimTranscript = '';
      let finalTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        } else {
          interimTranscript += event.results[i][0].transcript;
        }
      }
      
      const text = finalTranscript || interimTranscript;
      if (text) {
        setStatusMessage('');
        setCaption(text);
        setLastUpdateAt(Date.now());
        if (finalTranscript) {
          onTranscriptSegment?.({
            text: finalTranscript,
            source: audioSourceRef.current,
            timestamp: Date.now(),
            isFinal: true,
            language,
          });
        }
      }
    };

    recognition.onerror = (event: any) => {
      console.warn('Speech recognition error', event.error);
      recognition.stop();
      triggerFallback(event.error || 'unknown_error');
    };

    recognition.onend = () => {
      // Auto-restart if still enabled (and not just stopped by error handler)
      if (enabledRef.current && engineRef.current === 'webspeech') {
        try {
          recognition.start();
        } catch (e) {
          // Ignore if already started
        }
      }
    };

    recognition.start();

    return () => {
      recognition.onend = null; // Prevent restart loop on cleanup
      recognition.stop();
      recognitionRef.current = null;
    };
  }, [captureEnabled, engine, language, onTranscriptSegment, triggerFallback]);

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
