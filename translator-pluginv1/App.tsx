
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';
import { AppMode, Language, LANGUAGES, RoomState, AudioSource, EmotionType } from './types';
import TranslatorDock from './components/TranslatorDock';
import * as roomStateService from './services/roomStateService';
import * as geminiService from './services/geminiService';

const SUPABASE_URL = 'https://rcbuikbjqgykssiatxpo.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJjYnVpa2JqcWd5a3NzaWF0eHBvIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjQ2NDcyMCwiZXhwIjoyMDgyMDQwNzIwfQ.VVtRWVNMURmi45snFLq733Q_Tzpf1CVXxWPXomxFYGw';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const MY_USER_ID = `user_${Math.random().toString(36).substring(7)}`;
const MY_USER_NAME = `Member ${MY_USER_ID.split('_')[1].toUpperCase()}`;
const MEETING_ID = 'SUCCESS72355'; 

const App: React.FC = () => {
  const [mode, setMode] = useState<AppMode>('idle');
  const [audioSource, setAudioSource] = useState<AudioSource>('mic');
  const [roomState, setRoomState] = useState<RoomState>(roomStateService.getRoomState());
  const [selectedLanguage, setSelectedLanguage] = useState<Language>(LANGUAGES[0]);
  
  // Text states
  const [transcriptHistory, setTranscriptHistory] = useState<string[]>([]);
  const [livePartialText, setLivePartialText] = useState<string>('');
  const [translatedStreamText, setTranslatedStreamText] = useState<string>('');
  
  const [emotion, setEmotion] = useState<EmotionType>('neutral');
  const [audioData, setAudioData] = useState<Uint8Array>(new Uint8Array(0));
  const [isTtsLoading, setIsTtsLoading] = useState(false);

  const selectedLanguageRef = useRef<Language>(LANGUAGES[0]);
  useEffect(() => {
    selectedLanguageRef.current = selectedLanguage;
  }, [selectedLanguage]);

  const recognitionRef = useRef<any>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const isTtsActiveRef = useRef(false);
  const lastProcessedSegmentIdRef = useRef<string | null>(null);
  const currentSegmentBufferRef = useRef<string>('');
  
  const segmentQueueRef = useRef<any[]>([]);
  const realtimeChannelRef = useRef<any>(null);

  const ensureAudioContext = useCallback(() => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume();
    }
    return audioCtxRef.current;
  }, []);

  const shipSegment = async () => {
    const segment = currentSegmentBufferRef.current.trim();
    if (!segment) return;
    currentSegmentBufferRef.current = '';

    const segmentId = Math.random().toString(36).substring(7);
    await supabase.from('transcript_segments').upsert({ 
      meeting_id: MEETING_ID, 
      speaker_id: MY_USER_ID, 
      source_lang: selectedLanguageRef.current.code, 
      source_text: segment,
      last_segment_id: segmentId,
      updated_at: new Date().toISOString()
    }, { onConflict: 'meeting_id' });
  };

  const processNextInQueue = useCallback(async () => {
    if (segmentQueueRef.current.length === 0 || isTtsActiveRef.current) return;

    const row = segmentQueueRef.current.shift();
    if (!row || row.last_segment_id === lastProcessedSegmentIdRef.current) {
      processNextInQueue();
      return;
    }

    lastProcessedSegmentIdRef.current = row.last_segment_id;
    setIsTtsLoading(true);
    
    const currentTargetLang = selectedLanguageRef.current;
    const ctx = ensureAudioContext();

    try {
      isTtsActiveRef.current = true;
      
      await geminiService.streamTranslation(
        row.source_text,
        currentTargetLang.name,
        ctx,
        (data) => {
          setAudioData(data);
          setIsTtsLoading(false);
        },
        (text) => setTranslatedStreamText(text),
        () => {
          isTtsActiveRef.current = false;
          setAudioData(new Uint8Array(0));
          
          if (segmentQueueRef.current.length > 0) {
            processNextInQueue();
          } else {
            setTimeout(() => {
              if (segmentQueueRef.current.length === 0 && !isTtsActiveRef.current) {
                setTranslatedStreamText('');
              }
            }, 3000); 
          }
        }
      );
    } catch (err) {
      console.error("Failed to process segment:", err);
      setIsTtsLoading(false);
      isTtsActiveRef.current = false;
      processNextInQueue();
    }
  }, [ensureAudioContext]);

  const handleIncomingRow = useCallback((row: any) => {
    if (!row || row.speaker_id === MY_USER_ID) return;
    
    // De-duplication check: Is it already processed or in the queue?
    if (row.last_segment_id === lastProcessedSegmentIdRef.current) return;
    const isAlreadyQueued = segmentQueueRef.current.some(q => q.last_segment_id === row.last_segment_id);
    if (isAlreadyQueued) return;

    segmentQueueRef.current.push(row);
    processNextInQueue();
  }, [processNextInQueue]);

  // Continuous polling fetch for ultra-fresh data fallback
  const fetchCurrentSegment = useCallback(async () => {
    const { data } = await supabase.from('transcript_segments')
      .select('*')
      .eq('meeting_id', MEETING_ID)
      .maybeSingle();
    
    if (data) handleIncomingRow(data);
  }, [handleIncomingRow]);

  useEffect(() => {
    if (mode === 'listening') {
      // 1. Subscribe to Realtime for instant updates
      const channel = supabase
        .channel(`meeting:${MEETING_ID}`)
        .on(
          'postgres_changes', 
          { event: '*', schema: 'public', table: 'transcript_segments', filter: `meeting_id=eq.${MEETING_ID}` }, 
          (payload) => {
            handleIncomingRow(payload.new);
          }
        )
        .subscribe();
      
      realtimeChannelRef.current = channel;

      // 2. Initial instant fetch
      fetchCurrentSegment();

      // 3. Continuous polling fallback (every 2 seconds)
      const pollInterval = setInterval(fetchCurrentSegment, 2000);

      return () => {
        if (realtimeChannelRef.current) {
          supabase.removeChannel(realtimeChannelRef.current);
          realtimeChannelRef.current = null;
        }
        clearInterval(pollInterval);
      };
    }
  }, [mode, handleIncomingRow, fetchCurrentSegment]);

  const toggleListen = async () => {
    ensureAudioContext(); 
    if (mode === 'listening') {
      setMode('idle');
      setTranslatedStreamText('');
      setAudioData(new Uint8Array(0));
      segmentQueueRef.current = [];
      lastProcessedSegmentIdRef.current = null;
    } else {
      setMode('listening');
      setLivePartialText('');
      setTranscriptHistory([]);
      setTranslatedStreamText('');
      // The useEffect will handle the initial and continuous fetching
    }
  };

  const handleSpeakToggle = () => {
    ensureAudioContext();
    if (mode === 'speaking') {
      if (recognitionRef.current) recognitionRef.current.stop();
      setMode('idle');
      setLivePartialText('');
      setTranscriptHistory([]);
      roomStateService.releaseSpeaker(MY_USER_ID);
    } else {
      const acquired = roomStateService.tryAcquireSpeaker(MY_USER_ID, MY_USER_NAME);
      if (acquired) {
        setMode('speaking');
        setTranscriptHistory([]);
        
        const recognition = new ((window as any).webkitSpeechRecognition)();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = selectedLanguageRef.current.code; 
        
        recognition.onresult = (event: any) => {
          let final = '', interim = '';
          for (let i = event.resultIndex; i < event.results.length; ++i) {
            if (event.results[i].isFinal) {
              final = event.results[i][0].transcript;
              setTranscriptHistory(prev => [...prev.slice(-2), final]); 
              setLivePartialText('');
            } else {
              interim += event.results[i][0].transcript;
            }
          }
          
          if (interim) {
            setLivePartialText(interim);
          }
          
          if (final) {
            currentSegmentBufferRef.current = final;
            shipSegment();
          }
        };
        recognition.start();
        recognitionRef.current = recognition;
      }
    }
  };

  useEffect(() => {
    const unsub = roomStateService.subscribeToRoomState(setRoomState);
    return () => unsub();
  }, []);

  const sourceDisplayText = [...transcriptHistory, livePartialText].filter(Boolean).join(' ');

  return (
    <div className="min-h-screen bg-black flex flex-col items-center pt-48 p-4 overflow-hidden relative">
      <TranslatorDock
        mode={mode}
        roomState={roomState}
        selectedLanguage={selectedLanguage}
        myUserId={MY_USER_ID}
        onSpeakToggle={handleSpeakToggle}
        onListenToggle={toggleListen}
        onLanguageChange={setSelectedLanguage}
        onRaiseHand={() => roomStateService.raiseHand(MY_USER_ID, MY_USER_NAME)}
        audioData={audioData}
        audioSource={audioSource}
        onAudioSourceToggle={() => setAudioSource(audioSource === 'mic' ? 'system' : 'mic')}
        liveStreamText={sourceDisplayText}
        translatedStreamText={translatedStreamText}
        isTtsLoading={isTtsLoading}
        emotion={emotion}
      />
      <div className="fixed inset-0 pointer-events-none -z-10 opacity-30">
        <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_50%_50%,rgba(17,24,39,1)_0%,rgba(0,0,0,1)_100%)]" />
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-900/10 blur-[120px] rounded-full" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-emerald-900/10 blur-[120px] rounded-full" />
      </div>
    </div>
  );
};

export default App;
