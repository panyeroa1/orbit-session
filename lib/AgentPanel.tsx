'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import styles from '@/styles/Eburon.module.css';
import { supabase } from '@/lib/orbit/services/supabaseClient';
import { streamTranslation } from '@/lib/orbit/services/geminiService';
import { LANGUAGES, Language, AUTO_DETECT } from '@/lib/orbit/types';
import { Volume2, VolumeX, Loader2 } from 'lucide-react';

interface AgentPanelProps {
  meetingId?: string;
  onSpeakingStateChange?: (isSpeaking: boolean) => void;
}

interface TranslationLog {
  id: string;
  original: string;
  translation: string;
  lang: string;
}

export function AgentPanel({ meetingId, onSpeakingStateChange }: AgentPanelProps) {
  const [targetLang, setTargetLang] = useState<Language>(LANGUAGES.find(l => l.code === 'es-ES') || LANGUAGES[1]);
  const [isMuted, setIsMuted] = useState(false);
  const [logs, setLogs] = useState<TranslationLog[]>([]);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const logsEndRef = useRef<HTMLDivElement>(null);

  // Notify parent of speaking state
  useEffect(() => {
    onSpeakingStateChange?.(isSpeaking);
  }, [isSpeaking, onSpeakingStateChange]);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const queueRef = useRef<any[]>([]);
  const processingRef = useRef(false);
  const processedIdsRef = useRef<Set<string>>(new Set());

  // Auto-scroll logs
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const ensureAudioContext = useCallback(() => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume();
    }
    return audioCtxRef.current;
  }, []);

  const processQueue = useCallback(async () => {
    if (processingRef.current || queueRef.current.length === 0 || isMuted) return;

    processingRef.current = true;
    const segment = queueRef.current.shift();

    try {
      setIsSpeaking(true);
      const ctx = ensureAudioContext();
      
      // Add 'Processing' log
      const logId = Math.random().toString(36).substring(7);
      setLogs(prev => [...prev, { 
        id: logId, 
        original: segment.source_text, 
        translation: 'Translating...', 
        lang: targetLang.name 
      }]);

      let finalTranslation = '';

      await streamTranslation(
        segment.source_text,
        targetLang.name,
        ctx,
        () => {}, // Audio handled by service
        (text) => {
          // Live update (optional, service sends full text updates)
        },
        (finalText) => {
          finalTranslation = finalText;
          processingRef.current = false;
          setIsSpeaking(false);
          
          // Update log with final
          setLogs(prev => prev.map(l => l.id === logId ? { ...l, translation: finalText } : l));
          
          // Next
          processQueue();
        },
        segment.source_lang || 'auto'
      );
    } catch (e) {
      console.error("Agent translation error:", e);
      processingRef.current = false;
      setIsSpeaking(false);
      processQueue();
    }
  }, [isMuted, targetLang, ensureAudioContext]);

  // Trigger queue processing when unmuted or new items added
  useEffect(() => {
    if (!isMuted && !processingRef.current && queueRef.current.length > 0) {
      processQueue();
    }
  }, [isMuted, processQueue]);

  // Subscribe to transcription
  useEffect(() => {
    if (!meetingId) return;

    const handleRow = (newRow: any) => {
       if (newRow.last_segment_id && processedIdsRef.current.has(newRow.last_segment_id)) return;
       if (newRow.last_segment_id) processedIdsRef.current.add(newRow.last_segment_id);
       
       if (newRow.source_text) {
         queueRef.current.push(newRow);
         processQueue();
       }
    };

    const channel = supabase.channel(`agent:${meetingId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'transcript_segments', filter: `meeting_id=eq.${meetingId}` }, 
        (payload) => handleRow(payload.new)
      )
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'transcript_segments', filter: `meeting_id=eq.${meetingId}` },
        (payload) => handleRow(payload.new)
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [meetingId, processQueue]);

  return (

    <div className="flex flex-col h-full bg-[#0a0f18] text-white font-sans">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-white/5 bg-gradient-to-r from-blue-950/20 to-slate-900/20 backdrop-blur-sm">
        <div>
          <h3 className="text-sm font-extrabold tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-emerald-400">
             AI TRANSLATOR
          </h3>
          <div className="flex items-center gap-1.5 mt-1">
             <div className={`w-1.5 h-1.5 rounded-full shadow-[0_0_8px_currentColor] transition-colors duration-500 ${isSpeaking ? 'text-emerald-400 bg-emerald-400 animate-pulse' : 'text-slate-600 bg-slate-600'}`} />
             <span className="text-[10px] uppercase tracking-wide text-slate-500 font-medium">
               {isSpeaking ? 'Voice Active' : 'Ready'}
             </span>
          </div>
        </div>
        <button 
           onClick={() => {
              const newState = !isMuted;
              setIsMuted(newState);
              if (newState) {
                 if (audioCtxRef.current) audioCtxRef.current.suspend();
              } else {
                 ensureAudioContext();
              }
           }}
           className={`p-2.5 rounded-xl transition-all duration-300 border ${isMuted 
             ? 'bg-red-500/5 border-red-500/20 text-red-400 hover:bg-red-500/10' 
             : 'bg-emerald-500/5 border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/10 hover:shadow-[0_0_15px_rgba(52,211,153,0.15)]'}`}
           title={isMuted ? "Unmute Agent" : "Mute Agent"}
        >
           {isMuted ? <VolumeX size={18} strokeWidth={1.5} /> : <Volume2 size={18} strokeWidth={1.5} />}
        </button>
      </div>

      {/* Controls */}
      <div className="p-5 border-b border-white/5 bg-white/[0.01]">
        <label className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-2.5 block flex items-center gap-2">
           <span>Target Language</span>
           <div className="h-px bg-slate-800 flex-1"/>
        </label>
        <div className="relative group">
           <select 
             aria-label="Target language"
             className="w-full appearance-none bg-[#131b2c] border border-slate-700/50 group-hover:border-slate-600 text-slate-200 text-sm rounded-xl pl-4 pr-10 py-3 focus:outline-none focus:ring-1 focus:ring-emerald-500/50 focus:border-emerald-500/50 transition-all cursor-pointer shadow-sm"
             value={targetLang.code}
             onChange={(e) => setTargetLang(LANGUAGES.find(l => l.code === e.target.value) || LANGUAGES[0])}
           >
             {LANGUAGES.map(lang => (
               <option key={lang.code} value={lang.code} className="bg-[#131b2c]">
                 {lang.flag} {lang.name}
               </option>
             ))}
           </select>
           {/* Custom Chevron */}
           <div className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500 group-hover:text-slate-400 transition-colors">
              <svg width="10" height="6" viewBox="0 0 10 6" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M1 1L5 5L9 1"/></svg>
           </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6 scrollbar-thin scrollbar-thumb-slate-800 scrollbar-track-transparent">
          {logs.length === 0 && (
             <div className="h-full flex flex-col items-center justify-center text-slate-600 space-y-4 opacity-50">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-slate-800/50 to-slate-900/50 border border-white/5 flex items-center justify-center">
                   <Volume2 size={24} className="text-slate-500" strokeWidth={1} />
                </div>
                <p className="text-xs font-medium tracking-wide">Waiting for speech...</p>
             </div>
          )}
          
          {logs.map((log) => (
            <div key={log.id} className="animate-in fade-in slide-in-from-bottom-2 duration-500">
               {/* Original */}
               <div className="group relative pl-3.5 mb-3 opacity-80 hover:opacity-100 transition-opacity">
                  <div className="absolute left-0 top-1.5 bottom-1.5 w-[2px] bg-slate-800 rounded-full group-hover:bg-slate-600 transition-colors" />
                  <p className="text-[10px] uppercase tracking-wide text-slate-500 mb-1 font-semibold">Original</p>
                  <p className="text-xs text-slate-300 leading-relaxed font-light">{log.original}</p>
               </div>

               {/* Translation */}
               <div className="bg-gradient-to-br from-[#151d2b] to-[#0f141f] border border-emerald-500/10 rounded-2xl p-4 shadow-lg relative overflow-hidden group hover:border-emerald-500/20 transition-all">
                  <div className="absolute top-0 right-0 p-3 opacity-0 group-hover:opacity-100 transition-opacity">
                     <span className="text-[9px] text-emerald-500/40 font-mono tracking-tighter uppercase">{log.lang}</span>
                  </div>
                  <div className="flex items-center gap-2 mb-2">
                     <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]" />
                     <span className="text-[10px] uppercase tracking-wider font-bold text-emerald-500">Agent</span>
                  </div>
                  <p className="text-sm text-slate-100 leading-relaxed font-medium">{log.translation}</p>
               </div>
            </div>
          ))}
          
          {isSpeaking && (
              <div className="flex items-center justify-center gap-2 py-4">
                <div className="flex gap-1">
                   <div className="w-1 h-3 bg-emerald-500/50 rounded-full animate-[pulse_0.6s_ease-in-out_infinite]" />
                   <div className="w-1 h-5 bg-emerald-500/50 rounded-full animate-[pulse_0.6s_ease-in-out_0.2s_infinite]" />
                   <div className="w-1 h-3 bg-emerald-500/50 rounded-full animate-[pulse_0.6s_ease-in-out_0.4s_infinite]" />
                </div>
                <span className="text-xs font-medium text-emerald-500/70 tracking-wide uppercase">Speaking</span>
              </div>
          )}
          <div ref={logsEndRef} />
      </div>
    </div>
  );
}
