import { Avatar, VoiceDNA, Voice } from './types';

export const PUBLIC_AVATARS: Avatar[] = [
  {
    id: 'avatar-1',
    name: 'Professional Male',
    url: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?q=80&w=1000&auto=format&fit=crop',
    description: 'Corporate presenter style'
  },
  {
    id: 'avatar-2',
    name: 'Tech Lead Female',
    url: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?q=80&w=1000&auto=format&fit=crop',
    description: 'Enthusiastic and modern'
  },
  {
    id: 'avatar-3',
    name: 'Casual Content Creator',
    url: 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?q=80&w=1000&auto=format&fit=crop',
    description: 'Relatable and friendly'
  },
  {
    id: 'avatar-4',
    name: 'Executive Speaker',
    url: 'https://images.unsplash.com/photo-1560250097-0b93528c311a?q=80&w=1000&auto=format&fit=crop',
    description: 'Authoritative and clean'
  }
];

export const VOICE_LIBRARY: Voice[] = [
  {
    id: 'v-m-1',
    name: 'David',
    gender: 'male',
    description: 'Authoritative & Clear',
    recommendedLipSync: { intensity: 50, expression: 40, blinkRate: 40 },
    dna: {
      pitch: 'Deep Baritone',
      resonance: 'Chest-heavy',
      speed: 'Deliberate',
      tone: 'Crisp and Professional',
      emotionalBase: 'Authoritative',
      fingerprint: 'A mature male voice with deep baritone resonance, very clear articulation, and a steady, confident pace suitable for corporate announcements.'
    }
  },
  {
    id: 'v-m-2',
    name: 'Marcus',
    gender: 'male',
    description: 'Friendly & Casual',
    recommendedLipSync: { intensity: 55, expression: 60, blinkRate: 50 },
    dna: {
      pitch: 'Neutral Tenor',
      resonance: 'Balanced',
      speed: 'Rhythmic',
      tone: 'Warm and Relatable',
      emotionalBase: 'Approachable',
      fingerprint: 'A youthful male voice with a friendly tenor pitch, natural melodic flow, and a casual, conversational tone.'
    }
  },
  {
    id: 'v-f-1',
    name: 'Sarah',
    gender: 'female',
    description: 'Empathetic & Calm',
    recommendedLipSync: { intensity: 45, expression: 50, blinkRate: 45 },
    dna: {
      pitch: 'Soft Mezzo-Soprano',
      resonance: 'Gentle',
      speed: 'Moderate',
      tone: 'Velvety and Soothing',
      emotionalBase: 'Empathetic',
      fingerprint: 'A smooth female voice with soft mezzo-soprano characteristics, calming resonance, and a rhythmic, patient delivery.'
    }
  },
  {
    id: 'v-f-2',
    name: 'Elena',
    gender: 'female',
    description: 'Energetic & Modern',
    recommendedLipSync: { intensity: 80, expression: 85, blinkRate: 60 },
    dna: {
      pitch: 'Bright Soprano',
      resonance: 'Front-focused',
      speed: 'Fast-paced',
      tone: 'Dynamic and High-Clarity',
      emotionalBase: 'Enthusiastic',
      fingerprint: 'A bright, energetic female voice with high soprano pitch, front-focused resonance, and a quick, engaging pace for modern content creation.'
    }
  }
];

export const CLONE_EXAMPLES = [
  { id: 'ex-1', name: 'Clear Narrative', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3', label: 'Recommended Quality' },
  { id: 'ex-2', name: 'Conversational', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3', label: 'Casual Tone' }
];

export const BACKGROUND_MUSIC_TRACKS = [
  { id: 'none', name: 'No Background Music', url: null },
  { id: 'corporate', name: 'Corporate Minimal', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3' },
  { id: 'uplifting', name: 'Uplifting Tech', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3' },
  { id: 'lofi', name: 'Chill Lo-Fi', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-8.mp3' },
  { id: 'cinematic', name: 'Cinematic Ambient', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-10.mp3' },
];

export const SOUND_EFFECTS = [
  { id: 'ding', name: 'Success Ding', url: 'https://actions.google.com/sounds/v1/alarms/beep_short.ogg' },
  { id: 'whoosh', name: 'Whoosh Transition', url: 'https://actions.google.com/sounds/v1/science_fiction/whoosh.ogg' },
  { id: 'pop', name: 'Interface Pop', url: 'https://actions.google.com/sounds/v1/cartoon/pop.ogg' },
  { id: 'shimmer', name: 'Magic Shimmer', url: 'https://actions.google.com/sounds/v1/magic/magic_chime.ogg' },
];

export const EQ_PRESETS = [
  { id: 'neutral', name: 'Neutral' },
  { id: 'bass-boost', name: 'Deep Bass' },
  { id: 'bright', name: 'Crystal Clear' },
  { id: 'voice-focus', name: 'Voice Enhance' },
];

export const SUPPORTED_LANGUAGES = [
  { code: 'en', name: 'English', accents: ['Neutral US', 'British', 'Australian', 'Indian'] },
  { code: 'es', name: 'Spanish', accents: ['Castilian', 'Mexican', 'Argentinian'] },
  { code: 'fr', name: 'French', accents: ['Parisian', 'Canadian'] },
  { code: 'de', name: 'German', accents: ['Standard German'] },
  { code: 'it', name: 'Italian', accents: ['Standard Italian'] },
  { code: 'pt', name: 'Portuguese', accents: ['Brazilian', 'European'] },
  { code: 'zh', name: 'Chinese', accents: ['Mandarin', 'Cantonese'] },
  { code: 'ja', name: 'Japanese', accents: ['Standard Japanese'] },
  { code: 'ko', name: 'Korean', accents: ['Standard Korean'] },
  { code: 'hi', name: 'Hindi', accents: ['Standard Hindi'] }
];

export const APP_CONFIG = {
  MODELS: {
    VIDEO: 'veo-3.1-fast-generate-preview',
    VIDEO_HQ: 'veo-3.1-generate-preview',
    TEXT: 'gemini-3-flash-preview',
    IMAGE: 'gemini-2.5-flash-image'
  }
};
