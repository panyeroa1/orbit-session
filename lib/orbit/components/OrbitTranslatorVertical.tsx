'use client';

import React from 'react';
import sharedStyles from '@/styles/Eburon.module.css';

export const OrbitIcon = ({ size = 20 }: { size?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 32 32"
    fill="none"
    aria-hidden="true"
    focusable="false"
  >
    <circle cx="16" cy="16" r="7" stroke="currentColor" strokeWidth="1.5" />
    <ellipse
      cx="16"
      cy="16"
      rx="13"
      ry="5"
      stroke="currentColor"
      strokeWidth="1.5"
      opacity="0.6"
      transform="rotate(-20 16 16)"
    />
  </svg>
);

interface OrbitTranslatorVerticalProps {
    roomCode?: string;
    userId?: string;
    onLiveTextChange?: any;
    audioDevices?: any;
    selectedDeviceId?: any;
    onDeviceIdChange?: any;
    onListeningChange?: any;
    deepgram?: any;
    meetingId?: any;
}

export function OrbitTranslatorVertical(props: OrbitTranslatorVerticalProps) {
  return (
    <div className={sharedStyles.sidebarPanel} style={{ padding: 0, overflow: 'hidden' }}>
      <iframe 
        src="/transcribe.html"
        className="w-full h-full border-0"
        allow="microphone; autoplay; clipboard-read; clipboard-write; fullscreen"
        title="Orbit Translator"
      />
    </div>
  );
}
