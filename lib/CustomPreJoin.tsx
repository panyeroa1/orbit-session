'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import styles from '@/styles/PreJoin.module.css';

interface DeviceInfo {
  deviceId: string;
  label: string;
}

interface CustomPreJoinProps {
  roomName: string;
  onSubmit: (choices: {
    username: string;
    videoEnabled: boolean;
    audioEnabled: boolean;
    videoDeviceId: string;
    audioDeviceId: string;
    audioOutputDeviceId: string;
  }) => void;
  onError?: (error: Error) => void;
  defaults?: {
    username?: string;
    videoEnabled?: boolean;
    audioEnabled?: boolean;
    videoDeviceId?: string;
    audioDeviceId?: string;
    audioOutputDeviceId?: string;
  };
}

const MicIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
    <line x1="12" x2="12" y1="19" y2="22" />
  </svg>
);

const MicOffIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="2" x2="22" y1="2" y2="22" />
    <path d="M18.89 13.23A7.12 7.12 0 0 0 19 12v-2" />
    <path d="M5 10v2a7 7 0 0 0 12 5" />
    <path d="M15 9.34V5a3 3 0 0 0-5.68-1.33" />
    <path d="M9 9v3a3 3 0 0 0 5.12 2.12" />
    <line x1="12" x2="12" y1="19" y2="22" />
  </svg>
);

const VideoIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m22 8-6 4 6 4V8Z" />
    <rect width="14" height="12" x="2" y="6" rx="2" ry="2" />
  </svg>
);

const VideoOffIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10.66 6H14a2 2 0 0 1 2 2v2.34l1 1L22 8v8" />
    <path d="M16 16a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h2l10 10Z" />
    <line x1="2" x2="22" y1="2" y2="22" />
  </svg>
);

const SpeakerIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
    <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
    <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
  </svg>
);

export function CustomPreJoin({ roomName, onSubmit, onError, defaults }: CustomPreJoinProps) {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [username, setUsername] = useState(defaults?.username || '');
  const [videoEnabled, setVideoEnabled] = useState(defaults?.videoEnabled ?? true);
  const [audioEnabled, setAudioEnabled] = useState(defaults?.audioEnabled ?? true);

  const [audioInputDevices, setAudioInputDevices] = useState<DeviceInfo[]>([]);
  const [audioOutputDevices, setAudioOutputDevices] = useState<DeviceInfo[]>([]);
  const [videoDevices, setVideoDevices] = useState<DeviceInfo[]>([]);

  const [selectedAudioInput, setSelectedAudioInput] = useState(defaults?.audioDeviceId || '');
  const [selectedAudioOutput, setSelectedAudioOutput] = useState(defaults?.audioOutputDeviceId || '');
  const [selectedVideo, setSelectedVideo] = useState(defaults?.videoDeviceId || '');

  const [isLoading, setIsLoading] = useState(false);

  // Enumerate devices
  const enumerateDevices = useCallback(async () => {
    try {
      // Request permissions first
      await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
      
      const devices = await navigator.mediaDevices.enumerateDevices();
      
      const audioInputs = devices
        .filter(d => d.kind === 'audioinput')
        .map(d => ({ deviceId: d.deviceId, label: d.label || `Microphone ${d.deviceId.slice(0, 4)}` }));
      
      const audioOutputs = devices
        .filter(d => d.kind === 'audiooutput')
        .map(d => ({ deviceId: d.deviceId, label: d.label || `Speaker ${d.deviceId.slice(0, 4)}` }));
      
      const videoInputs = devices
        .filter(d => d.kind === 'videoinput')
        .map(d => ({ deviceId: d.deviceId, label: d.label || `Camera ${d.deviceId.slice(0, 4)}` }));

      setAudioInputDevices(audioInputs);
      setAudioOutputDevices(audioOutputs);
      setVideoDevices(videoInputs);

      // Set defaults if not already set
      if (!selectedAudioInput && audioInputs.length > 0) {
        setSelectedAudioInput(audioInputs[0].deviceId);
      }
      if (!selectedAudioOutput && audioOutputs.length > 0) {
        setSelectedAudioOutput(audioOutputs[0].deviceId);
      }
      if (!selectedVideo && videoInputs.length > 0) {
        setSelectedVideo(videoInputs[0].deviceId);
      }
    } catch (err) {
      console.error('Error enumerating devices:', err);
      onError?.(err as Error);
    }
  }, [selectedAudioInput, selectedAudioOutput, selectedVideo, onError]);

  // Start video preview
  const startVideoPreview = useCallback(async () => {
    if (!videoEnabled) {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
        streamRef.current = null;
      }
      return;
    }

    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: selectedVideo ? { deviceId: { exact: selectedVideo } } : true,
        audio: false,
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      console.error('Error starting video preview:', err);
    }
  }, [videoEnabled, selectedVideo]);

  useEffect(() => {
    enumerateDevices();
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
      }
    };
  }, [enumerateDevices]);

  useEffect(() => {
    startVideoPreview();
  }, [startVideoPreview]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) return;

    setIsLoading(true);
    
    // Stop preview stream before joining
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }

    onSubmit({
      username: username.trim(),
      videoEnabled,
      audioEnabled,
      videoDeviceId: selectedVideo,
      audioDeviceId: selectedAudioInput,
      audioOutputDeviceId: selectedAudioOutput,
    });
  };

  return (
    <div className={styles.preJoinPage}>
      <form className={styles.preJoinContainer} onSubmit={handleSubmit}>
        <div className={styles.preJoinHeader}>
          <h1 className={styles.preJoinTitle}>
            ORBIT <span>CONFERENCE</span>
          </h1>
          <p className={styles.preJoinSubtitle}>Room: {roomName}</p>
        </div>

        {/* Video Preview */}
        <div className={styles.videoPreviewCard}>
          {videoEnabled ? (
            <video
              ref={videoRef}
              className={styles.videoPreview}
              autoPlay
              playsInline
              muted
            />
          ) : (
            <div className={styles.videoPlaceholder}>📷</div>
          )}
          
          <div className={styles.videoControls}>
            <button
              type="button"
              className={`${styles.mediaButton} ${audioEnabled ? styles.mediaButtonActive : styles.mediaButtonMuted}`}
              onClick={() => setAudioEnabled(!audioEnabled)}
              title={audioEnabled ? 'Mute microphone' : 'Unmute microphone'}
            >
              {audioEnabled ? <MicIcon /> : <MicOffIcon />}
            </button>
            <button
              type="button"
              className={`${styles.mediaButton} ${videoEnabled ? styles.mediaButtonActive : styles.mediaButtonMuted}`}
              onClick={() => setVideoEnabled(!videoEnabled)}
              title={videoEnabled ? 'Turn off camera' : 'Turn on camera'}
            >
              {videoEnabled ? <VideoIcon /> : <VideoOffIcon />}
            </button>
          </div>
        </div>

        {/* Device Selection */}
        <div className={styles.deviceSection}>
          <div className={styles.deviceGrid}>
            <div className={styles.deviceRow}>
              <label className={styles.deviceLabel}>🎤 Microphone</label>
              <select
                className={styles.deviceSelect}
                value={selectedAudioInput}
                onChange={(e) => setSelectedAudioInput(e.target.value)}
              >
                {audioInputDevices.map((device) => (
                  <option key={device.deviceId} value={device.deviceId}>
                    {device.label}
                  </option>
                ))}
              </select>
            </div>

            <div className={styles.deviceRow}>
              <label className={styles.deviceLabel}>🔊 Speaker</label>
              <select
                className={styles.deviceSelect}
                value={selectedAudioOutput}
                onChange={(e) => setSelectedAudioOutput(e.target.value)}
              >
                {audioOutputDevices.map((device) => (
                  <option key={device.deviceId} value={device.deviceId}>
                    {device.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className={styles.deviceRow}>
            <label className={styles.deviceLabel}>📹 Camera</label>
            <select
              className={styles.deviceSelect}
              value={selectedVideo}
              onChange={(e) => setSelectedVideo(e.target.value)}
            >
              {videoDevices.map((device) => (
                <option key={device.deviceId} value={device.deviceId}>
                  {device.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Username Input */}
        <div className={styles.usernameSection}>
          <input
            type="text"
            className={styles.usernameInput}
            placeholder="Enter your name"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />
        </div>

        {/* Join Button */}
        <button
          type="submit"
          className={styles.joinButton}
          disabled={isLoading || !username.trim()}
        >
          {isLoading ? 'Connecting...' : 'Join Room'}
        </button>

        <Link href="/" className={styles.backLink}>
          ← Back to Lobby
        </Link>
      </form>
    </div>
  );
}

export default CustomPreJoin;
