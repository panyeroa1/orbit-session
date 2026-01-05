
import { supabase } from './supabaseClient';

export interface RoomState {
  activeSpeakerUserId: string | null;
  activeSpeakerSince: string | null;
  lockVersion: number;
}

export async function ensureRoomState(roomCode: string): Promise<string | null> {
  const { data, error } = await supabase.rpc('ensure_room_state', { p_room_code: roomCode });
  if (error) {
    console.error('Error ensuring room state:', error);
    return null;
  }
  return data;
}

export async function acquireSpeakerLock(roomCode: string, userId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('acquire_speaker_lock', {
    p_room_code: roomCode,
    p_user_id: userId
  });
  if (error) {
    console.error('Error acquiring speaker lock:', error);
    return false;
  }
  return !!data;
}

export async function releaseSpeakerLock(roomCode: string, userId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('release_speaker_lock', {
    p_room_code: roomCode,
    p_user_id: userId
  });
  if (error) {
    console.error('Error releasing speaker lock:', error);
    return false;
  }
  return !!data;
}

export async function saveUtterance(roomId: string, userId: string, text: string, sourceLang: string = 'auto') {
  const { data, error } = await supabase
    .from('public.utterances')
    .insert({
      room_id: roomId,
      speaker_user_id: userId,
      text: text,
      source_language: sourceLang,
      ended_at: new Date().toISOString()
    })
    .select()
    .single();

  if (error) {
    console.error('Error saving utterance:', error);
    return null;
  }
  return data;
}

export async function saveTranslation(roomId: string, utteranceId: string, listenerUserId: string | null, targetLang: string, translatedText: string) {
  const { data, error } = await supabase
    .from('public.translations')
    .insert({
      room_id: roomId,
      utterance_id: utteranceId,
      listener_user_id: listenerUserId,
      target_language: targetLang,
      translated_text: translatedText
    })
    .select()
    .single();

  if (error) {
    console.error('Error saving translation:', error);
    return null;
  }
  return data;
}

export async function updateParticipantLanguage(roomId: string, userId: string, lang: string) {
  const { error } = await supabase
    .from('public.participants')
    .upsert({
      room_id: roomId,
      user_id: userId,
      preferred_language: lang
    }, { onConflict: 'room_id,user_id' });

  if (error) console.error('Error updating participant language:', error);
}

export function subscribeToUtterances(roomId: string, callback: (utterance: any) => void) {
  return supabase
    .channel(`public:utterances:${roomId}`)
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'utterances',
      filter: `room_id=eq.${roomId}`
    }, (payload) => callback(payload.new))
    .subscribe();
}

export function subscribeToRoomState(roomId: string, callback: (state: any) => void) {
  return supabase
    .channel(`public:room_state:${roomId}`)
    .on('postgres_changes', {
      event: 'UPDATE',
      schema: 'public',
      table: 'room_state',
      filter: `room_id=eq.${roomId}`
    }, (payload) => callback(payload.new))
    .subscribe();
}
