export interface Avatar {
  id: string;
  name: string;
  url: string;
  description: string;
}

export interface VoiceDNA {
  pitch: string;
  resonance: string;
  speed: string;
  tone: string;
  emotionalBase: string;
  fingerprint: string;
  timbre?: string;
  accent?: string;
}

export interface ScriptSegment {
  id: string;
  text: string;
  status: 'idle' | 'loading' | 'polling' | 'success' | 'error';
  videoUrl?: string;
  progress?: number;
  analysis?: {
    score: number;
    issues: string[];
    suggestions: string;
    naturalPhrasing?: string;
    metrics?: {
      sentenceComplexity: 'low' | 'medium' | 'high';
      emotionalTone: string;
      pacing: string;
      clarity: number;
    };
  };
}

export interface GenerationStatus {
  state: 'idle' | 'loading' | 'polling' | 'success' | 'error';
  message?: string;
  progress?: number;
  errorDetails?: string;
  solution?: string;
  errorLink?: { label: string, url: string };
  currentPart?: number;
  totalParts?: number;
}

export interface VideoResult {
  url: string;
  id: string;
  prompt: string;
  avatarId: string;
  resolution: '720p' | '1080p';
  scriptSnippet: string;
}

export interface LipSyncConfig {
  intensity: number; // 1-100
  expression: number; // 1-100
  blinkRate: number; // 1-100
}

export interface ExportConfig {
  resolution: '720p' | '1080p';
  format: 'mp4' | 'mov' | 'webm' | 'gif';
  includeBackgroundAudio: boolean;
}

export interface LanguageSettings {
  language: string;
  accent: string;
}

export interface SyncAnalysis {
  score: number;
  suggestions: string[];
  recommendedSettings: {
    intensity: number;
    expression: number;
    blinkRate: number;
  };
}

export interface WatermarkConfig {
  enabled: boolean;
  text: string;
  position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  opacity: number;
}

export interface PolishConfig {
  enabled: boolean;
  colorGrade: 'none' | 'cinematic' | 'warm' | 'cool' | 'vibrant' | 'sepia';
  grainIntensity: number;
  vignette: number;
  softFocus: number;
  highFidelity: boolean;
  stabilization: boolean;
  stabilizationStrength: number;
}

export interface AudioDesignConfig {
  bgmUrl: string | null;
  bgmVolume: number;
  sfxVolume: number;
  voiceVolume: number;
  isLooping: boolean;
  reverbLevel: number; // 0-1
  eqPreset: 'neutral' | 'bass-boost' | 'bright' | 'voice-focus';
  selectedSfx: string | null;
}

export interface ScriptMetadata {
  isLong: boolean;
  estimatedSegments: number;
  suggestedAction: 'condense' | 'segment' | 'none';
}

export interface Voice {
  id: string;
  name: string;
  gender: 'male' | 'female';
  description: string;
  dna: VoiceDNA;
  recommendedLipSync: LipSyncConfig;
}
