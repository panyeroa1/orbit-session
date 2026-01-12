'use client';

import React from 'react';
import { decodePassphrase } from '@/lib/client-utils';
import { DebugMode } from '@/lib/Debug';
import { KeyboardShortcuts } from '@/lib/KeyboardShortcuts';
import toast from 'react-hot-toast';
import { supabase } from '@/lib/orbit/services/supabaseClient';
import { useAuth } from '@/components/AuthProvider';
import { RecordingIndicator } from '@/lib/RecordingIndicator';
import { ConnectionDetails } from '@/lib/types';
import { EburonControlBar } from '@/lib/EburonControlBar';
import { subscribeToRoom, tryAcquireSpeaker, releaseSpeaker } from '@/lib/orbit/services/roomStateService';
import { RoomState } from '@/lib/orbit/types';


import { ChatPanel } from '@/lib/ChatPanel';
import { ParticipantsPanel } from '@/lib/ParticipantsPanel';
import { OrbitTranslatorVertical } from '@/lib/orbit/components/OrbitTranslatorVertical';
import { LiveCaptions } from '@/lib/LiveCaptions';
import { CustomPreJoin } from '@/lib/CustomPreJoin';
import { useDeepgramLive } from '@/lib/orbit/hooks/useDeepgramLive';
import { ensureRoomState } from '@/lib/orbit/services/orbitService';


import { HostCaptionOverlay } from '@/lib/orbit/components/HostCaptionOverlay';
import { CinemaCaptionOverlay } from '@/lib/CinemaCaptionOverlay';

import roomStyles from '@/styles/Eburon.module.css';



import {
  LocalUserChoices,
  RoomContext,
  LayoutContextProvider,
  GridLayout,
  FocusLayout,
  FocusLayoutContainer,
  ParticipantTile,
  useTracks,
  useCreateLayoutContext,
  useLayoutContext,
  usePinnedTracks,
  usePersistentUserChoices,
  isTrackReference,
  RoomAudioRenderer,
  ConnectionStateToast,
} from '@livekit/components-react';
import { useMeetingFloor } from '@/lib/useMeetingFloor';
import { useRoomContext, useLocalParticipant, useRemoteParticipants } from '@livekit/components-react';
import {
  ExternalE2EEKeyProvider,
  RoomOptions,
  VideoCodec,
  VideoPresets,
  Room,
  DeviceUnsupportedError,
  RoomConnectOptions,
  RoomEvent,
  TrackPublishDefaults,
  VideoCaptureOptions,
  AudioCaptureOptions,
  ConnectionState,
  Track,
} from 'livekit-client';
import { useRouter, useParams } from 'next/navigation';
import { useSetupE2EE } from '@/lib/useSetupE2EE';
import { useLowCPUOptimizer } from '@/lib/usePerfomanceOptimiser';

const CONN_DETAILS_ENDPOINT =
  process.env.NEXT_PUBLIC_CONN_DETAILS_ENDPOINT ?? '/api/connection-details';

// Icons
import { useOrbitMic } from '@/lib/orbit/hooks/useOrbitMic';

const MicIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="20" height="20">
    <polyline points="9 18 15 12 9 6" />
  </svg>
);

const ChevronRightIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="20" height="20">
    <polyline points="9 18 15 12 9 6" />
  </svg>
);

const ChevronLeftIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="20" height="20">
    <polyline points="15 18 9 12 15 6" />
  </svg>
);

type SidebarPanel = 'participants' | 'chat' | 'settings' | 'orbit';

function VideoGrid({ allowedParticipantIds, isGridView }: { allowedParticipantIds: Set<string>, isGridView: boolean }) {
  const layoutContext = useLayoutContext();
  const tracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: false },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { onlySubscribed: false },
  );
  const focusTrack = usePinnedTracks(layoutContext)?.[0];
  const focusTrackRef = focusTrack && isTrackReference(focusTrack) ? focusTrack : undefined;
  const focusTrackSid = focusTrackRef?.publication?.trackSid;
  const autoPinnedSidRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    const dispatch = layoutContext?.pin?.dispatch;
    if (!dispatch) {
      return;
    }

    const screenShareTracks = tracks
      .filter(isTrackReference)
      .filter((track) => track.source === Track.Source.ScreenShare && track.publication?.isSubscribed);
    const currentPinnedSid = focusTrackRef?.publication?.trackSid ?? null;
    const hasManualPin = currentPinnedSid && currentPinnedSid !== autoPinnedSidRef.current;

    if (hasManualPin) {
      autoPinnedSidRef.current = null;
      return;
    }

    if (!currentPinnedSid && screenShareTracks.length > 0) {
      const target = screenShareTracks[0];
      autoPinnedSidRef.current = target.publication.trackSid ?? null;
      dispatch({ msg: 'set_pin', trackReference: target });
      return;
    }

    if (autoPinnedSidRef.current) {
      const stillExists = screenShareTracks.some(
        (track) => track.publication.trackSid === autoPinnedSidRef.current,
      );
      if (!stillExists) {
        dispatch({ msg: 'clear_pin' });
        autoPinnedSidRef.current = null;
      }
    }
  }, [layoutContext, tracks, focusTrackRef]);

  // Filter to only show local participant camera and any screen shares
  // Remote participants are shown in the Trainor sidebar only
  const filteredTracks = tracks.filter((track) => {
    // Always show screen shares
    if (track.source === Track.Source.ScreenShare) {
      return true;
    }
    // Only show local participant's camera in the grid
    if (track.participant?.isLocal) {
      return true;
    }
    // If it's a allowed participant
    if (track.participant && allowedParticipantIds.has(track.participant.identity)) {
      return true;
    }
    // If Grid view is enabled, show all participants
    if (isGridView && track.participant) {
      return true;
    }
    if (focusTrackSid && isTrackReference(track) && track.publication.trackSid === focusTrackSid) {
      return true;
    }
    return false;
  });

  const focusIsInGrid =
    !!focusTrackRef &&
    filteredTracks.some(
      (track) => isTrackReference(track) && track.publication.trackSid === focusTrackRef.publication?.trackSid,
    );
  const activeFocusTrack = focusIsInGrid ? focusTrackRef : undefined;

  // If no tracks to show, display a placeholder
  if (filteredTracks.length === 0) {
    return (
      <div className={roomStyles.videoPlaceholder}>
        Your camera will appear here
      </div>
    );
  }

  return (!activeFocusTrack || isGridView) ? (
    <GridLayout tracks={filteredTracks} style={{ height: '100%' }}>
      <ParticipantTile />
    </GridLayout>
  ) : (
    <FocusLayoutContainer className={roomStyles.focusLayoutContainer}>
      <FocusLayout trackRef={activeFocusTrack} />
    </FocusLayoutContainer>
  );
}

function SettingsPanel({
  voiceFocusEnabled,
  onVoiceFocusChange,
  vadEnabled,
  onVadChange,
  noiseSuppressionEnabled,
  onNoiseSuppressionChange,
  echoCancellationEnabled,
  onEchoCancellationChange,
  autoGainEnabled,
  onAutoGainChange,
}: {
  voiceFocusEnabled: boolean;
  onVoiceFocusChange: (enabled: boolean) => void;
  vadEnabled: boolean;
  onVadChange: (enabled: boolean) => void;
  noiseSuppressionEnabled: boolean;
  onNoiseSuppressionChange: (enabled: boolean) => void;
  echoCancellationEnabled: boolean;
  onEchoCancellationChange: (enabled: boolean) => void;
  autoGainEnabled: boolean;
  onAutoGainChange: (enabled: boolean) => void;
}) {
  return (
    <div className={roomStyles.sidebarPanel}>
      <div className={roomStyles.sidebarHeader}>
        <div className={roomStyles.sidebarHeaderText}>
          <h3>Audio Settings</h3>
          <span className={roomStyles.sidebarHeaderMeta}>Configure audio processing</span>
        </div>
      </div>
      <div className={roomStyles.sidebarBody}>
        <div className={roomStyles.sidebarCard}>
          <div className={roomStyles.sidebarCardText}>
            <span className={roomStyles.sidebarCardLabel}>Voice Focus</span>
            <span className={roomStyles.sidebarCardHint}>Isolate your voice from background noise.</span>
          </div>
          <label className={roomStyles.sidebarSwitch}>
            <input
              type="checkbox"
              checked={voiceFocusEnabled}
              onChange={(e) => onVoiceFocusChange(e.target.checked)}
              aria-label="Voice Focus"
            />
            <span className={roomStyles.sidebarSwitchTrack}>
              <span className={roomStyles.sidebarSwitchThumb} />
            </span>
          </label>
        </div>

        <div className={roomStyles.sidebarCard}>
          <div className={roomStyles.sidebarCardText}>
            <span className={roomStyles.sidebarCardLabel}>Voice Detection</span>
            <span className={roomStyles.sidebarCardHint}>Auto-mute when not speaking.</span>
          </div>
          <label className={roomStyles.sidebarSwitch}>
            <input
              type="checkbox"
              checked={vadEnabled}
              onChange={(e) => onVadChange(e.target.checked)}
              aria-label="Voice Activity Detection"
            />
            <span className={roomStyles.sidebarSwitchTrack}>
              <span className={roomStyles.sidebarSwitchThumb} />
            </span>
          </label>
        </div>

        <div className={roomStyles.sidebarCard}>
          <div className={roomStyles.sidebarCardText}>
            <span className={roomStyles.sidebarCardLabel}>Noise Suppression</span>
            <span className={roomStyles.sidebarCardHint}>Reduce background noise.</span>
          </div>
          <label className={roomStyles.sidebarSwitch}>
            <input
              type="checkbox"
              checked={noiseSuppressionEnabled}
              onChange={(e) => onNoiseSuppressionChange(e.target.checked)}
              aria-label="Noise Suppression"
            />
            <span className={roomStyles.sidebarSwitchTrack}>
              <span className={roomStyles.sidebarSwitchThumb} />
            </span>
          </label>
        </div>

        <div className={roomStyles.sidebarCard}>
          <div className={roomStyles.sidebarCardText}>
            <span className={roomStyles.sidebarCardLabel}>Echo Cancellation</span>
            <span className={roomStyles.sidebarCardHint}>Prevent audio feedback.</span>
          </div>
          <label className={roomStyles.sidebarSwitch}>
            <input
              type="checkbox"
              checked={echoCancellationEnabled}
              onChange={(e) => onEchoCancellationChange(e.target.checked)}
              aria-label="Echo Cancellation"
            />
            <span className={roomStyles.sidebarSwitchTrack}>
              <span className={roomStyles.sidebarSwitchThumb} />
            </span>
          </label>
        </div>

        <div className={roomStyles.sidebarCard}>
          <div className={roomStyles.sidebarCardText}>
            <span className={roomStyles.sidebarCardLabel}>Auto Gain Control</span>
            <span className={roomStyles.sidebarCardHint}>Auto-adjust microphone volume.</span>
          </div>
          <label className={roomStyles.sidebarSwitch}>
            <input
              type="checkbox"
              checked={autoGainEnabled}
              onChange={(e) => onAutoGainChange(e.target.checked)}
              aria-label="Auto Gain Control"
            />
            <span className={roomStyles.sidebarSwitchTrack}>
              <span className={roomStyles.sidebarSwitchThumb} />
            </span>
          </label>
        </div>
      </div>
    </div>
  );
}

export function PageClientImpl(props: {
  roomName: string;
  region?: string;
  hq: boolean;
  codec: VideoCodec;
}) {
  const [connectionDetails, setConnectionDetails] = React.useState<ConnectionDetails>();
  const [preJoinChoices, setPreJoinChoices] = React.useState<LocalUserChoices>();
  const [isLoading, setIsLoading] = React.useState(false);

  const {
    userChoices,
    saveAudioInputEnabled,
    saveVideoInputEnabled,
    saveAudioInputDeviceId,
    saveVideoInputDeviceId,
    saveUsername,
  } = usePersistentUserChoices();

  const preJoinDefaults = React.useMemo(
    () => ({
      audioEnabled: userChoices.audioEnabled,
      videoEnabled: userChoices.videoEnabled,
      audioDeviceId: userChoices.audioDeviceId,
      videoDeviceId: userChoices.videoDeviceId,
      username: userChoices.username,
    }),
    [userChoices],
  );

  const handlePreJoinSubmit = React.useCallback(
    (values: LocalUserChoices) => {
      saveAudioInputEnabled(values.audioEnabled);
      saveVideoInputEnabled(values.videoEnabled);
      saveAudioInputDeviceId(values.audioDeviceId);
      saveVideoInputDeviceId(values.videoDeviceId);
      saveUsername(values.username);
      if (typeof window !== 'undefined') {
        sessionStorage.setItem(`lk_autojoin_${props.roomName}`, 'true');
      }
      setPreJoinChoices(values);
    },
    [
      props.roomName,
      saveAudioInputEnabled,
      saveAudioInputDeviceId,
      saveVideoInputEnabled,
      saveVideoInputDeviceId,
      saveUsername,
    ],
  );

  const handlePreJoinError = React.useCallback((error: unknown) => {
    console.error('Pre-join error', error);
  }, []);

  // Auto-join persistence
  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    const shouldAutoJoin = sessionStorage.getItem(`lk_autojoin_${props.roomName}`);
    if (shouldAutoJoin === 'true' && userChoices.username) {
       // If we have persistent choices and the flag, skip prejoin
       // We use the persistent choices loaded from usePersistentUserChoices
       setPreJoinChoices({
         username: userChoices.username,
         videoEnabled: userChoices.videoEnabled ?? true,
         audioEnabled: userChoices.audioEnabled ?? true,
         videoDeviceId: userChoices.videoDeviceId ?? 'default',
         audioDeviceId: userChoices.audioDeviceId ?? 'default',
       });
    }
  }, [props.roomName, userChoices]);


  React.useEffect(() => {
    if (!preJoinChoices) {
      return;
    }
    let isMounted = true;
    const loadConnectionDetails = async () => {
      setIsLoading(true);
      try {
        const params = new URLSearchParams({
          roomName: props.roomName,
          participantName: preJoinChoices.username || 'Guest',
        });
        if (props.region) {
          params.set('region', props.region);
        }
        const response = await fetch(`${CONN_DETAILS_ENDPOINT}?${params.toString()}`);
        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(errorText || 'Failed to fetch connection details');
        }
        const data = (await response.json()) as ConnectionDetails;
        if (isMounted) {
          setConnectionDetails(data);
        }
      } catch (error) {
        console.error('Connection details error', error);
        if (isMounted) {
          setConnectionDetails(undefined);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };
    loadConnectionDetails();
    return () => {
      isMounted = false;
    };
  }, [preJoinChoices, props.roomName, props.region]);

  if (isLoading) {
    return <div className={roomStyles.videoPlaceholder}>Loading...</div>;
  }

  return (
    <main data-lk-theme="default" className="lk-room-container">
      {connectionDetails === undefined || preJoinChoices === undefined ? (
        <CustomPreJoin
          roomName={props.roomName}
          defaults={{
            username: preJoinDefaults.username,
            videoEnabled: preJoinDefaults.videoEnabled,
            audioEnabled: preJoinDefaults.audioEnabled,
            videoDeviceId: preJoinDefaults.videoDeviceId,
            audioDeviceId: preJoinDefaults.audioDeviceId,
          }}
          onSubmit={(choices) => {
            handlePreJoinSubmit({
              username: choices.username,
              videoEnabled: choices.videoEnabled,
              audioEnabled: choices.audioEnabled,
              videoDeviceId: choices.videoDeviceId,
              audioDeviceId: choices.audioDeviceId,
            });
          }}
          onError={handlePreJoinError}
        />
      ) : (
        <VideoConferenceComponent
          connectionDetails={connectionDetails}
          userChoices={preJoinChoices}
          options={{ codec: props.codec, hq: props.hq }}
          onDeviceChange={(kind, deviceId) => {
            const newChoices = { ...preJoinChoices };
            if (kind === 'audioinput') {
              newChoices.audioDeviceId = deviceId;
              saveAudioInputDeviceId(deviceId);
            } else if (kind === 'videoinput') {
              newChoices.videoDeviceId = deviceId;
              saveVideoInputDeviceId(deviceId);
            }
            setPreJoinChoices(newChoices);
          }}
        />
      )}
    </main>
  );
}

function VideoConferenceComponent(props: {
  userChoices: LocalUserChoices;
  connectionDetails: ConnectionDetails;
  options: {
    hq: boolean;
    codec: VideoCodec;
  };
  onDeviceChange?: (kind: MediaDeviceKind, deviceId: string) => void;
}) {
  const keyProvider = React.useMemo(() => new ExternalE2EEKeyProvider(), []);
  const { worker, e2eePassphrase } = useSetupE2EE();
  const e2eeEnabled = !!(e2eePassphrase && worker);

  const { roomName } = useParams<{ roomName: string }>();
  const [e2eeSetupComplete, setE2eeSetupComplete] = React.useState(false);
  const [activeSidebarPanel, setActiveSidebarPanel] = React.useState<SidebarPanel>('participants');
  const [sidebarCollapsed, setSidebarCollapsed] = React.useState(false);
  const [voiceFocusEnabled, setVoiceFocusEnabled] = React.useState(true);
  const [isGridView, setIsGridView] = React.useState(false);
  const [vadEnabled, setVadEnabled] = React.useState(true);
  const [noiseSuppressionEnabled, setNoiseSuppressionEnabled] = React.useState(true);
  const [echoCancellationEnabled, setEchoCancellationEnabled] = React.useState(true);
  const [autoGainEnabled, setAutoGainEnabled] = React.useState(true);
  const [waitingRoomEnabled, setWaitingRoomEnabled] = React.useState(false);
  const [waitingList, setWaitingList] = React.useState<{ identity: string; name: string }[]>([]);
  const [admittedIds, setAdmittedIds] = React.useState<Set<string>>(new Set());
  const { user } = useAuth();
  const [isAppMuted, setIsAppMuted] = React.useState(false);
  const [isOrbSettingsOpen, setIsOrbSettingsOpen] = React.useState(false);
  const [orbPosition, setOrbPosition] = React.useState<{ x: number; y: number } | null>(null);
  const [isOrbDragging, setIsOrbDragging] = React.useState(false);
  const orbRef = React.useRef<HTMLDivElement | null>(null);
  const orbBarIndices = React.useMemo(() => Array.from({ length: 6 }, (_, i) => i), []);
  const orbStyle: React.CSSProperties | undefined = orbPosition
    ? { left: orbPosition.x, top: orbPosition.y, right: 'auto', bottom: 'auto' }
    : undefined;

  const { activeSpeakerId: floorSpeakerId, isFloorHolder, claimFloor, grantFloor } = useMeetingFloor(roomName, user?.id || '');

  const [isTranscriptionEnabled, setIsTranscriptionEnabled] = React.useState(true);
  const [targetLanguage, setTargetLanguage] = React.useState('West Flemish (Belgium)'); // New State
  const [roomState, setRoomState] = React.useState<RoomState>({ activeSpeaker: null, raiseHandQueue: [], lockVersion: 0 });
  const [roomId, setRoomId] = React.useState<string | null>(null);

  // Elevated Deepgram STT State
  const deepgram = useDeepgramLive({ model: 'nova-2', language: 'multi' });

  // Transcription State (Client-Side)
  // This lives alongside the "LiveCaptions" component which handles room-wide broadcasted captions.
  // This specific sidebar is for the "Streaming/Local" transcription (Deepgram/Gemini) requested by user.






  React.useEffect(() => {
    if (!roomName) return;
    const unsub = subscribeToRoom(roomName, (state) => {
      setRoomState(state);
    });
    
    // Resolve Room UUID for DB binding
    ensureRoomState(roomName).then(id => {
      if (id) setRoomId(id);
    });

    return unsub;
  }, [roomName]);

  // Auto-release speaker lock on unmount or page leave
  React.useEffect(() => {
    const handleUnload = () => {
      if (isTranscriptionEnabled && roomName && user?.id) {
        // Use a synchronous-like fetch if possible, or just rely on the fact that 
        // releaseSpeaker is called. Note: cleanup is async but browser might kill it.
        releaseSpeaker(roomName, user.id);
      }
    };

    window.addEventListener('beforeunload', handleUnload);
    return () => {
      window.removeEventListener('beforeunload', handleUnload);
      handleUnload();
    };
  }, [isTranscriptionEnabled, roomName, user?.id]);

  const layoutContext = useCreateLayoutContext();

  // Sync roomName to session storage for OrbitApp integration
  React.useEffect(() => {
    if (roomName) {
      sessionStorage.setItem('eburon_meeting_id', roomName);
    }
  }, [roomName]);

  React.useEffect(() => {
    if (!isOrbSettingsOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOrbSettingsOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOrbSettingsOpen]);

  React.useEffect(() => {
    const orb = orbRef.current;
    if (!orb) return;

    let dragging = false;
    let startX = 0;
    let startY = 0;
    let startLeft = 0;
    let startTop = 0;
    const margin = 12;

    const clampPosition = (x: number, y: number) => {
      const rect = orb.getBoundingClientRect();
      const size = rect.width || 86;
      const maxX = Math.max(margin, window.innerWidth - size - margin);
      const maxY = Math.max(margin, window.innerHeight - size - margin);
      return {
        x: Math.min(Math.max(margin, x), maxX),
        y: Math.min(Math.max(margin, y), maxY),
      };
    };

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest('[data-orb-settings="true"]')) return;
      const rect = orb.getBoundingClientRect();
      startLeft = rect.left;
      startTop = rect.top;
      startX = event.clientX;
      startY = event.clientY;
      dragging = true;
      setIsOrbDragging(true);
      orb.setPointerCapture(event.pointerId);
      setOrbPosition(clampPosition(rect.left, rect.top));
    };

    const onPointerMove = (event: PointerEvent) => {
      if (!dragging) return;
      const dx = event.clientX - startX;
      const dy = event.clientY - startY;
      const next = clampPosition(startLeft + dx, startTop + dy);
      setOrbPosition(next);
    };

    const endDrag = (event: PointerEvent) => {
      if (!dragging) return;
      dragging = false;
      setIsOrbDragging(false);
      try {
        orb.releasePointerCapture(event.pointerId);
      } catch (_) {}
    };

    orb.addEventListener('pointerdown', onPointerDown);
    orb.addEventListener('pointermove', onPointerMove);
    orb.addEventListener('pointerup', endDrag);
    orb.addEventListener('pointercancel', endDrag);

    return () => {
      orb.removeEventListener('pointerdown', onPointerDown);
      orb.removeEventListener('pointermove', onPointerMove);
      orb.removeEventListener('pointerup', endDrag);
      orb.removeEventListener('pointercancel', endDrag);
    };
  }, []);

  React.useEffect(() => {
    if (!orbPosition) return;
    const orb = orbRef.current;
    if (!orb) return;
    const margin = 12;
    const onResize = () => {
      setOrbPosition((prev) => {
        if (!prev) return prev;
        const rect = orb.getBoundingClientRect();
        const size = rect.width || 86;
        const maxX = Math.max(margin, window.innerWidth - size - margin);
        const maxY = Math.max(margin, window.innerHeight - size - margin);
        return {
          x: Math.min(Math.max(margin, prev.x), maxX),
          y: Math.min(Math.max(margin, prev.y), maxY),
        };
      });
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [orbPosition]);

  const playJoinSound = React.useCallback(() => {
    try {
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.08, ctx.currentTime + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.3);
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.32);
      setTimeout(() => ctx.close(), 500);
    } catch (error) {
      console.warn('Join sound failed', error);
    }
  }, []);

  const roomOptions = React.useMemo((): RoomOptions => {
    let videoCodec: VideoCodec | undefined = props.options.codec ? props.options.codec : 'vp9';
    if (e2eeEnabled && (videoCodec === 'av1' || videoCodec === 'vp9')) {
      videoCodec = undefined;
    }
    const videoCaptureDefaults: VideoCaptureOptions = {
      deviceId: props.userChoices.videoDeviceId ?? undefined,
      resolution: props.options.hq ? VideoPresets.h2160 : VideoPresets.h720,
    };
    const publishDefaults: TrackPublishDefaults = {
      dtx: false,
      videoSimulcastLayers: props.options.hq
        ? [VideoPresets.h1080, VideoPresets.h720]
        : [VideoPresets.h540, VideoPresets.h216],
      red: !e2eeEnabled,
      videoCodec,
    };
    return {
      videoCaptureDefaults: videoCaptureDefaults,
      publishDefaults: publishDefaults,
      audioCaptureDefaults: {
        deviceId: props.userChoices.audioDeviceId ?? undefined,
      },
      adaptiveStream: true,
      dynacast: true,
      e2ee: keyProvider && worker && e2eeEnabled ? { keyProvider, worker } : undefined,
      singlePeerConnection: true,
    };
  }, [e2eeEnabled, keyProvider, worker, props.userChoices, props.options.hq, props.options.codec]);

  const room = React.useMemo(() => new Room(roomOptions), [roomOptions]);
  const audioCaptureOptions = React.useMemo<AudioCaptureOptions>(() => {
    const activeDeviceId = room.getActiveDevice('audioinput') ?? props.userChoices.audioDeviceId ?? undefined;
    return {
      deviceId: activeDeviceId,
      channelCount: 1,
      sampleRate: 48000,
      autoGainControl: autoGainEnabled,
      echoCancellation: echoCancellationEnabled,
      noiseSuppression: noiseSuppressionEnabled,
      voiceIsolation: voiceFocusEnabled ? true : undefined,
    };
  }, [
    room,
    props.userChoices.audioDeviceId,
    autoGainEnabled,
    echoCancellationEnabled,
    noiseSuppressionEnabled,
    voiceFocusEnabled,
  ]);

  React.useEffect(() => {
    if (e2eeEnabled) {
      keyProvider
        .setKey(decodePassphrase(e2eePassphrase))
        .then(() => {
          room.setE2EEEnabled(true).catch((e) => {
            if (e instanceof DeviceUnsupportedError) {
              alert(
                `You're trying to join an encrypted meeting, but your browser does not support it. Please update it to the latest version and try again.`,
              );
              console.error(e);
            } else {
              throw e;
            }
          });
        })
        .then(() => setE2eeSetupComplete(true));
    } else {
      setE2eeSetupComplete(true);
    }
  }, [e2eeEnabled, room, e2eePassphrase, keyProvider]);

  const connectOptions = React.useMemo((): RoomConnectOptions => {
    return {
      autoSubscribe: true,
    };
  }, []);

  const router = useRouter();
  const handleOnLeave = React.useCallback(() => {
    sessionStorage.removeItem('lk_session_storage');
    router.push('/');
  }, [router]);
  const handleError = React.useCallback((error: Error) => {
    console.error(error);
    alert(`Encountered an unexpected error, check the console logs for details: ${error.message}`);
  }, []);
  const handleEncryptionError = React.useCallback((error: Error) => {
    console.error(error);
    alert(
      `Encountered an unexpected encryption error, check the console logs for details: ${error.message}`,
    );
  }, []);

  React.useEffect(() => {
    room.on(RoomEvent.Disconnected, handleOnLeave);
    room.on(RoomEvent.EncryptionError, handleEncryptionError);
    room.on(RoomEvent.MediaDevicesError, handleError);
    room.on(RoomEvent.ParticipantConnected, (participant) => {
      playJoinSound();
      if (waitingRoomEnabled && !participant.isLocal) {
        setWaitingList((prev) => [
          ...prev,
          { identity: participant.identity, name: participant.name || participant.identity },
        ]);
        setAdmittedIds((prev) => {
          const next = new Set(prev);
          next.delete(participant.identity);
          return next;
        });
      } else {
        setAdmittedIds((prev) => {
          const next = new Set(prev);
          next.add(participant.identity);
          return next;
        });
      }
    });
    room.on(RoomEvent.ParticipantDisconnected, (participant) => {
      setWaitingList((prev) => prev.filter((p) => p.identity !== participant.identity));
      setAdmittedIds((prev) => {
        const next = new Set(prev);
        next.delete(participant.identity);
        return next;
      });
    });

    if (e2eeSetupComplete) {
      room
        .connect(
          props.connectionDetails.serverUrl,
          props.connectionDetails.participantToken,
          connectOptions,
        )
        .catch((error) => {
          handleError(error);
        });
      if (props.userChoices.videoEnabled) {
        room.localParticipant.setCameraEnabled(true).catch((error) => {
          handleError(error);
        });
      }
      if (props.userChoices.audioEnabled) {
        room.localParticipant.setMicrophoneEnabled(true, audioCaptureOptions).catch((error) => {
          handleError(error);
        });
      }
    }
    return () => {
      room.off(RoomEvent.Disconnected, handleOnLeave);
      room.off(RoomEvent.EncryptionError, handleEncryptionError);
      room.off(RoomEvent.MediaDevicesError, handleError);
      room.removeAllListeners(RoomEvent.ParticipantConnected);
      room.removeAllListeners(RoomEvent.ParticipantDisconnected);
    };
  }, [
    e2eeSetupComplete,
    room,
    props.connectionDetails,
    props.userChoices,
    connectOptions,
    handleOnLeave,
    handleEncryptionError,
    handleError,
    audioCaptureOptions,
    playJoinSound,
    waitingRoomEnabled,
  ]);

  const lowPowerMode = useLowCPUOptimizer(room);

  React.useEffect(() => {
    if (room.state !== ConnectionState.Connected) {
      return;
    }
    if (!room.localParticipant.isMicrophoneEnabled) {
      return;
    }
    setAdmittedIds((prev) => {
      const next = new Set(prev);
      next.add(room.localParticipant.identity);
      return next;
    });
    room.localParticipant.setMicrophoneEnabled(true, audioCaptureOptions).catch((error) => {
      console.warn('Failed to apply audio processing settings', error);
    });
  }, [room, audioCaptureOptions]);

  React.useEffect(() => {
    if (lowPowerMode) {
      console.warn('Low power mode enabled');
    }
  }, [lowPowerMode]);

  const admitParticipant = React.useCallback((identity: string) => {
    setWaitingList((prev) => prev.filter((p) => p.identity !== identity));
    setAdmittedIds((prev) => {
      const next = new Set(prev);
      next.add(identity);
      return next;
    });
  }, []);

  const handleSidebarPanelToggle = (panel: SidebarPanel) => {
    setSidebarCollapsed((prevCollapsed) => {
      const isSamePanel = activeSidebarPanel === panel;
      if (!prevCollapsed && isSamePanel) {
        return true;
      }
      return false;
    });
    setActiveSidebarPanel(panel);
  };

  // Orbit Mic Hook (Lifted)
  const orbitMicState = useOrbitMic();

  const renderSidebarPanel = () => {
    if (sidebarCollapsed) {
      return null;
    }
    switch (activeSidebarPanel) {
      case 'participants':
        return (
          <ParticipantsPanel
            alias="Participants"
            waitingRoomEnabled={waitingRoomEnabled}
            onWaitingRoomToggle={(enabled) => {
              setWaitingRoomEnabled(enabled);
              if (!enabled) {
                // Admit everyone waiting
                setAdmittedIds((prev) => {
                  const next = new Set(prev);
                  waitingList.forEach((p) => next.add(p.identity));
                  return next;
                });
                setWaitingList([]);
              }
            }}
            waitingList={waitingList}
            onAdmitParticipant={admitParticipant}
            admittedIds={admittedIds}
          />
        );
// Add import at the top (assumed to be done or will be done by TS, but I need to do it here manually if I can't ask it. Wait I can just edit the import section too).
// Actually, I can use multi_replace for this.

      case 'chat':
        return <ChatPanel />;
      case 'settings':
        return (
          <SettingsPanel
            voiceFocusEnabled={voiceFocusEnabled}
            onVoiceFocusChange={setVoiceFocusEnabled}
            vadEnabled={vadEnabled}
            onVadChange={setVadEnabled}
            noiseSuppressionEnabled={noiseSuppressionEnabled}
            onNoiseSuppressionChange={setNoiseSuppressionEnabled}
            echoCancellationEnabled={echoCancellationEnabled}
            onEchoCancellationChange={setEchoCancellationEnabled}
            autoGainEnabled={autoGainEnabled}
            onAutoGainChange={setAutoGainEnabled}
          />
        );
      case 'orbit':
        return <OrbitTranslatorVertical />;
      default:
        return null;
    }
  };

  const handleTranscriptSegment = React.useCallback(async (segment: any) => {
    console.log('🎤 handleTranscriptSegment called with:', segment);
    
    if (!roomName) {
      console.log('❌ No roomName, exiting');
      return;
    }
    
    console.log('✅ roomName:', roomName);
    console.log('👤 user:', user);
    
    try {
        const speakerId = user?.id || crypto.randomUUID();
        const insertData = {
            meeting_id: roomName,
            speaker_id: speakerId,
            user_id: user?.id || null,
            transcribe_text_segment: segment.text,
            full_transcription: segment.text,
        };
        
        console.log('📝 Attempting insert with data:', JSON.stringify(insertData, null, 2));
        console.log('🔌 Supabase client exists:', !!supabase);
        
        const result = await supabase.from('transcriptions').insert({
            meeting_id: roomName,
            speaker_id: speakerId,
            user_id: null, // Set to null to avoid FK constraint - user may not exist in users table
            transcribe_text_segment: segment.text,
            full_transcription: segment.text,
        });
        console.log('📊 Supabase result:', JSON.stringify(result, null, 2));
        
        const { data, error } = result;
        
        if (error) {
            console.error('❌ Supabase returned error');
            console.error('Error type:', typeof error);
            console.error('Error constructor:', error?.constructor?.name);
            console.error('Error keys:', Object.keys(error));
            console.error('Error message:', error?.message);
            console.error('Error details:', error?.details);
            console.error('Error hint:', error?.hint);
            console.error('Error code:', error?.code);
            console.error('Full error:', error);
            throw error;
        }
        console.log('✅ Transcription saved successfully!', data);
    } catch (err: any) {
        console.error('🔥 Caught error in try/catch');
        console.error('Error type:', typeof err);
        console.error('Error constructor:', err?.constructor?.name);
        console.error('Error keys:', err ? Object.keys(err) : 'null');
        console.error('Error string:', String(err));
        console.error('Failed to save transcript:', err);
    }
  }, [roomName, user?.id]);

  const handleTranscriptionToggle = React.useCallback(async () => {
    if (!roomName || !user?.id) return;

    if (!isTranscriptionEnabled) {
      // Check if current speaker is still in the room
      const currentSpeakerId = roomState?.activeSpeaker?.userId;
      const isSpeakerInRoom = currentSpeakerId ? 
        (Array.from(room.remoteParticipants.values()).some(p => p.identity === currentSpeakerId) || 
         room.localParticipant.identity === currentSpeakerId) : false;

      // Attempt to acquire lock
      // If there is a speaker but they aren't in the room, force takeover
      const shouldForce = !!(currentSpeakerId && !isSpeakerInRoom);
      const success = await tryAcquireSpeaker(roomName, user.id, shouldForce);
      
      if (success) {
        setIsTranscriptionEnabled(true);
      } else {
        toast.error('Someone else is currently speaking' as any);
      }
    } else {
      // Release lock
      await releaseSpeaker(roomName, user.id);
      setIsTranscriptionEnabled(false);
    }
  }, [isTranscriptionEnabled, roomName, user?.id, roomState, room]);

  return (
    <div
      className={`lk-room-container ${roomStyles.roomLayout} ${sidebarCollapsed ? roomStyles.roomLayoutCollapsed : ''}`}
    >
      <RoomContext.Provider value={room}>
        <LayoutContextProvider value={layoutContext}>
          <KeyboardShortcuts />
          <RoomAudioRenderer volume={1} />
          <ConnectionStateToast />

          <div
            ref={orbRef}
            className={`${roomStyles.orbDock} ${isOrbDragging ? roomStyles.orbDockDragging : ''}`}
            style={orbStyle}
            aria-label="Orbit audio orb"
          >
            <div className={roomStyles.orbCore} />
            <div className={roomStyles.orbVisualizer} aria-hidden="true">
              <div className={roomStyles.orbVizRow}>
                {orbBarIndices.map((i) => (
                  <span
                    key={`orb-in-${i}`}
                    className={`${roomStyles.orbBar} ${roomStyles.orbBarIn}`}
                    style={{ animationDelay: `${i * 0.12}s` }}
                  />
                ))}
              </div>
              <div className={roomStyles.orbVizRow}>
                {orbBarIndices.map((i) => (
                  <span
                    key={`orb-out-${i}`}
                    className={`${roomStyles.orbBar} ${roomStyles.orbBarOut}`}
                    style={{ animationDelay: `${i * 0.1}s` }}
                  />
                ))}
              </div>
            </div>
            <button
              type="button"
              className={roomStyles.orbSettingsBtn}
              data-orb-settings="true"
              onClick={() => setIsOrbSettingsOpen(true)}
              aria-label="Open Orbit settings"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="M12 8.5a3.5 3.5 0 1 0 0 7a3.5 3.5 0 0 0 0-7Z"
                  stroke="currentColor"
                  strokeWidth="1.8"
                />
                <path
                  d="M19 12a7 7 0 0 0-.08-1l2.02-1.57-2-3.46-2.48.6a7.1 7.1 0 0 0-1.7-.98L14 2h-4l-.76 2.59c-.6.2-1.17.48-1.7.82l-2.48-.6-2 3.46L5.08 11A7 7 0 0 0 5 12c0 .34.03.67.08 1l-2.02 1.57 2 3.46 2.48-.6c.52.34 1.1.62 1.7.82L10 22h4l.76-2.59c.6-.2 1.17-.48 1.7-.82l2.48.6 2-3.46L18.92 13c.05-.33.08-.66.08-1Z"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  opacity="0.85"
                />
              </svg>
            </button>
          </div>

          {isOrbSettingsOpen && (
            <div
              className={roomStyles.orbModalOverlay}
              role="dialog"
              aria-modal="true"
              aria-labelledby="orbSettingsTitle"
              onClick={(event) => {
                if (event.target === event.currentTarget) {
                  setIsOrbSettingsOpen(false);
                }
              }}
            >
              <div className={roomStyles.orbModalCard}>
                <div className={roomStyles.orbModalHeader}>
                  <div id="orbSettingsTitle" className={roomStyles.orbModalTitle}>
                    Orbit
                  </div>
                  <button
                    type="button"
                    className={roomStyles.orbModalClose}
                    onClick={() => setIsOrbSettingsOpen(false)}
                    aria-label="Close Orbit settings"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path
                        d="M6 6l12 12M18 6L6 18"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        opacity="0.9"
                      />
                    </svg>
                  </button>
                </div>
                <p className={roomStyles.orbModalText}>
                  Orbit audio is active. Tap the orb to drag it; use the controls here for future voice options.
                </p>
              </div>
            </div>
          )}
          
          {/* Main video grid */}
          <div className={roomStyles.videoGridContainer}>
            <VideoGrid allowedParticipantIds={admittedIds} isGridView={isGridView} />
          </div>
          
          {/* Right Sidebar */}
          <div className={`${roomStyles.chatPanel} ${sidebarCollapsed ? roomStyles.chatPanelCollapsed : ''}`}>
            <button 
              className={roomStyles.sidebarToggle}
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              title={sidebarCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
            >
              {sidebarCollapsed ? <ChevronLeftIcon /> : <ChevronRightIcon />}
            </button>
            <div className={roomStyles.sidebarContent}>
              {renderSidebarPanel()}
            </div>
          </div>
          


          {/* Modern Host-Only Per-Character Subtitles */}
          <HostCaptionOverlay 
            words={deepgram.words} 
            isFinal={deepgram.isFinal} 
            isListening={deepgram.isListening}
            analyser={deepgram.analyser}
          />

          {/* Legacy Overlay - disabled for now to favor Karaoke style */}
          {/*
          {isTranscriptionEnabled && (
            <CinemaCaptionOverlay 
                onTranscriptSegment={handleTranscriptSegment}
                defaultDeviceId={audioCaptureOptions?.deviceId as string}
                targetLanguage={targetLanguage}
                isFloorHolder={isFloorHolder}
                onClaimFloor={claimFloor}
            />
          )}
          */}

          {/* Custom control bar */}
          <EburonControlBar 
            onParticipantsToggle={() => handleSidebarPanelToggle('participants')}
            onChatToggle={() => handleSidebarPanelToggle('chat')}
            onSettingsToggle={() => handleSidebarPanelToggle('settings')}
            onOrbitToggle={() => handleSidebarPanelToggle('orbit')}

            onGridToggle={() => setIsGridView(!isGridView)}
            isGridView={isGridView}

            onTranscriptionToggle={handleTranscriptionToggle}
            isParticipantsOpen={!sidebarCollapsed && activeSidebarPanel === 'participants'}
            isChatOpen={!sidebarCollapsed && activeSidebarPanel === 'chat'}
            isSettingsOpen={!sidebarCollapsed && activeSidebarPanel === 'settings'}
            isOrbitOpen={!sidebarCollapsed && activeSidebarPanel === 'orbit'}


            isTranscriptionOpen={isTranscriptionEnabled}
            isAppMuted={isAppMuted}
            onAppMuteToggle={setIsAppMuted}
            roomState={roomState}
            userId={user?.id}
            audioCaptureOptions={audioCaptureOptions}
            onCaptionToggle={() => setIsTranscriptionEnabled(!isTranscriptionEnabled)}
            isCaptionOpen={isTranscriptionEnabled}

            onLanguageChange={setTargetLanguage}
            orbitMicState={orbitMicState}
          />
          
          <DebugMode />
          <RecordingIndicator />



          {/* Floating Caption Button */}

        </LayoutContextProvider>
      </RoomContext.Provider>
    </div>
  );
}
