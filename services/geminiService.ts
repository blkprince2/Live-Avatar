
import { GoogleGenAI, Type } from "@google/genai";
import { APP_CONFIG } from "../constants";
import { LipSyncConfig, LanguageSettings, SyncAnalysis, ScriptMetadata, PolishConfig, VoiceDNA } from "../types";

export class GeminiService {
  private static async getAI() {
    return new GoogleGenAI({ apiKey: process.env.API_KEY });
  }

  static async checkApiKey(): Promise<boolean> {
    if (typeof window.aistudio?.hasSelectedApiKey === 'function') {
      return await window.aistudio.hasSelectedApiKey();
    }
    return !!process.env.API_KEY; 
  }

  static async selectApiKey() {
    if (typeof window.aistudio?.openSelectKey === 'function') {
      await window.aistudio.openSelectKey();
      return true;
    }
    return false;
  }

  static mapError(error: any): { 
    type: 'auth' | 'safety' | 'quota' | 'network' | 'generic',
    message: string, 
    details: string, 
    solution: string, 
    link?: { label: string, url: string } 
  } {
    const errStr = String(error?.message || error).toLowerCase();
    
    if (errStr.includes("requested entity was not found") || 
        errStr.includes("api key not valid") || 
        errStr.includes("invalid api key") ||
        errStr.includes("not found")) {
      return {
        type: 'auth',
        message: "Project Billing Required",
        details: "Gemini Veo (video generation) is only available for API keys from paid Google Cloud projects.",
        solution: "Select an API key from a project with an active billing account.",
        link: { label: "Enable Billing Guide", url: "https://ai.google.dev/gemini-api/docs/billing" }
      };
    }

    if (errStr.includes("safety") || errStr.includes("candidate was blocked") || errStr.includes("finish_reason: safety")) {
      return {
        type: 'safety',
        message: "Neural Safety Block",
        details: "The content triggered safety filters. Depictions of real public figures or sensitive topics are restricted.",
        solution: "Try a different script or avatar image.",
        link: { label: "Safety Policy Details", url: "https://ai.google.dev/gemini-api/docs/safety-guidelines" }
      };
    }

    if (errStr.includes("quota") || errStr.includes("429") || errStr.includes("exhausted") || errStr.includes("rate limit") || errStr.includes("too many requests")) {
      return {
        type: 'quota',
        message: "Resource Limit Reached",
        details: "Rate limit hit for concurrent video synthesis.",
        solution: "Wait 60 seconds and retry.",
        link: { label: "Check Quota Limits", url: "https://aistudio.google.com/app/plan_information" }
      };
    }

    if (errStr.includes("network") || errStr.includes("fetch") || errStr.includes("failed to fetch") || errStr.includes("deadline exceeded")) {
      return {
        type: 'network',
        message: "Neural Sync Timeout",
        details: "Connection to synthesis engine was interrupted.",
        solution: "Check your connection and retry the segment.",
      };
    }

    return {
      type: 'generic',
      message: "Synthesis Engine Error",
      details: error?.message || "Internal fault during frame synthesis.",
      solution: "Refresh and shorten the script for this clip.",
      link: { label: "System Status", url: "https://aistudio.google.com/" }
    };
  }

  static splitScriptIntoChunks(text: string, maxWords: number = 25): string[] {
    const sentences = text.match(/[^\.!\?]+[\.!\?]+/g) || [text];
    const chunks: string[] = [];
    let currentChunk = "";

    sentences.forEach(sentence => {
      const sentenceWords = sentence.trim().split(/\s+/).length;
      const currentWords = currentChunk.split(/\s+/).length;
      if (currentWords + sentenceWords > maxWords && currentChunk !== "") {
        chunks.push(currentChunk.trim());
        currentChunk = sentence;
      } else {
        currentChunk += (currentChunk === "" ? "" : " ") + sentence;
      }
    });
    if (currentChunk) chunks.push(currentChunk.trim());
    return chunks;
  }

  static async getIntelligentSegments(script: string): Promise<string[]> {
    const ai = await this.getAI();
    const response = await ai.models.generateContent({
      model: APP_CONFIG.MODELS.TEXT,
      config: { 
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: { type: Type.STRING }
        }
      },
      contents: `Split the script into logical segments for 5-10s clips (15-25 words each). Return JSON array. Script: "${script}"`
    });
    try {
      return JSON.parse(response.text || '[]');
    } catch {
      return this.splitScriptIntoChunks(script);
    }
  }

  // Added condenseScript method to fix missing property error in App.tsx
  static async condenseScript(text: string, targetWords: number): Promise<string> {
    const ai = await this.getAI();
    const response = await ai.models.generateContent({
      model: APP_CONFIG.MODELS.TEXT,
      contents: `Condense the following script to approximately ${targetWords} words while maintaining its core meaning: "${text}"`
    });
    return response.text || text;
  }

  static async analyzeSequenceCoherence(scripts: string[]): Promise<{ score: number, feedback: string, suggestion: string, pacingMap: string[] }> {
    const ai = await this.getAI();
    const response = await ai.models.generateContent({
      model: APP_CONFIG.MODELS.TEXT,
      config: { 
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            score: { type: Type.NUMBER },
            feedback: { type: Type.STRING },
            suggestion: { type: Type.STRING },
            pacingMap: { type: Type.ARRAY, items: { type: Type.STRING } }
          },
          required: ["score", "feedback", "suggestion", "pacingMap"]
        }
      },
      contents: `Analyze narrative consistency between these segments: ${JSON.stringify(scripts)}`
    });
    try {
      return JSON.parse(response.text || '{}');
    } catch {
      return { score: 50, feedback: "Analysis failed", suggestion: "Review transitions.", pacingMap: [] };
    }
  }

  static async analyzeVoiceReference(audioB64: string, mimeType: string): Promise<VoiceDNA> {
    const ai = await this.getAI();
    const base64Data = audioB64.split(',')[1] || audioB64;
    
    const response = await ai.models.generateContent({
      model: APP_CONFIG.MODELS.TEXT,
      config: { 
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            pitch: { type: Type.STRING, description: "Pitch analysis (e.g. Deep Baritone, Soft Tenor)" },
            resonance: { type: Type.STRING, description: "Resonance (e.g. Nasal, Chest, Balanced)" },
            speed: { type: Type.STRING, description: "Pace and Rythm (e.g. Fast-paced, Deliberate, Rhythmic)" },
            tone: { type: Type.STRING, description: "Vocal Tone (e.g. Warm, Crisp, Raspy, Breathless)" },
            emotionalBase: { type: Type.STRING, description: "Default Affect (e.g. Authoritative, Friendly, Neutral)" },
            timbre: { type: Type.STRING, description: "Specific timbral quality (e.g. Velvety, Metallic, Airy)" },
            accent: { type: Type.STRING, description: "Detected accent pattern" },
            fingerprint: { type: Type.STRING, description: "A detailed forensic text-based fingerprint used for synthesis cloning. Include specific timbral nuances and speech artifacts." }
          },
          required: ["pitch", "resonance", "speed", "tone", "emotionalBase", "fingerprint"]
        }
      },
      contents: [
        { inlineData: { data: base64Data, mimeType: mimeType } },
        { text: "Perform a DEEP FORENSIC vocal analysis of this audio. Extract a Neural Vocal Signature. Describe the exact frequency profile, breathiness, articulation speed, and timbral nuances in a way that an AI video generator can replicate this specific human's identity." }
      ],
    });
    
    try {
      return JSON.parse(response.text || '{}') as VoiceDNA;
    } catch {
      return { 
        pitch: "Neutral", resonance: "Balanced", speed: "Natural", tone: "Clear", emotionalBase: "Professional", 
        fingerprint: "a standard, clear, professional human voice with natural resonance and steady pacing" 
      };
    }
  }

  // Added analyzeLipSyncAccuracy method to fix missing property error in App.tsx
  static async analyzeLipSyncAccuracy(audioB64: string, mimeType: string, script: string): Promise<SyncAnalysis> {
    const ai = await this.getAI();
    const base64Data = audioB64.split(',')[1] || audioB64;
    const response = await ai.models.generateContent({
      model: APP_CONFIG.MODELS.TEXT,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            score: { type: Type.NUMBER },
            suggestions: { type: Type.ARRAY, items: { type: Type.STRING } },
            recommendedSettings: {
              type: Type.OBJECT,
              properties: {
                intensity: { type: Type.NUMBER },
                expression: { type: Type.NUMBER },
                blinkRate: { type: Type.NUMBER }
              },
              required: ["intensity", "expression", "blinkRate"]
            }
          },
          required: ["score", "suggestions", "recommendedSettings"]
        }
      },
      contents: [
        { inlineData: { data: base64Data, mimeType: mimeType } },
        { text: `Analyze the phonetic patterns of this audio against the script: "${script}". Provide a lip-sync accuracy score and recommended avatar animation settings (0-100) to optimize the performance match.` }
      ]
    });
    try {
      return JSON.parse(response.text || '{}') as SyncAnalysis;
    } catch {
      return {
        score: 70,
        suggestions: ["Manual adjustment recommended"],
        recommendedSettings: { intensity: 50, expression: 50, blinkRate: 50 }
      };
    }
  }

  static async generateAvatarVideo(
    imageB64: string, 
    script: string, 
    voiceDNA?: VoiceDNA, 
    lipSync?: LipSyncConfig,
    resolution: '720p' | '1080p' = '720p',
    mimeType: string = 'image/jpeg',
    langSettings?: LanguageSettings,
    polish?: PolishConfig
  ) {
    const ai = await this.getAI();
    const base64Data = imageB64.split(',')[1] || imageB64;
    const displayScript = script.substring(0, 2000);

    const voiceContext = voiceDNA 
      ? `IDENTITY CLONE DIRECTIVE: The character MUST speak with the following specific vocal identity: ${voiceDNA.fingerprint}. 
         Technical Specs: Pitch=${voiceDNA.pitch}, Resonance=${voiceDNA.resonance}, Speed=${voiceDNA.speed}, Timbre=${voiceDNA.timbre || 'Natural'}. 
         The synthesized voice must be an indistinguishable clone of this forensic signature.` 
      : "The speaker has a clear, professional, friendly voice.";
    
    const langContext = langSettings ? `The speaker must speak in ${langSettings.language} with a ${langSettings.accent} accent.` : "";
    
    const lipIntensityStr = lipSync && lipSync.intensity > 70 ? "highly articulated" : lipSync && lipSync.intensity < 30 ? "subtle" : "natural";
    const expressionStr = lipSync && lipSync.expression > 70 ? "vivid expressions" : lipSync && lipSync.expression < 30 ? "neutral demeanor" : "natural micro-expressions";
    const lipBlinkStr = lipSync && lipSync.blinkRate > 70 ? "frequent blinking" : lipSync && lipSync.blinkRate < 30 ? "steady focus" : "regular blinking";

    let visualPolishPrompt = "";
    if (polish) {
      if (polish.highFidelity) visualPolishPrompt += "Hyper-realistic, cinematic lighting, 8k textures. ";
      const gradePrompts: Record<string, string> = { cinematic: "Cinematic grade. ", warm: "Warm grade. ", cool: "Cool grade. ", vibrant: "Vibrant grade. ", sepia: "Sepia grade. " };
      if (polish.colorGrade !== 'none') visualPolishPrompt += gradePrompts[polish.colorGrade] || "";
      if (polish.grainIntensity > 0) visualPolishPrompt += "Film grain texture. ";
      if (polish.vignette > 0) visualPolishPrompt += "Edge vignette. ";
      if (polish.softFocus > 0) visualPolishPrompt += "Soft focus bokeh. ";
      if (polish.stabilization) {
        const level = polish.stabilizationStrength > 70 ? "Aggressive" : polish.stabilizationStrength < 30 ? "Light" : "Professional";
        visualPolishPrompt += `${level} camera stabilization enabled. Eliminate micro-jitters and ensure gimbal-smooth camera movement. `;
      }
    }

    const prompt = `${visualPolishPrompt}A professional studio video of this person speaking directly to camera. 
      ${voiceContext} 
      ${langContext}
      SCRIPT: "${displayScript}". 
      FACIAL DYNAMICS: ${lipIntensityStr} lip-sync, ${expressionStr}, and ${lipBlinkStr}. 
      The audio and visual performance must be perfectly synchronized to create a lifelike digital human presence.`;

    return await ai.models.generateVideos({
      model: polish?.highFidelity ? APP_CONFIG.MODELS.VIDEO_HQ : APP_CONFIG.MODELS.VIDEO,
      prompt: prompt,
      image: { imageBytes: base64Data, mimeType: mimeType },
      config: { numberOfVideos: 1, resolution: resolution, aspectRatio: '16:9' }
    });
  }

  static async pollOperation(operation: any) {
    const ai = await this.getAI();
    return await ai.operations.getVideosOperation({ operation: operation });
  }

  static async fetchVideoBlob(uri: string): Promise<string> {
    const response = await fetch(`${uri}&key=${process.env.API_KEY}`);
    const blob = await response.blob();
    return URL.createObjectURL(blob);
  }
}
