'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useGeminiLive } from './useGeminiLive';
import { useRoomContext, useLocalParticipant } from '@livekit/components-react';
import { Track } from 'livekit-client';
import { RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { supabase } from './orbit/services/supabaseClient';

const overlayStyles = {
  captionBar: {
    position: 'fixed' as 'fixed',
    bottom: 80, // Position above the control bar
    left: '20px',
    right: '20px',
    width: 'auto',
    height: '50px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-start',
    padding: '0 20px',
    zIndex: 999,
  },
  transcriptText: {
    fontSize: '14px',
    color: '#66ff00',
    fontWeight: 600,
    textAlign: 'left' as 'left',
    whiteSpace: 'nowrap' as 'nowrap',
    overflow: 'visible',
    width: '100%',
    textShadow: '0px 2px 4px rgba(0,0,0,0.9)',
    animation: 'slideIn 0.3s ease-out',
  },
};

interface CinemaCaptionOverlayProps {
    onTranscriptSegment: (segment: { text: string; language: string; isFinal: boolean }) => void;
    defaultDeviceId?: string;
    isFloorHolder?: boolean;
    onClaimFloor?: () => void;
}

export function CinemaCaptionOverlay({ 
    onTranscriptSegment, 
    defaultDeviceId,
    isFloorHolder = false,
    onClaimFloor
}: CinemaCaptionOverlayProps) {
    const [displayText, setDisplayText] = useState('');
    const [isFading, setIsFading] = useState(false);
    const captionRef = useRef<HTMLDivElement>(null);
    const room = useRoomContext(); // Access room directly
    const { localParticipant } = useLocalParticipant();
    const lastMicStateRef = useRef<boolean | null>(null);
    
    // Subscribe to realtime transcriptions (FOR LISTENERS)
    useEffect(() => {
        if (!room?.name) return;

        const channel = supabase
            .channel(`transcriptions:${room.name}`)
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'transcriptions',
                filter: `meeting_id=eq.${room.name}`
            }, (payload: RealtimePostgresChangesPayload<any>) => {
                if (payload.new) {
                    const newText = payload.new.transcribe_text_segment;
                    // Only update if we are NOT the floor holder (avoid double update)
                    if (!isFloorHolder) {
                        setDisplayText(newText);
                        onTranscriptSegment({ text: newText, language: 'en', isFinal: true });
                    }
                }
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [room?.name, isFloorHolder, onTranscriptSegment]);

    const {
        isRecording,
        transcription,
        toggleRecording,
        status
    } = useGeminiLive();

    // Auto-start/stop transcription based on mic state + FLOOR CONTROL
    useEffect(() => {
        if (!localParticipant) return;

        const micPub = localParticipant.getTrackPublication(Track.Source.Microphone);
        const isMicEnabled = !micPub?.isMuted && micPub?.track !== undefined;

        // Only toggle if mic state actually changed
        if (lastMicStateRef.current !== isMicEnabled) {
            lastMicStateRef.current = isMicEnabled;
            
            // IF MIC ON + FLOOR HOLDER => START RECORDING
            if (isMicEnabled && isFloorHolder && !isRecording) {
                toggleRecording();
            } 
            // IF MIC OFF OR LOST FLOOR => STOP RECORDING
            else if ((!isMicEnabled || !isFloorHolder) && isRecording) {
                toggleRecording();
            }
        }
    }, [localParticipant, isRecording, toggleRecording, isFloorHolder]);

    // Handle Floor Loss (Dynamic Update)
    useEffect(() => {
        if (isRecording && !isFloorHolder) {
             // If we lost the floor while recording, stop immediately
             toggleRecording();
        }
    }, [isFloorHolder, isRecording, toggleRecording]);

    // Save transcription segments (FOR SPEAKER)
    useEffect(() => {
        if (transcription && isFloorHolder) { // Only save if we hold the floor
            onTranscriptSegment({ text: transcription, language: 'en', isFinal: true });
        }
    }, [transcription, onTranscriptSegment, isFloorHolder]);

    // Update display text (FOR SPEAKER)
    useEffect(() => {
        if (isFloorHolder) {
             const fullText = transcription || '';
             setDisplayText(fullText);
        }
    }, [transcription, isFloorHolder]);

    // Auto-clear logic when text overflows
    useEffect(() => {
        if (captionRef.current && displayText) {
            const element = captionRef.current;
            const isOverflowing = element.scrollWidth > element.clientWidth;
            
            if (isOverflowing) {
                setIsFading(true);
                setTimeout(() => {
                    setDisplayText('');
                    setIsFading(false);
                }, 300);
            }
        }
    }, [displayText]);

    return (
        <div style={overlayStyles.captionBar}>
            <div 
                ref={captionRef}
                style={{
                    ...overlayStyles.transcriptText,
                    opacity: isFading ? 0 : 1,
                    transition: 'opacity 0.3s ease-out'
                }}
            >
                {displayText || (isRecording && isFloorHolder && <span style={{color: '#66ff00', fontSize: '14px', fontWeight: 600}}>🎤 Listening...</span>)}
            </div>
        </div>
    );
}
