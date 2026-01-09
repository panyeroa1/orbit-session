import { useState, useRef, useEffect, useCallback } from 'react';
import { initializeApp } from 'firebase/app';
import { getDatabase, ref, update, serverTimestamp } from 'firebase/database';

// Firebase Config (from user request)
const firebaseConfig = {
  apiKey: "AIzaSyCZvhDqxmU74KHZxy-_cHCmTuf0PSYL85o",
  authDomain: "apartment-rental-free-p-lh81y5.firebaseapp.com",
  databaseURL: "https://apartment-rental-free-p-lh81y5-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "apartment-rental-free-p-lh81y5",
  storageBucket: "apartment-rental-free-p-lh81y5.firebasestorage.app",
  messagingSenderId: "994188454347",
  appId: "1:994188454347:web:3f9706fb5c787e66d86e4e"
};

const app = initializeApp(firebaseConfig);
const rtdb = getDatabase(app);

const DEEPGRAM_API_KEY = 'acb247d15fdeeb3f132bc7491bf35afab2965130';

export function useOrbitMic() {
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [isFinal, setIsFinal] = useState(false);
  
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);

  const updateOrbitRTDB = async (text: string, final: boolean) => {
    try {
      const orbitRef = ref(rtdb, 'orbit/live_state');
      await update(orbitRef, {
        transcript: text,
        is_final: final,
        updatedAt: serverTimestamp(),
        brand: "Orbit"
      });
    } catch (e) {
      console.error("Orbit Update Failed", e);
    }
  };

  const start = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } 
      });
      streamRef.current = stream;

      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      audioContextRef.current = audioContext;
      
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 128;
      source.connect(analyser);
      analyserRef.current = analyser;

      const url = 'wss://api.deepgram.com/v1/listen?model=nova-3&language=multi&smart_format=true&interim_results=true&background_noise_suppression=true&vad_events=true';
      const socket = new WebSocket(url, ['token', DEEPGRAM_API_KEY]);
      socketRef.current = socket;

      socket.onopen = () => {
        const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4';
        const mediaRecorder = new MediaRecorder(stream, { mimeType });
        mediaRecorderRef.current = mediaRecorder;
        
        mediaRecorder.ondataavailable = (e) => {
          if (e.data.size > 0 && socket.readyState === 1) {
            socket.send(e.data);
          }
        };
        mediaRecorder.start(250);
        
        setIsRecording(true);
      };

      socket.onmessage = (msg) => {
        try {
            const data = JSON.parse(msg.data);
            const alt = data.channel?.alternatives?.[0];
            const text = alt?.transcript;
            
            if (text) {
              setTranscript(text);
              setIsFinal(data.is_final);
              updateOrbitRTDB(text, data.is_final);
            }
        } catch (err) {
            console.error("Deepgram parse error", err);
        }
      };

      socket.onclose = stop;
      socket.onerror = stop;

    } catch (e) {
      console.error("Orbit Mic Start Failed", e);
      stop();
    }
  }, []);

  const stop = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
    }
    if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
    }
    if (socketRef.current) {
        socketRef.current.close();
    }
    if (audioContextRef.current) {
        audioContextRef.current.close();
    }

    setIsRecording(false);
    setTranscript('');
    streamRef.current = null;
    socketRef.current = null;
    mediaRecorderRef.current = null;
    audioContextRef.current = null;
    analyserRef.current = null;
  }, []);

  const toggle = useCallback(() => {
    if (isRecording) {
        stop();
    } else {
        start();
    }
  }, [isRecording, start, stop]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
        if (isRecording) stop();
    };
  }, []);

  return {
    isRecording,
    transcript,
    isFinal,
    toggle,
    analyser: analyserRef.current
  };
}
