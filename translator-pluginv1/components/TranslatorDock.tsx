
import React from 'react';
import { AppMode, Language, LANGUAGES, RoomState, AudioSource, EmotionType } from '../types';
import { ChevronDown, Mic, Volume2, Hand, X, Monitor, Lock, Loader2 } from 'lucide-react';

interface TranslatorDockProps {
  mode: AppMode;
  roomState: RoomState;
  selectedLanguage: Language;
  myUserId: string;
  onSpeakToggle: () => void;
  onListenToggle: () => void;
  onLanguageChange: (lang: Language) => void;
  onRaiseHand: () => void;
  audioData?: Uint8Array;
  audioSource: AudioSource;
  onAudioSourceToggle: () => void;
  liveStreamText?: string;
  translatedStreamText?: string;
  isTtsLoading?: boolean;
  emotion?: EmotionType;
}

const emotionColors: Record<EmotionType, string> = {
  neutral: 'text-slate-100',
  joy: 'text-emerald-400 drop-shadow-[0_0_12px_rgba(52,211,153,0.5)]',
  sadness: 'text-blue-400 drop-shadow-[0_0_12px_rgba(96,165,250,0.5)]',
  anger: 'text-red-400 drop-shadow-[0_0_12px_rgba(248,113,113,0.5)]',
  fear: 'text-purple-400 drop-shadow-[0_0_12px_rgba(192,132,252,0.5)]',
  calm: 'text-cyan-300 drop-shadow-[0_0_12px_rgba(103,232,249,0.5)]',
  excited: 'text-amber-400 drop-shadow-[0_0_12px_rgba(251,191,36,0.5)]',
};

const AudioVisualizer: React.FC<{ data: Uint8Array, colorClass?: string }> = ({ data, colorClass = 'bg-white' }) => {
  if (!data || data.length === 0) return null;
  const bars = Array.from(data.slice(3, 11));
  const hasSignal = bars.some((v: number) => v > 4);
  if (!hasSignal) return null;

  return (
    <div className="flex items-center gap-[1.5px] h-3 ml-2.5">
      {bars.map((val: number, i) => {
        const height = Math.max(2, (val / 255) * 14);
        return (
          <div
            key={i}
            className={`w-[1.8px] ${colorClass} rounded-full transition-all duration-100 ease-out`}
            style={{ 
              height: `${height}px`,
              opacity: 0.3 + (val / 255) * 0.7,
              boxShadow: val > 120 ? `0 0 6px ${colorClass.replace('bg-', '')}` : 'none'
            }}
          />
        );
      })}
    </div>
  );
};

const TranslatorDock: React.FC<TranslatorDockProps> = ({
  mode,
  roomState,
  selectedLanguage,
  myUserId,
  onSpeakToggle,
  onListenToggle,
  onLanguageChange,
  onRaiseHand,
  audioData,
  audioSource,
  onAudioSourceToggle,
  liveStreamText,
  translatedStreamText,
  isTtsLoading,
  emotion = 'neutral'
}) => {
  const isSomeoneElseSpeaking = roomState.activeSpeaker && roomState.activeSpeaker.userId !== myUserId;
  const isMeSpeaking = mode === 'speaking';
  const isMeListening = mode === 'listening';
  
  const [showLangs, setShowLangs] = React.useState(false);
  const myQueuePosition = roomState.raiseHandQueue.findIndex(q => q.userId === myUserId);
  const isQueued = myQueuePosition !== -1;

  const displayText = isMeListening ? translatedStreamText : liveStreamText;
  const isTranslation = isMeListening && !!translatedStreamText;

  // Language dropdown should only open if not listening
  const handleLangClick = () => {
    if (!isMeListening) {
      setShowLangs(!showLangs);
    }
  };

  return (
    <div className="flex flex-col items-center w-full max-w-4xl" onClick={(e) => e.stopPropagation()}>
      
      {/* Dynamic Subtitle Display with Emotion Synthesis */}
      <div className="h-16 w-full flex items-center justify-center mb-8 px-10">
        <div className="max-w-full overflow-hidden text-center">
          {displayText && (
            <p className={`text-2xl font-bold tracking-tight whitespace-normal break-words animate-in fade-in slide-in-from-bottom-4 duration-500 ${
              isTranslation ? emotionColors[emotion] : 'text-slate-100'
            }`}>
              {displayText}
            </p>
          )}
        </div>
      </div>

      <div className="relative flex items-stretch h-[74px] bg-[#1a2333]/95 backdrop-blur-2xl rounded-[26px] shadow-[0_25px_60px_rgba(0,0,0,0.6)] border border-slate-700/50 w-full max-w-[860px]">
        
        {/* Speak Button - Disabled if listening or someone else is speaking */}
        <div className="relative flex-1 flex items-stretch border-r border-slate-700/20">
          <button
            onClick={onSpeakToggle}
            disabled={(isSomeoneElseSpeaking && !isMeSpeaking) || isMeListening}
            className={`flex-1 flex items-center justify-center gap-3.5 px-6 rounded-l-[26px] transition-all disabled:opacity-30 ${
              isMeSpeaking ? 'bg-red-500/90 text-white animate-live-pulse' : 'hover:bg-slate-700/20 text-slate-300'
            }`}
          >
            {isMeSpeaking ? <X className="w-5 h-5" /> : (isSomeoneElseSpeaking || isMeListening ? <Lock className="w-5 h-5 opacity-40" /> : <Mic className="w-5 h-5" />)}
            <span className="font-bold text-[18px] tracking-tight">Speak</span>
            {isMeSpeaking && audioData && <AudioVisualizer data={audioData} colorClass="bg-white" />}
          </button>
        </div>

        {/* Listen Button - Gemini Live Read Aloud */}
        <button
          onClick={onListenToggle}
          disabled={isMeSpeaking}
          className={`flex-1 flex items-center justify-center gap-3.5 px-6 transition-all border-r border-slate-700/20 disabled:opacity-20 ${
            isMeListening ? 'bg-blue-600/95 text-white ring-1 ring-blue-400/40 shadow-inner' : 'hover:bg-slate-700/20 text-slate-300'
          }`}
        >
          {isTtsLoading ? <Loader2 className="w-5 h-5 animate-spin text-blue-200" /> : <Volume2 className="w-5 h-5" />}
          <span className="font-bold text-[18px] tracking-tight">{isMeListening ? 'Live Aloud' : 'Listen'}</span>
          {isMeListening && audioData && <AudioVisualizer data={audioData} colorClass="bg-blue-200" />}
        </button>

        {/* Language Selection - Locked if Listening */}
        <div className="relative flex-1 flex items-stretch border-r border-slate-700/20">
          <button
            onClick={handleLangClick}
            disabled={isMeListening}
            className={`flex-1 flex items-center gap-4.5 px-6 transition-all ${
              isMeListening ? 'cursor-not-allowed opacity-50' : 'hover:bg-slate-700/20'
            }`}
          >
            <span className="text-3xl drop-shadow-md">{selectedLanguage.flag}</span>
            <div className="flex flex-col items-start min-w-0">
              <span className="font-black text-slate-100 text-[16px] uppercase">{selectedLanguage.code.split('-')[1] || selectedLanguage.code}</span>
              <span className="text-slate-500 text-[10px] font-black uppercase tracking-wider truncate w-full text-left">{selectedLanguage.name}</span>
            </div>
            {isMeListening ? <Lock className="w-3.5 h-3.5 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-600" />}
          </button>

          {showLangs && !isMeListening && (
            <div className="absolute bottom-[calc(100%+18px)] left-1/2 -translate-x-1/2 bg-[#0f172a]/95 border border-slate-700/60 rounded-[22px] shadow-2xl p-2 w-[300px] max-h-[440px] overflow-y-auto z-[100] animate-in fade-in zoom-in-95 duration-200">
              {LANGUAGES.map(lang => (
                <button
                  key={lang.code}
                  onClick={() => { onLanguageChange(lang); setShowLangs(false); }}
                  className={`flex items-center gap-4 px-4.5 py-3 rounded-[16px] text-left w-full transition-all ${
                    selectedLanguage.code === lang.code ? 'bg-blue-600 text-white' : 'hover:bg-slate-800/80 text-slate-400'
                  }`}
                >
                  <span className="text-2xl">{lang.flag}</span>
                  <span className="text-[14px] font-bold">{lang.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Raise Hand Queue */}
        <button
          onClick={onRaiseHand}
          disabled={isMeSpeaking}
          className={`flex-1 flex items-center justify-center gap-3.5 px-6 rounded-r-[26px] transition-all disabled:opacity-20 ${
            isQueued ? 'bg-amber-600/90 text-white' : 'hover:bg-slate-700/20 text-slate-300'
          }`}
        >
          <Hand className={`w-5 h-5 ${isQueued ? 'animate-bounce' : ''}`} />
          <span className="font-bold text-[18px] tracking-tight">{isQueued ? 'Queued' : 'Queue'}</span>
        </button>
      </div>
    </div>
  );
};

export default TranslatorDock;
