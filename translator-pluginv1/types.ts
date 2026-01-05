
export type AppMode = "idle" | "speaking" | "listening";
export type ListenPreference = "raw" | "translated";
export type AudioSource = "mic" | "system";

export type EmotionType = "neutral" | "joy" | "sadness" | "anger" | "fear" | "calm" | "excited";

export interface SpeakerInfo {
  userId: string;
  userName: string;
  sessionId: string;
  since: number;
}

export interface QueueEntry {
  userId: string;
  userName: string;
  requestedAt: number;
}

/**
 * Fix: Added missing RoomState interface export.
 */
export interface RoomState {
  activeSpeaker: SpeakerInfo | null;
  raiseHandQueue: QueueEntry[];
  lockVersion: number;
}

export interface Caption {
  id: string;
  text: string;
  sourceLang: string;
  speakerUserId: string;
  speakerName: string;
  timestamp: number;
  isFinal: boolean;
  emotion?: EmotionType;
}

export interface Language {
  code: string;
  name: string;
  flag: string;
}

export interface TranslationResult {
  translatedText: string;
  detectedLanguage: string;
  emotion: EmotionType;
  pronunciationGuide: string;
}

export const AUTO_DETECT: Language = { code: 'auto', name: 'Auto Detect', flag: '✨' };

export const LANGUAGES: Language[] = [
  AUTO_DETECT,
  // --- English World ---
  { code: 'en-US', name: 'English (United States)', flag: '🇺🇸' },
  { code: 'en-GB', name: 'English (United Kingdom)', flag: '🇬🇧' },
  { code: 'en-CA', name: 'English (Canada)', flag: '🇨🇦' },
  { code: 'en-AU', name: 'English (Australia)', flag: '🇦🇺' },
  { code: 'en-NZ', name: 'English (New Zealand)', flag: '🇳🇿' },
  { code: 'en-IE', name: 'English (Ireland)', flag: '🇮🇪' },
  { code: 'en-ZA', name: 'English (South Africa)', flag: '🇿🇦' },
  { code: 'en-IN', name: 'English (India)', flag: '🇮🇳' },
  { code: 'en-PH', name: 'English (Philippines)', flag: '🇵🇭' },
  { code: 'en-SG', name: 'English (Singapore)', flag: '🇸🇬' },
  { code: 'en-MY', name: 'English (Malaysia)', flag: '🇲🇾' },
  { code: 'en-HK', name: 'English (Hong Kong)', flag: '🇭🇰' },
  { code: 'en-KE', name: 'English (Kenya)', flag: '🇰🇪' },
  { code: 'en-GH', name: 'English (Ghana)', flag: '🇬🇭' },
  { code: 'en-NG', name: 'English (Nigeria)', flag: '🇳🇬' },
  { code: 'en-PK', name: 'English (Pakistan)', flag: '🇵🇰' },

  // --- Spanish World ---
  { code: 'es-ES', name: 'Spanish (Spain)', flag: '🇪🇸' },
  { code: 'es-MX', name: 'Spanish (Mexico)', flag: '🇲🇽' },
  { code: 'es-US', name: 'Spanish (United States)', flag: '🇺🇸' },
  { code: 'es-AR', name: 'Spanish (Argentina)', flag: '🇦🇷' },
  { code: 'es-BO', name: 'Spanish (Bolivia)', flag: '🇧🇴' },
  { code: 'es-CL', name: 'Spanish (Chile)', flag: '🇨🇱' },
  { code: 'es-CO', name: 'Spanish (Colombia)', flag: '🇨🇴' },
  { code: 'es-CR', name: 'Spanish (Costa Rica)', flag: '🇨🇷' },
  { code: 'es-CU', name: 'Spanish (Cuba)', flag: '🇨🇺' },
  { code: 'es-DO', name: 'Spanish (Dominican Republic)', flag: '🇩🇴' },
  { code: 'es-EC', name: 'Spanish (Ecuador)', flag: '🇪🇨' },
  { code: 'es-SV', name: 'Spanish (El Salvador)', flag: '🇸🇻' },
  { code: 'es-GT', name: 'Spanish (Guatemala)', flag: '🇬🇹' },
  { code: 'es-HN', name: 'Spanish (Honduras)', flag: '🇭🇳' },
  { code: 'es-NI', name: 'Spanish (Nicaragua)', flag: '🇳🇮' },
  { code: 'es-PA', name: 'Spanish (Panama)', flag: '🇵🇦' },
  { code: 'es-PY', name: 'Spanish (Paraguay)', flag: '🇵🇾' },
  { code: 'es-PE', name: 'Spanish (Peru)', flag: '🇵🇪' },
  { code: 'es-PR', name: 'Spanish (Puerto Rico)', flag: '🇵🇷' },
  { code: 'es-UY', name: 'Spanish (Uruguay)', flag: '🇺🇾' },
  { code: 'es-VE', name: 'Spanish (Venezuela)', flag: '🇻🇪' },

  // --- Portuguese World ---
  { code: 'pt-PT', name: 'Portuguese (Portugal)', flag: '🇵🇹' },
  { code: 'pt-BR', name: 'Portuguese (Brazil)', flag: '🇧🇷' },
  { code: 'pt-AO', name: 'Portuguese (Angola)', flag: '🇦🇴' },
  { code: 'pt-MZ', name: 'Portuguese (Mozambique)', flag: '🇲🇿' },

  // --- French World ---
  { code: 'fr-FR', name: 'French (France)', flag: '🇫🇷' },
  { code: 'fr-CA', name: 'French (Canada)', flag: '🇨🇦' },
  { code: 'fr-BE', name: 'French (Belgium)', flag: '🇧🇪' },
  { code: 'fr-CH', name: 'French (Switzerland)', flag: '🇨🇭' },
  { code: 'fr-LU', name: 'French (Luxembourg)', flag: '🇱🇺' },
  { code: 'fr-SN', name: 'French (Senegal)', flag: '🇸🇳' },
  { code: 'fr-CI', name: "French (Côte d'Ivoire)", flag: '🇨🇮' },

  // --- Germanic (Core) ---
  { code: 'de-DE', name: 'German (Germany)', flag: '🇩🇪' },
  { code: 'de-AT', name: 'German (Austria)', flag: '🇦🇹' },
  { code: 'de-CH', name: 'German (Switzerland)', flag: '🇨🇭' },
  { code: 'nl-NL', name: 'Dutch (Netherlands)', flag: '🇳🇱' },
  { code: 'nl-BE', name: 'Dutch (Belgium / Flemish Standard)', flag: '🇧🇪' },

  // --- Belgium Regional Languages / Dialects ---
  { code: 'vls-BE', name: 'West Flemish (Belgium)', flag: '🇧🇪' },
  { code: 'zea-BE', name: 'Zeelandic (Belgium)', flag: '🇧🇪' },
  { code: 'lim-BE', name: 'Limburgish (Belgium)', flag: '🇧🇪' },
  { code: 'wa-BE', name: 'Walloon (Belgium)', flag: '🇧🇪' },
  { code: 'de-BE', name: 'German (Belgium)', flag: '🇧🇪' },
  { code: 'pcd-BE', name: 'Picard (Belgium)', flag: '🇧🇪' },

  // --- Italy & Neighbors ---
  { code: 'it-IT', name: 'Italian (Italy)', flag: '🇮🇹' },
  { code: 'it-CH', name: 'Italian (Switzerland)', flag: '🇨🇭' },
  { code: 'rm-CH', name: 'Romansh (Switzerland)', flag: '🇨🇭' },

  // --- Nordics ---
  { code: 'sv-SE', name: 'Swedish', flag: '🇸🇪' },
  { code: 'da-DK', name: 'Danish', flag: '🇩🇰' },
  { code: 'nb-NO', name: 'Norwegian Bokmål', flag: '🇳🇴' },
  { code: 'nn-NO', name: 'Norwegian Nynorsk', flag: '🇳🇴' },
  { code: 'fi-FI', name: 'Finnish', flag: '🇫🇮' },
  { code: 'is-IS', name: 'Icelandic', flag: '🇮🇸' },
  { code: 'fo-FO', name: 'Faroese', flag: '🇫🇴' },

  // --- Western & Central Europe ---
  { code: 'ga-IE', name: 'Irish', flag: '🇮🇪' },
  { code: 'gd-GB', name: 'Scottish Gaelic', flag: '🏴' },
  { code: 'cy-GB', name: 'Welsh', flag: '🏴' },
  { code: 'br-FR', name: 'Breton', flag: '🇫🇷' },
  { code: 'eu-ES', name: 'Basque', flag: '🇪🇸' },
  { code: 'ca-ES', name: 'Catalan', flag: '🇪🇸' },
  { code: 'gl-ES', name: 'Galician', flag: '🇪🇸' },
  { code: 'oc-FR', name: 'Occitan', flag: '🇫🇷' },
  { code: 'lb-LU', name: 'Luxembourgish', flag: '🇱🇺' },
  { code: 'mt-MT', name: 'Maltese', flag: '🇲🇹' },

  // --- Balkans & Eastern Europe ---
  { code: 'pl-PL', name: 'Polish', flag: '🇵🇱' },
  { code: 'cs-CZ', name: 'Czech', flag: '🇨🇿' },
  { code: 'sk-SK', name: 'Slovak', flag: '🇸🇰' },
  { code: 'hu-HU', name: 'Hungarian', flag: '🇭🇺' },
  { code: 'ro-RO', name: 'Romanian', flag: '🇷🇴' },
  { code: 'bg-BG', name: 'Bulgarian', flag: '🇧🇬' },
  { code: 'sl-SI', name: 'Slovenian', flag: '🇸🇮' },
  { code: 'hr-HR', name: 'Croatian', flag: '🇭🇷' },
  { code: 'sr-RS', name: 'Serbian (Serbia)', flag: '🇷🇸' },
  { code: 'bs-BA', name: 'Bosnian', flag: '🇧🇦' },
  { code: 'mk-MK', name: 'Macedonian', flag: '🇲🇰' },
  /**
   * Fix: Completed the final entry and closed the LANGUAGES array.
   */
  { code: 'sq-AL', name: 'Albanian', flag: '🇦🇱' }
];
