
import React, { useState, useRef, useEffect } from 'react';
import { Avatar, GenerationStatus, VideoResult, LipSyncConfig, ExportConfig, LanguageSettings, WatermarkConfig, PolishConfig, ScriptSegment, AudioDesignConfig, VoiceDNA } from './types';
import { PUBLIC_AVATARS, SUPPORTED_LANGUAGES, BACKGROUND_MUSIC_TRACKS, SOUND_EFFECTS, VOICE_LIBRARY, CLONE_EXAMPLES } from './constants';
import { GeminiService } from './services/geminiService';
import gifshot from 'gifshot';

const App: React.FC = () => {
  const [selectedAvatar, setSelectedAvatar] = useState<Avatar | null>(PUBLIC_AVATARS[0]);
  const [customAvatar, setCustomAvatar] = useState<string | null>(null);
  const [voiceReference, setVoiceReference] = useState<{ data: string; mimeType: string } | null>(null);
  const [voiceDNA, setVoiceDNA] = useState<VoiceDNA | null>(null);
  const [voiceMode, setVoiceMode] = useState<'cloning' | 'library'>('library');
  const [selectedLibraryVoice, setSelectedLibraryVoice] = useState<string>(VOICE_LIBRARY[0].id);

  const [isAnalyzingVoice, setIsAnalyzingVoice] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [voiceGuidanceActive, setVoiceGuidanceActive] = useState(false);
  
  const [isCondensing, setIsCondensing] = useState(false);
  const [sequenceAnalysis, setSequenceAnalysis] = useState<{ score: number, feedback: string, suggestion: string, pacingMap: string[] } | null>(null);
  const [isAnalyzingSequence, setIsAnalyzingSequence] = useState(false);
  const [isAutoSegmenting, setIsAutoSegmenting] = useState(false);
  
  const [segments, setSegments] = useState<ScriptSegment[]>([{
    id: 'seg-' + Date.now(),
    text: '',
    status: 'idle'
  }]);
  
  const [segmentsHistory, setSegmentsHistory] = useState<ScriptSegment[][]>([[{ id: 'initial', text: '', status: 'idle' }]]);
  const [historyPointer, setHistoryPointer] = useState(0);
  const isUndoRedoing = useRef(false);
  const historyTimeoutRef = useRef<number | null>(null);

  const [activeSegmentIndex, setActiveSegmentIndex] = useState(0);
  const [isGeneratingAll, setIsGeneratingAll] = useState(false);
  const [isPreviewingProject, setIsPreviewingProject] = useState(false);
  
  const [status, setStatus] = useState<GenerationStatus & { type?: 'auth' | 'safety' | 'quota' | 'network' | 'generic' | 'guidance' }>({ state: 'idle' });
  const [videoResult, setVideoResult] = useState<VideoResult | null>(null);
  const [hasApiKey, setHasApiKey] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const [lipSync, setLipSync] = useState<LipSyncConfig>(VOICE_LIBRARY[0].recommendedLipSync);
  const [exportConfig, setExportConfig] = useState<ExportConfig>({ resolution: '720p', format: 'mp4', includeBackgroundAudio: true });
  const [polish, setPolish] = useState<PolishConfig>({ 
    enabled: true, 
    colorGrade: 'none', 
    grainIntensity: 0, 
    vignette: 0, 
    softFocus: 0, 
    highFidelity: false, 
    stabilization: true,
    stabilizationStrength: 50
  });
  const [watermark, setWatermark] = useState<WatermarkConfig>({ enabled: false, text: 'SHARJAYS STUDIO', position: 'bottom-right', opacity: 50 });
  const [audioDesign, setAudioDesign] = useState<AudioDesignConfig>({ bgmUrl: null, bgmVolume: 30, sfxVolume: 50, voiceVolume: 100, isLooping: true, reverbLevel: 0, eqPreset: 'neutral', selectedSfx: null });
  const [langSettings, setLangSettings] = useState<LanguageSettings>({ language: SUPPORTED_LANGUAGES[0].name, accent: SUPPORTED_LANGUAGES[0].accents[0] });

  const [isPreviewingBgm, setIsPreviewingBgm] = useState(false);
  const [isPreviewingSfx, setIsPreviewingSfx] = useState(false);
  const bgmPreviewRef = useRef<HTMLAudioElement | null>(null);
  const sfxPreviewRef = useRef<HTMLAudioElement | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const scriptFileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const voiceSectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    checkKey();
    window.addEventListener('focus', checkKey);
    return () => window.removeEventListener('focus', checkKey);
  }, []);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.volume = audioDesign.voiceVolume / 100;
    }
  }, [audioDesign.voiceVolume, videoResult]);

  useEffect(() => {
    if (!isPreviewingBgm || !audioDesign.bgmUrl) {
      if (bgmPreviewRef.current) {
        bgmPreviewRef.current.pause();
        bgmPreviewRef.current = null;
      }
      return;
    }
    const audio = new Audio(audioDesign.bgmUrl);
    audio.loop = audioDesign.isLooping;
    audio.volume = audioDesign.bgmVolume / 100;
    audio.play().catch(e => {
      console.warn('BGM Preview play blocked:', e);
      setIsPreviewingBgm(false);
    });
    bgmPreviewRef.current = audio;
    return () => {
      audio.pause();
      bgmPreviewRef.current = null;
    };
  }, [isPreviewingBgm, audioDesign.bgmUrl, audioDesign.isLooping]);

  useEffect(() => {
    if (!isPreviewingSfx || !audioDesign.selectedSfx) {
      if (sfxPreviewRef.current) {
        sfxPreviewRef.current.pause();
        sfxPreviewRef.current = null;
      }
      return;
    }
    const audio = new Audio(audioDesign.selectedSfx);
    audio.volume = audioDesign.sfxVolume / 100;
    audio.onended = () => setIsPreviewingSfx(false);
    audio.play().catch(e => {
      console.warn('SFX Preview play blocked:', e);
      setIsPreviewingSfx(false);
    });
    sfxPreviewRef.current = audio;
    return () => {
      audio.pause();
      sfxPreviewRef.current = null;
    };
  }, [isPreviewingSfx, audioDesign.selectedSfx]);

  const pushToHistory = (newSegments: ScriptSegment[], immediate: boolean = true) => {
    if (isUndoRedoing.current) return;
    const commit = () => {
      setSegmentsHistory(prev => {
        const sliced = prev.slice(0, historyPointer + 1);
        const next = [...sliced, JSON.parse(JSON.stringify(newSegments))];
        if (next.length > 50) next.shift();
        setHistoryPointer(next.length - 1);
        return next;
      });
    };
    if (immediate) {
      if (historyTimeoutRef.current) window.clearTimeout(historyTimeoutRef.current);
      commit();
    } else {
      if (historyTimeoutRef.current) window.clearTimeout(historyTimeoutRef.current);
      historyTimeoutRef.current = window.setTimeout(commit, 800);
    }
  };

  const undo = () => {
    if (historyPointer > 0) {
      isUndoRedoing.current = true;
      const prevPointer = historyPointer - 1;
      const prevState = JSON.parse(JSON.stringify(segmentsHistory[prevPointer]));
      setSegments(prevState);
      setHistoryPointer(prevPointer);
      setTimeout(() => isUndoRedoing.current = false, 50);
    }
  };

  const redo = () => {
    if (historyPointer < segmentsHistory.length - 1) {
      isUndoRedoing.current = true;
      const nextPointer = historyPointer + 1;
      const nextState = JSON.parse(JSON.stringify(segmentsHistory[nextPointer]));
      setSegments(nextState);
      setHistoryPointer(nextPointer);
      setTimeout(() => isUndoRedoing.current = false, 50);
    }
  };

  const checkKey = async () => {
    const hasKey = await GeminiService.checkApiKey();
    setHasApiKey(hasKey);
  };

  const handleKeySelection = async () => {
    await GeminiService.selectApiKey();
    setHasApiKey(true);
    if (status.type === 'auth' || status.state === 'error') setStatus({ state: 'idle' });
  };

  const handleAddSegment = () => {
    const newSegment: ScriptSegment = { id: 'seg-' + Date.now(), text: '', status: 'idle' };
    const nextSegments = [...segments, newSegment];
    setSegments(nextSegments);
    pushToHistory(nextSegments);
    setActiveSegmentIndex(nextSegments.length - 1);
  };

  const handleRemoveSegment = (index: number) => {
    if (segments.length <= 1) return;
    const nextSegments = segments.filter((_, i) => i !== index);
    setSegments(nextSegments);
    pushToHistory(nextSegments);
    if (activeSegmentIndex >= nextSegments.length) {
      setActiveSegmentIndex(nextSegments.length - 1);
    }
  };

  const handleAnalyzeCoherence = async () => {
    const allScripts = segments.map(s => s.text).filter(t => t.trim() !== "");
    if (allScripts.length === 0) {
      setStatus({ state: 'error', message: 'Script Empty', errorDetails: 'Please add some text to analyze narrative coherence.' });
      return;
    }
    setIsAnalyzingSequence(true);
    try {
      const result = await GeminiService.analyzeSequenceCoherence(allScripts);
      setSequenceAnalysis(result);
      setStatus({ state: 'idle', message: 'Analysis Complete' });
    } catch (err) {
      const errInfo = GeminiService.mapError(err);
      setStatus({ state: 'error', ...errInfo });
    } finally {
      setIsAnalyzingSequence(false);
    }
  };

  const handleGlobalAutoSplit = async () => {
    const fullText = segments.map(s => s.text).join(' ').trim();
    if (!fullText || fullText.length < 30) {
      setStatus({ state: 'error', message: 'Script Too Short', errorDetails: 'Add more text to your project before running AI Partition.' });
      return;
    }
    setIsAutoSegmenting(true);
    setStatus({ state: 'loading', message: 'Analyzing Project Narrative...', errorDetails: 'Gemini is re-splitting your script into optimal logical segments.' });
    try {
      const chunks = await GeminiService.getIntelligentSegments(fullText);
      if (chunks.length > 0) {
        const nextSegments: ScriptSegment[] = chunks.map((chunk, i) => ({
          id: `seg-${Date.now()}-${i}`,
          text: chunk,
          status: 'idle' as const
        }));
        setSegments(nextSegments);
        pushToHistory(nextSegments);
        setActiveSegmentIndex(0);
        setStatus({ state: 'idle', message: 'Project Re-Partitioned', errorDetails: `Script divided into ${chunks.length} segments.` });
      }
    } catch (err) {
      const errInfo = GeminiService.mapError(err);
      setStatus({ state: 'error', ...errInfo });
    } finally {
      setIsAutoSegmenting(false);
    }
  };

  const handleAutoSegment = async () => {
    const activeText = segments[activeSegmentIndex].text;
    if (!activeText || activeText.length < 20) {
      setStatus({ state: 'error', message: 'Script Too Short', errorDetails: 'Please enter a longer script to use Smart Split.' });
      return;
    }
    setIsAutoSegmenting(true);
    try {
      const chunks = await GeminiService.getIntelligentSegments(activeText);
      if (chunks.length > 1) {
        const splitSegments: ScriptSegment[] = chunks.map((chunk, i) => ({
          id: `seg-${Date.now()}-${i}`,
          text: chunk,
          status: 'idle' as const
        }));
        const nextSegments = [
          ...segments.slice(0, activeSegmentIndex),
          ...splitSegments,
          ...segments.slice(activeSegmentIndex + 1)
        ];
        setSegments(nextSegments);
        pushToHistory(nextSegments);
        setActiveSegmentIndex(activeSegmentIndex);
        setStatus({ state: 'idle', message: 'Script Segmented' });
      }
    } catch (err) {
      const errInfo = GeminiService.mapError(err);
      setStatus({ state: 'error', ...errInfo });
    } finally {
      setIsAutoSegmenting(false);
    }
  };

  const handleCondenseSegment = async () => {
    const activeText = segments[activeSegmentIndex].text;
    if (!activeText || activeText.length < 10) return;
    setIsCondensing(true);
    try {
      const condensedText = await GeminiService.condenseScript(activeText, 10);
      handleUpdateSegment(activeSegmentIndex, condensedText, true);
      setStatus({ state: 'idle', message: 'Script Condensed' });
    } catch (err) {
      const errInfo = GeminiService.mapError(err);
      setStatus({ state: 'error', ...errInfo });
    } finally {
      setIsCondensing(false);
    }
  };

  const handleScriptFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const text = event.target?.result as string;
      if (!text || text.trim().length === 0) {
        setStatus({ state: 'error', message: 'Empty File', errorDetails: 'The uploaded file contains no text.' });
        return;
      }

      setIsAutoSegmenting(true);
      setStatus({ state: 'loading', message: 'Importing & Analyzing Script...', errorDetails: 'Neural engine is partitioning your document into logical performance clips.' });
      
      try {
        const chunks = await GeminiService.getIntelligentSegments(text);
        if (chunks.length > 0) {
          const nextSegments: ScriptSegment[] = chunks.map((chunk, i) => ({
            id: `seg-${Date.now()}-${i}`,
            text: chunk,
            status: 'idle' as const
          }));
          setSegments(nextSegments);
          pushToHistory(nextSegments);
          setActiveSegmentIndex(0);
          setStatus({ state: 'idle', message: 'Script Imported', errorDetails: `Document successfully partitioned into ${chunks.length} clips.` });
        }
      } catch (err) {
        const errInfo = GeminiService.mapError(err);
        setStatus({ state: 'error', ...errInfo });
      } finally {
        setIsAutoSegmenting(false);
        if (scriptFileInputRef.current) scriptFileInputRef.current.value = '';
      }
    };
    reader.readAsText(file);
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      const chunks: Blob[] = [];
      recorder.ondataavailable = e => chunks.push(e.data);
      recorder.onstop = async () => {
        const blob = new Blob(chunks, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.onloadend = () => {
          const data = reader.result as string;
          setVoiceReference({ data, mimeType: 'audio/webm' });
          analyzeClonedVoice(data, 'audio/webm');
        };
        reader.readAsDataURL(blob);
      };
      recorder.start();
      setIsRecording(true);
      setVoiceGuidanceActive(false);
    } catch (e) {
      setStatus({ state: 'error', type: 'network', message: 'Microphone Failure', details: 'Unable to access audio input device.', solution: 'Grant mic permissions in your browser.' });
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      mediaRecorderRef.current.stream.getTracks().forEach(t => t.stop());
    }
  };

  const handleClearCache = () => {
    const initialSegments: ScriptSegment[] = [{ id: 'seg-' + Date.now(), text: '', status: 'idle' }];
    setSegments(initialSegments);
    pushToHistory(initialSegments);
    setActiveSegmentIndex(0);
    setVideoResult(null);
    setVoiceReference(null);
    setVoiceDNA(null);
    setCustomAvatar(null);
    setSequenceAnalysis(null);
    setStatus({ state: 'idle' });
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => { setCustomAvatar(reader.result as string); setSelectedAvatar(null); };
      reader.readAsDataURL(file);
    }
  };

  const handleAudioUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const data = reader.result as string;
        setVoiceReference({ data, mimeType: file.type });
        analyzeClonedVoice(data, file.type);
      };
      reader.readAsDataURL(file);
      setVoiceGuidanceActive(false);
    }
  };

  const analyzeClonedVoice = async (data: string, mimeType: string) => {
    setIsAnalyzingVoice(true);
    const currentText = segments[activeSegmentIndex].text;
    try {
      const dna = await GeminiService.analyzeVoiceReference(data, mimeType);
      setVoiceDNA(dna);
      if (currentText) {
        const syncAnalysis = await GeminiService.analyzeLipSyncAccuracy(data, mimeType, currentText);
        setLipSync({
          intensity: syncAnalysis.recommendedSettings.intensity,
          expression: syncAnalysis.recommendedSettings.expression,
          blinkRate: syncAnalysis.recommendedSettings.blinkRate
        });
      }
      setStatus({ state: 'idle', message: 'Neural Clone Active' });
      return dna;
    } catch (err) {
      const errInfo = GeminiService.mapError(err);
      setStatus({ state: 'error', ...errInfo });
      return null;
    } finally {
      setIsAnalyzingVoice(false);
    }
  };

  const handleUpdateSegment = (index: number, text: string, immediate: boolean = false) => {
    if (segments[index].text === text) return;
    const nextSegments = [...segments];
    nextSegments[index].text = text;
    nextSegments[index].analysis = undefined;
    setSegments(nextSegments);
    pushToHistory(nextSegments, immediate);
  };

  const handleGenerateSegment = async (index: number, isBatch: boolean = false) => {
    if (!hasApiKey) { await handleKeySelection(); return; }
    let effectiveVoiceDNA = voiceDNA;
    if (voiceMode === 'library') {
      const libVoice = VOICE_LIBRARY.find(v => v.id === selectedLibraryVoice);
      if (libVoice) effectiveVoiceDNA = libVoice.dna;
    }
    
    const imageToUse = customAvatar || selectedAvatar?.url;
    const segment = segments[index];
    if (!imageToUse || !segment.text) return;

    try {
      const sCopy = [...segments];
      sCopy[index].status = 'loading';
      sCopy[index].progress = 10;
      setSegments(sCopy);
      
      if (!isBatch) {
        setStatus({ state: 'loading', message: `Synthesizing Part ${index + 1}...` });
      }
      
      let base64Image = imageToUse;
      if (imageToUse.startsWith('http')) {
        const res = await fetch(imageToUse);
        const b = await res.blob();
        base64Image = await new Promise(r => { const fr = new FileReader(); fr.onloadend = () => r(fr.result as string); fr.readAsDataURL(b); });
      }
      
      let op = await GeminiService.generateAvatarVideo(base64Image, segment.text, effectiveVoiceDNA || undefined, lipSync, exportConfig.resolution, 'image/jpeg', langSettings, polish);
      while (!op.done) {
        await new Promise(r => setTimeout(r, 8000));
        op = await GeminiService.pollOperation(op);
        const s = [...segments];
        s[index].status = 'polling';
        s[index].progress = Math.min((s[index].progress || 10) + 5, 95);
        setSegments(s);
      }
      
      if (op.response?.generatedVideos?.[0]?.video?.uri) {
        const url = await GeminiService.fetchVideoBlob(op.response.generatedVideos[0].video.uri);
        const finalS = [...segments];
        finalS[index].videoUrl = url;
        finalS[index].status = 'success';
        setSegments(finalS);
        pushToHistory(finalS);
        
        const res: VideoResult = { 
          url, 
          id: op.name, 
          prompt: segment.text, 
          avatarId: 'custom', 
          resolution: exportConfig.resolution, 
          scriptSnippet: segment.text.substring(0, 50) 
        };
        setVideoResult(res);
        setActiveSegmentIndex(index);
        
        if (!isBatch) setStatus({ state: 'idle' });
      }
    } catch (e) {
      const errInfo = GeminiService.mapError(e);
      const finalS = [...segments];
      finalS[index].status = 'error';
      setSegments(finalS);
      if (!isBatch) {
        setStatus({ state: 'error', ...errInfo });
      } else {
         throw e;
      }
    }
  };

  const handleGenerateAll = async () => {
    if (!hasApiKey) { await handleKeySelection(); return; }
    const someEmpty = segments.some(s => !s.text.trim());
    if (someEmpty) {
      setStatus({ 
        state: 'error', 
        message: 'Incomplete Scripts', 
        errorDetails: 'Ensure all clips have a script segment before initiating a batch generation.' 
      });
      return;
    }

    setIsGeneratingAll(true);
    const total = segments.length;
    
    try {
      for (let i = 0; i < total; i++) {
        if (segments[i].status === 'success' && segments[i].videoUrl) continue;
        setActiveSegmentIndex(i);
        setStatus({ 
          state: 'loading', 
          message: `Batch Synthesis: Processing Part ${i + 1} of ${total}`,
          currentPart: i + 1,
          totalParts: total
        });
        await handleGenerateSegment(i, true);
        if (segments[i].status === 'error') {
          throw new Error(`Synthesis failed at part ${i + 1}`);
        }
      }
      setStatus({ state: 'idle', message: 'Batch synthesis complete' });
    } catch (e) {
      const errInfo = GeminiService.mapError(e);
      setStatus({ 
        state: 'error', 
        ...errInfo,
        message: `Batch Generation Halted at Part ${activeSegmentIndex + 1}`,
        errorDetails: `A synthesis error occurred during a sequential run. Please resolve the issue for this segment and try again.` 
      });
    } finally {
      setIsGeneratingAll(false);
    }
  };

  const handlePlaySequentially = async () => {
    const readySegments = segments.filter(s => !!s.videoUrl);
    if (readySegments.length === 0) {
      setStatus({ state: 'error', message: 'Preview Unavailable', errorDetails: 'Synthesize segments first to enable project preview.' });
      return;
    }

    setIsPreviewingProject(true);
    for (let i = 0; i < segments.length; i++) {
      if (!segments[i].videoUrl) continue;
      
      setActiveSegmentIndex(i);
      setVideoResult({
        url: segments[i].videoUrl!,
        id: segments[i].id,
        prompt: segments[i].text,
        avatarId: 'custom',
        resolution: exportConfig.resolution,
        scriptSnippet: segments[i].text.substring(0, 30)
      });

      await new Promise<void>((resolve) => {
        const v = videoRef.current;
        if (!v) { resolve(); return; }
        v.onended = () => {
          v.onended = null;
          resolve();
        };
        v.play().catch(() => {
          setTimeout(resolve, 3000);
        });
      });
    }
    setIsPreviewingProject(false);
  };

  const handleMasterStitch = async () => {
    const readySegments = segments.filter(s => !!s.videoUrl);
    if (readySegments.length === 0) {
      setStatus({ state: 'error', message: 'No Segments Ready', errorDetails: 'Synthesize at least one segment before generating a master file.' });
      return;
    }
    
    setIsExporting(true);
    setStatus({ state: 'loading', message: 'Initializing Performance Master...', errorDetails: 'Compiling project buffer into a single performance stream.' });

    try {
      const canvas = canvasRef.current!;
      const ctx = canvas.getContext('2d', { alpha: false, desynchronized: true })!;
      
      const width = exportConfig.resolution === '1080p' ? 1920 : 1280;
      const height = exportConfig.resolution === '1080p' ? 1080 : 720;
      canvas.width = width;
      canvas.height = height;
      
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 44100 });
      if (audioCtx.state === 'suspended') await audioCtx.resume();
      
      const mixDest = audioCtx.createMediaStreamDestination();
      const voiceGain = audioCtx.createGain();
      voiceGain.gain.value = audioDesign.voiceVolume / 100;
      voiceGain.connect(mixDest);
      
      let bgmElement: HTMLAudioElement | null = null;
      if (audioDesign.bgmUrl && exportConfig.includeBackgroundAudio && exportConfig.format !== 'gif') {
        bgmElement = new Audio(audioDesign.bgmUrl);
        bgmElement.crossOrigin = "anonymous";
        bgmElement.loop = audioDesign.isLooping;
        bgmElement.volume = audioDesign.bgmVolume / 100;
        const bgmSource = audioCtx.createMediaElementSource(bgmElement);
        bgmSource.connect(mixDest);
      }
      
      const sfxGain = audioCtx.createGain();
      sfxGain.gain.value = audioDesign.sfxVolume / 100;
      sfxGain.connect(mixDest);
      
      const format = exportConfig.format;
      const isGif = format === 'gif';
      const gifFrames: string[] = [];
      let recorder: MediaRecorder | null = null;
      const chunks: Blob[] = [];

      if (!isGif) {
        const canvasStream = canvas.captureStream(30);
        const combinedStream = new MediaStream([
          ...canvasStream.getVideoTracks(),
          ...mixDest.stream.getAudioTracks()
        ]);
        
        const preferredMimes = [
          `video/${format === 'mp4' ? 'mp4' : 'webm'};codecs=h264,opus`,
          `video/webm;codecs=vp9,opus`,
          `video/webm;codecs=vp8,opus`,
          `video/webm`,
        ];
        
        const selectedMime = preferredMimes.find(m => MediaRecorder.isTypeSupported(m)) || '';
        recorder = new MediaRecorder(combinedStream, { 
            mimeType: selectedMime, 
            videoBitsPerSecond: 12000000,
            audioBitsPerSecond: 192000 
        });
        
        recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
        recorder.onstop = () => {
          const blob = new Blob(chunks, { type: selectedMime.split(';')[0] });
          const a = document.createElement('a');
          const blobUrl = URL.createObjectURL(blob);
          a.href = blobUrl;
          a.download = `AvatarMaster_${Date.now()}.${format}`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          
          setIsExporting(false);
          setStatus({ state: 'idle', message: 'Export Successful' });
          if (bgmElement) bgmElement.pause();
          audioCtx.close();
        };
        recorder.start();
      }

      if (bgmElement) await bgmElement.play();
      
      if (audioDesign.selectedSfx && !isGif) {
          const sfxAudio = new Audio(audioDesign.selectedSfx);
          sfxAudio.crossOrigin = "anonymous";
          const sfxSource = audioCtx.createMediaElementSource(sfxAudio);
          sfxSource.connect(sfxGain);
          sfxAudio.play();
      }

      for (let i = 0; i < readySegments.length; i++) {
        const seg = readySegments[i];
        setStatus({ 
          state: 'loading', 
          message: `Mastering Part ${i + 1} of ${readySegments.length}`,
          currentPart: i + 1,
          totalParts: readySegments.length
        });
        
        const v = document.createElement('video');
        v.src = seg.videoUrl!;
        v.crossOrigin = "anonymous";
        v.preload = 'auto';
        v.muted = false; 
        v.volume = 1.0; 

        await new Promise<void>((resolve) => {
          let sourceNode: MediaElementAudioSourceNode | null = null;
          
          v.onloadedmetadata = () => {
            if (!isGif) {
              sourceNode = audioCtx.createMediaElementSource(v);
              sourceNode.connect(voiceGain);
            }
            v.play().catch(e => {
                console.error("Master Playback Blocked:", e);
                resolve();
            });
          };

          const drawLoop = () => {
            if (v.paused || v.ended) {
              if (sourceNode) sourceNode.disconnect();
              resolve();
              return;
            }
            
            ctx.drawImage(v, 0, 0, width, height);
            
            if (watermark.enabled && watermark.text) {
              ctx.save();
              const padding = 40;
              const fontSize = Math.floor(width / 40);
              ctx.font = `bold ${fontSize}px Inter, sans-serif`;
              ctx.fillStyle = `rgba(255, 255, 255, ${watermark.opacity / 100})`;
              const metrics = ctx.measureText(watermark.text);
              let x = padding;
              let y = padding + fontSize;
              if (watermark.position === 'top-right') x = width - metrics.width - padding;
              else if (watermark.position === 'bottom-left') y = height - padding;
              else if (watermark.position === 'bottom-right') { x = width - metrics.width - padding; y = height - padding; }
              ctx.fillText(watermark.text, x, y);
              ctx.restore();
            }
            
            if (isGif && v.currentTime % 0.1 < 0.05) {
              gifFrames.push(canvas.toDataURL('image/jpeg', 0.8));
            }
            requestAnimationFrame(drawLoop);
          };
          
          v.onplaying = () => requestAnimationFrame(drawLoop);
          v.onerror = (e) => {
              console.error("Segment Loading Error:", e);
              resolve();
          };
          v.load();
        });
      }

      if (isGif) {
        setStatus({ state: 'loading', message: 'Encoding Animation Matrix...' });
        gifshot.createGIF({
          images: gifFrames,
          gifWidth: width / 2,
          gifHeight: height / 2,
          interval: 0.1,
          numFrames: gifFrames.length,
          frameDuration: 1
        }, (obj: any) => {
          if (!obj.error) {
            const a = document.createElement('a');
            a.href = obj.image;
            a.download = `AvatarMaster_${Date.now()}.gif`;
            a.click();
            setStatus({ state: 'idle', message: 'GIF Rendered' });
          } else {
            setStatus({ state: 'error', message: 'GIF Fault', errorDetails: obj.error });
          }
          setIsExporting(false);
          audioCtx.close();
        });
      } else {
        setTimeout(() => {
          if (recorder && recorder.state !== 'inactive') {
            recorder.stop();
          }
        }, 1000);
      }
    } catch (e) { 
      const errInfo = GeminiService.mapError(e);
      setStatus({ state: 'error', ...errInfo });
      setIsExporting(false); 
    }
  };

  const handleVoiceLibrarySelection = (voiceId: string) => {
    setSelectedLibraryVoice(voiceId);
    const voice = VOICE_LIBRARY.find(v => v.id === voiceId);
    if (voice) {
      setLipSync(voice.recommendedLipSync);
      setStatus({ 
        state: 'idle', 
        message: 'Personality Synced', 
        errorDetails: `Avatar expressions matched to ${voice.name}'s vocal style.` 
      });
    }
  };

  const somePartsReady = segments.some(s => !!s.videoUrl);

  return (
    <div className="min-h-screen p-4 md:p-8 flex flex-col items-center bg-slate-950 text-slate-200">
      {status.state !== 'idle' && (
        <div className={`fixed top-24 left-1/2 -translate-x-1/2 z-[9999] w-full max-w-lg px-4 animate-bounce-soft`}>
          <div className={`p-4 rounded-2xl shadow-2xl flex flex-col gap-3 border backdrop-blur-xl ${
            status.state === 'error' 
              ? (status.type === 'quota' ? 'bg-amber-500/20 border-amber-500/40 text-amber-200' : 'bg-red-500/20 border-red-500/40 text-red-200')
              : 'bg-emerald-500/20 border-emerald-500/40 text-emerald-200'
          }`}>
            <div className="flex items-start gap-4">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                status.state === 'error' ? (status.type === 'quota' ? 'bg-amber-500' : 'bg-red-500') : 'bg-emerald-500'
              }`}>
                {status.state === 'loading' || status.state === 'polling' ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    {status.state === 'error' ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /> : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />}
                  </svg>
                )}
              </div>
              <div className="flex-1">
                <h3 className="font-black text-sm uppercase tracking-widest">{status.message || (status.state === 'error' ? 'Synthesis Interrupted' : 'Processing')}</h3>
                <p className="text-xs opacity-90 font-medium leading-relaxed mt-0.5">{status.errorDetails || 'Neural Core is busy...'}</p>
              </div>
            </div>
            {status.totalParts && status.currentPart && (
              <div className="w-full space-y-1.5">
                <div className="flex justify-between items-center text-[8px] font-black uppercase tracking-widest opacity-60">
                  <span>Progress</span>
                  <span>{status.currentPart} / {status.totalParts}</span>
                </div>
                <div className="w-full h-1.5 bg-black/30 rounded-full overflow-hidden border border-white/5">
                  <div 
                    className="h-full bg-emerald-500 transition-all duration-700 ease-out shadow-[0_0_8px_rgba(16,185,129,0.6)]" 
                    style={{ width: `${(status.currentPart / status.totalParts) * 100}%` }} 
                  />
                </div>
              </div>
            )}
            {status.solution && (
              <div className="p-2 bg-black/20 rounded-lg">
                <span className="text-[9px] font-black uppercase tracking-widest block mb-1 opacity-60">Recommended Action:</span>
                <p className="text-[10px] font-bold">{status.solution}</p>
              </div>
            )}
            <button onClick={() => setStatus({ state: 'idle' })} className="self-end text-[10px] font-black uppercase bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-lg transition-all border border-white/10">Dismiss</button>
          </div>
        </div>
      )}

      <div className="fixed top-4 right-4 z-[9999] pointer-events-auto">
        <div onClick={handleKeySelection} className={`flex items-center gap-2.5 px-4 py-2.5 rounded-2xl border backdrop-blur-xl transition-all duration-300 cursor-pointer hover:scale-105 active:scale-95 shadow-2xl ${hasApiKey ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-red-500/10 border-red-500/30'}`}>
          <div className="relative flex h-3 w-3">
            <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${hasApiKey ? 'bg-emerald-400' : 'bg-red-400'}`}></span>
            <span className={`relative inline-flex rounded-full h-3 w-3 ${hasApiKey ? 'bg-emerald-500' : 'bg-red-500'}`}></span>
          </div>
          <div className="flex flex-col">
            <span className={`text-[9px] font-black uppercase tracking-[0.2em] mb-0.5 ${hasApiKey ? 'text-emerald-400' : 'text-red-400'}`}>{hasApiKey ? 'Gemini Auth Active' : 'Neural Core Offline'}</span>
          </div>
        </div>
      </div>

      <header className="w-full max-w-6xl mb-12 text-center">
        <h1 className="text-5xl font-black bg-gradient-to-r from-blue-400 via-indigo-400 to-emerald-400 bg-clip-text text-transparent mb-4 tracking-tight">SHARJAYS Avatar Studio</h1>
        <p className="text-slate-400 font-medium tracking-widest uppercase text-[10px] opacity-60">Neural Script Clipping & Voice DNA Synthesis</p>
      </header>

      <main className="w-full max-w-6xl grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-5 space-y-6">
          <section ref={voiceSectionRef} className={`glass-panel p-6 rounded-3xl shadow-2xl transition-all duration-500 ${voiceGuidanceActive ? 'ring-4 ring-emerald-500 scale-[1.02] border-emerald-500/40 bg-emerald-500/5' : 'border-white/5 hover:border-white/10'}`}>
            <h2 className="text-sm font-black uppercase tracking-widest text-blue-400 mb-6 flex items-center gap-2">
              <span className={`w-1.5 h-1.5 rounded-full shadow-[0_0_8px_rgba(96,165,250,0.6)] ${voiceGuidanceActive ? 'bg-emerald-400 animate-pulse' : 'bg-blue-400'}`} /> 
              Persona Configuration
            </h2>
            <div className="space-y-2 mb-8">
              <label className="text-[9px] font-black uppercase tracking-widest text-slate-500">Visual Identity</label>
              <div className="grid grid-cols-4 gap-3">
                <button onClick={() => fileInputRef.current?.click()} className="col-span-1 aspect-square rounded-2xl border-2 border-dashed border-slate-700 hover:border-blue-500 hover:bg-blue-500/5 focus:outline-none flex items-center justify-center transition-all duration-300 bg-slate-900 overflow-hidden relative group active:scale-95">
                  {customAvatar ? <img src={customAvatar} className="w-full h-full object-cover" alt="Custom Avatar" /> : <span className="text-2xl opacity-20 group-hover:opacity-100 group-hover:scale-125 transition-all">+</span>}
                </button>
                {PUBLIC_AVATARS.map(a => (
                  <button key={a.id} onClick={() => { setSelectedAvatar(a); setCustomAvatar(null); }} className={`aspect-square rounded-2xl border-2 transition-all duration-300 overflow-hidden focus:outline-none ${selectedAvatar?.id === a.id ? 'border-blue-500 scale-95 shadow-[0_0_20px_rgba(59,130,246,0.3)]' : 'border-transparent opacity-50 hover:opacity-100 hover:scale-[1.02]'}`}>
                    <img src={a.url} className="w-full h-full object-cover" alt={a.name} />
                  </button>
                ))}
              </div>
              <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleFileUpload} />
            </div>
            <div className="space-y-6 pt-4 border-t border-slate-800">
              <div className="flex items-center justify-between mb-2">
                <label className="text-[9px] font-black uppercase tracking-widest text-slate-500">Vocal Identity</label>
                <div className="flex bg-slate-900 p-1 rounded-xl border border-slate-800">
                  <button onClick={() => setVoiceMode('library')} className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase transition-all ${voiceMode === 'library' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}>Library</button>
                  <button onClick={() => setVoiceMode('cloning')} className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase transition-all ${voiceMode === 'cloning' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}>Cloning</button>
                </div>
              </div>
              {voiceMode === 'library' ? (
                <div className="grid grid-cols-2 gap-3 animate-fade-in">
                  {VOICE_LIBRARY.map(v => (
                    <button 
                      key={v.id} 
                      onClick={() => handleVoiceLibrarySelection(v.id)}
                      className={`p-3 rounded-2xl border text-left transition-all duration-300 hover:-translate-y-1 active:scale-95 ${selectedLibraryVoice === v.id ? 'bg-indigo-600/10 border-indigo-500 shadow-[0_0_15px_rgba(79,70,229,0.2)]' : 'bg-slate-900 border-slate-800 hover:border-slate-700'}`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <div className={`w-2 h-2 rounded-full ${v.gender === 'male' ? 'bg-blue-400' : 'bg-pink-400'}`} />
                        <span className="text-[10px] font-black uppercase tracking-wider">{v.name}</span>
                      </div>
                      <p className="text-[8px] text-slate-500 font-bold leading-tight">{v.description}</p>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="space-y-4 animate-fade-in">
                  {!voiceReference && !isAnalyzingVoice && !isRecording && (
                    <div className={`p-5 rounded-2xl border-2 border-dashed transition-all duration-500 flex flex-col items-center gap-4 text-center ${voiceGuidanceActive ? 'border-emerald-500 bg-emerald-500/10' : 'border-slate-800 bg-black/20'}`}>
                      <div className="flex items-center justify-center relative">
                        <div className={`w-14 h-14 rounded-full flex items-center justify-center bg-slate-900 border border-slate-700 ${voiceGuidanceActive ? 'animate-bounce shadow-[0_0_20px_rgba(16,185,129,0.4)] border-emerald-500' : ''}`}>
                           <svg className={`w-7 h-7 ${voiceGuidanceActive ? 'text-emerald-400' : 'text-slate-500'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>
                        </div>
                        {voiceGuidanceActive && (
                          <div className="absolute -inset-2 rounded-full border-2 border-emerald-500/20 animate-ping" />
                        )}
                      </div>
                      <div>
                        <h4 className="text-[11px] font-black uppercase tracking-widest text-slate-300">Start Neural Acquisition</h4>
                        <p className="text-[9px] text-slate-500 font-bold max-w-[240px] mt-2 leading-relaxed">Clone any voice with a 15-30s sample. Ensure the environment is silent for forensic-grade cloning.</p>
                      </div>
                      <div className="w-full space-y-3 pt-2 border-t border-white/5">
                        <span className="text-[8px] font-black uppercase tracking-widest text-slate-600 block text-left">Quality References</span>
                        <div className="flex gap-2">
                          {CLONE_EXAMPLES.map(ex => (
                            <button key={ex.id} onClick={() => new Audio(ex.url).play()} className="flex-1 px-3 py-2 bg-slate-900/50 border border-slate-800 rounded-xl text-[8px] font-black text-slate-400 hover:bg-slate-800 hover:text-emerald-400 transition-all flex items-center justify-center gap-2 group">
                              <svg className="w-2.5 h-2.5 opacity-40 group-hover:opacity-100 transition-opacity" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" /></svg>
                              <span>{ex.name}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                  <div className="flex gap-2">
                    <button onClick={() => audioInputRef.current?.click()} disabled={isAnalyzingVoice || isRecording} className={`flex-1 py-4 rounded-2xl border-2 transition-all duration-500 flex flex-col items-center justify-center gap-1 focus:outline-none ${voiceReference ? 'border-emerald-500 bg-emerald-500/10 text-emerald-400' : (voiceGuidanceActive ? 'border-emerald-500 bg-emerald-500/10 text-emerald-400 border-dashed animate-pulse-fast' : 'border-slate-800 border-dashed hover:border-emerald-400 hover:bg-emerald-500/10 text-slate-500')} active:scale-95 shadow-lg group`}>
                      <span className="text-[10px] font-black uppercase tracking-widest">{voiceReference ? 'Sample Linked' : 'Upload Audio'}</span>
                      {!voiceReference && <span className="text-[7px] font-bold opacity-0 group-hover:opacity-100 transition-opacity">MP3, WAV, M4A</span>}
                    </button>
                    <button onClick={isRecording ? stopRecording : startRecording} disabled={isAnalyzingVoice} className={`flex-1 py-4 rounded-2xl border-2 transition-all duration-500 flex flex-col items-center justify-center gap-1 focus:outline-none ${isRecording ? 'border-red-500 bg-red-500/10 text-red-400 animate-pulse' : (voiceGuidanceActive ? 'border-emerald-500 bg-emerald-500/10 text-emerald-400 border-dashed animate-pulse-fast' : 'border-slate-800 border-dashed hover:border-red-400 hover:bg-red-500/10 text-slate-500')} active:scale-95 shadow-lg`}>
                      <span className="text-[10px] font-black uppercase tracking-widest">{isRecording ? 'Capturing...' : 'Record Mic'}</span>
                      {isRecording && <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-ping mt-0.5" />}
                    </button>
                  </div>
                  {(isRecording || isAnalyzingVoice) && (
                    <div className="flex items-center justify-center gap-1 h-8 animate-fade-in py-2">
                       {[1,2,3,4,5,6,7,8,9,10,11,12].map(i => (
                         <div key={i} className={`w-1 rounded-full ${isRecording ? 'bg-red-500' : 'bg-blue-400'} animate-visualizer`} style={{ animationDelay: `${i * 0.05}s`, height: '20%' }} />
                       ))}
                    </div>
                  )}
                  {voiceReference && (
                    <div className="flex items-center gap-3 p-3 bg-slate-900 border border-slate-800 rounded-xl shadow-inner animate-fade-in">
                      <span className="text-[8px] font-black uppercase text-slate-500 flex-1 truncate">Input Signature: {voiceReference.mimeType.split('/')[1]}</span>
                      <audio src={voiceReference.data} controls className="h-6 max-w-[120px] focus:outline-none opacity-50" />
                    </div>
                  )}
                  {isAnalyzingVoice && (
                    <div className="flex flex-col items-center gap-3 p-4 bg-blue-500/5 border border-blue-500/20 rounded-2xl animate-pulse">
                      <span className="text-[9px] font-black text-blue-400 uppercase tracking-widest">Profiling Neural Signatures...</span>
                    </div>
                  )}
                  {voiceDNA && !isAnalyzingVoice && (
                    <div className="p-4 rounded-2xl bg-emerald-500/5 border border-emerald-500/20 space-y-4 shadow-lg animate-fade-in">
                      <div className="flex items-center justify-between">
                        <span className="text-[9px] font-black uppercase tracking-widest text-emerald-400">Neural Voice Profile</span>
                        <button onClick={() => {setVoiceDNA(null); setVoiceReference(null);}} className="text-[8px] font-black text-slate-500 hover:text-red-400 uppercase transition-colors">Reset Signature</button>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="bg-black/30 p-2 rounded-xl border border-white/5"><span className="text-[7px] font-black text-slate-500 uppercase block mb-0.5">Pitch</span><span className="text-[10px] font-bold text-slate-300 truncate">{voiceDNA.pitch}</span></div>
                        <div className="bg-black/30 p-2 rounded-xl border border-white/5"><span className="text-[7px] font-black text-slate-500 uppercase block mb-0.5">Resonance</span><span className="text-[10px] font-bold text-slate-300 truncate">{voiceDNA.resonance}</span></div>
                        <div className="bg-black/30 p-2 rounded-xl border border-white/5"><span className="text-[7px] font-black text-slate-500 uppercase block mb-0.5">Pacing</span><span className="text-[10px] font-bold text-slate-300 truncate">{voiceDNA.speed}</span></div>
                        <div className="bg-black/30 p-2 rounded-xl border border-white/5"><span className="text-[7px] font-black text-slate-500 uppercase block mb-0.5">Base Emotion</span><span className="text-[10px] font-bold text-slate-300 truncate">{voiceDNA.emotionalBase}</span></div>
                      </div>
                      <div className="bg-black/30 p-3 rounded-xl border border-white/5 shadow-inner">
                         <span className="text-[7px] font-black text-slate-500 uppercase block mb-1">Extracted Fingerprint</span>
                         <p className="text-[9px] text-slate-400 italic leading-snug">"{voiceDNA.fingerprint}"</p>
                      </div>
                      <div className="flex items-center gap-2 px-1">
                        <div className="flex-1 h-0.5 bg-emerald-500/20 rounded-full overflow-hidden">
                          <div className="h-full bg-emerald-500 animate-[loading_2s_ease-in-out_infinite]" style={{ width: '40%' }} />
                        </div>
                        <span className="text-[7px] font-black text-emerald-500 uppercase tracking-widest animate-pulse">Signature Verified</span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
            <input type="file" ref={audioInputRef} className="hidden" accept="audio/*" onChange={handleAudioUpload} />
          </section>

          <section className="glass-panel p-6 rounded-3xl shadow-2xl border-white/5 hover:border-white/10 transition-all duration-500">
            <h2 className="text-sm font-black uppercase tracking-widest text-indigo-400 mb-6 flex items-center gap-2"><span className="w-1.5 h-1.5 bg-indigo-400 rounded-full shadow-[0_0_8px_rgba(129,140,248,0.6)]" /> Narrative Intelligence</h2>
            <div className="space-y-4">
              <button onClick={handleAnalyzeCoherence} disabled={isAnalyzingSequence || isAutoSegmenting || isCondensing} className={`w-full py-4 bg-indigo-600/10 border border-indigo-500/30 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all duration-300 focus:outline-none ${isAnalyzingSequence ? 'opacity-50 animate-pulse' : 'hover:bg-indigo-600/20 hover:border-indigo-400 hover:scale-[1.01] active:scale-[0.99]'}`}>{isAnalyzingSequence ? 'Synthesizing Narrative Data...' : 'Analyze Script Coherence'}</button>
              {sequenceAnalysis && (
                <div className="animate-fade-in space-y-6">
                  <div className="flex items-center gap-4 bg-black/40 p-4 rounded-2xl border border-white/5">
                    <div className="relative w-16 h-16 flex items-center justify-center">
                      <svg className="w-full h-full transform -rotate-90"><circle cx="32" cy="32" r="28" fill="none" stroke="currentColor" strokeWidth="4" className="text-slate-800" /><circle cx="32" cy="32" r="28" fill="none" stroke="currentColor" strokeWidth="4" strokeDasharray={176} strokeDashoffset={176 - (176 * sequenceAnalysis.score) / 100} className={`${sequenceAnalysis.score > 70 ? 'text-emerald-400' : 'text-amber-400'} transition-all duration-1000`} /></svg>
                      <span className="absolute text-xs font-black">{sequenceAnalysis.score}</span>
                    </div>
                    <div className="flex-1">
                      <span className="text-[9px] font-black uppercase tracking-widest text-slate-500 block mb-1">Narrative Health</span>
                      <p className="text-[10px] text-slate-300 font-medium leading-tight line-clamp-2">{sequenceAnalysis.feedback}</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </section>

          <section className="glass-panel p-6 rounded-3xl shadow-2xl border-white/5 hover:border-white/10 transition-all duration-500">
            <h2 className="text-sm font-black uppercase tracking-widest text-amber-400 mb-6 flex items-center gap-2"><span className="w-1.5 h-1.5 bg-amber-400 rounded-full shadow-[0_0_8px_rgba(251,191,36,0.6)]" /> Visual Polish & Grading</h2>
            <div className="space-y-6">
              <div className="flex items-center justify-between p-3 bg-amber-400/5 border border-amber-400/20 rounded-2xl">
                <span className="text-[10px] font-black uppercase tracking-widest text-amber-200">Cinematic Engine</span>
                <button onClick={() => setPolish(prev => ({ ...prev, enabled: !prev.enabled }))} className={`w-10 h-5 rounded-full transition-all duration-300 relative ${polish.enabled ? 'bg-amber-500' : 'bg-slate-800'}`}><div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all duration-300 ${polish.enabled ? 'left-6' : 'left-1'}`} /></button>
              </div>
              <div className={`space-y-6 transition-all duration-500 ${polish.enabled ? 'opacity-100' : 'opacity-30 pointer-events-none'}`}>
                <div className="space-y-2">
                  <label className="text-[9px] font-black uppercase tracking-widest text-slate-500">Color Grading Preset</label>
                  <div className="grid grid-cols-3 gap-2">{(['none', 'cinematic', 'warm', 'cool', 'vibrant', 'sepia'] as const).map((grade) => (<button key={grade} onClick={() => setPolish(prev => ({ ...prev, colorGrade: grade }))} className={`py-2 px-1 rounded-xl text-[8px] font-black uppercase border transition-all duration-300 ${polish.colorGrade === grade ? 'bg-amber-500/20 border-amber-500 text-amber-200' : 'bg-slate-900 border-slate-800 text-slate-500 hover:border-slate-600'}`}>{grade}</button>))}</div>
                </div>
                <div className="grid grid-cols-1 gap-4">
                  <div className="space-y-2"><div className="flex justify-between items-center"><label className="text-[9px] font-black uppercase tracking-widest text-slate-500">Film Grain</label><span className="text-[10px] font-bold text-amber-400">{polish.grainIntensity}%</span></div><input type="range" min="0" max="100" value={polish.grainIntensity} onChange={e => setPolish(prev => ({ ...prev, grainIntensity: parseInt(e.target.value) }))} className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-500" /></div>
                  <div className="space-y-2"><div className="flex justify-between items-center"><label className="text-[9px] font-black uppercase tracking-widest text-slate-500">Edge Vignette</label><span className="text-[10px] font-bold text-amber-400">{polish.vignette}%</span></div><input type="range" min="0" max="100" value={polish.vignette} onChange={e => setPolish(prev => ({ ...prev, vignette: parseInt(e.target.value) }))} className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-500" /></div>
                  <div className="space-y-2"><div className="flex justify-between items-center"><label className="text-[9px] font-black uppercase tracking-widest text-slate-500">Soft Focus</label><span className="text-[10px] font-bold text-amber-400">{polish.softFocus}%</span></div><input type="range" min="0" max="100" value={polish.softFocus} onChange={e => setPolish(prev => ({ ...prev, softFocus: parseInt(e.target.value) }))} className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-500" /></div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="flex items-center gap-3 p-3 bg-black/40 rounded-2xl border border-white/5">
                    <input type="checkbox" id="hq" checked={polish.highFidelity} onChange={e => setPolish(prev => ({ ...prev, highFidelity: e.target.checked }))} className="w-4 h-4 rounded bg-slate-900 border-slate-800 text-amber-500 focus:ring-amber-500" />
                    <label htmlFor="hq" className="text-[9px] font-black uppercase tracking-widest text-slate-400 cursor-pointer">8K Rendering</label>
                  </div>
                  <div className="flex items-center gap-3 p-3 bg-black/40 rounded-2xl border border-white/5">
                    <input type="checkbox" id="stabilization" checked={polish.stabilization} onChange={e => setPolish(prev => ({ ...prev, stabilization: e.target.checked }))} className="w-4 h-4 rounded bg-slate-900 border-slate-800 text-amber-500 focus:ring-amber-500" />
                    <div className="flex flex-col">
                      <label htmlFor="stabilization" className="text-[9px] font-black uppercase tracking-widest text-slate-400 cursor-pointer">AI Stabilization</label>
                      <span className="text-[7px] text-slate-500 font-bold uppercase">Smooth Camera Jitter</span>
                    </div>
                  </div>
                </div>
                {polish.stabilization && (
                  <div className="space-y-2 pt-2 animate-fade-in">
                    <div className="flex justify-between items-center">
                      <label className="text-[9px] font-black uppercase tracking-widest text-slate-500">Stabilization Strength</label>
                      <span className="text-[10px] font-bold text-amber-400">{polish.stabilizationStrength}%</span>
                    </div>
                    <input type="range" min="0" max="100" value={polish.stabilizationStrength} onChange={e => setPolish(prev => ({ ...prev, stabilizationStrength: parseInt(e.target.value) }))} className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-500" />
                  </div>
                )}
              </div>
            </div>
          </section>

          <section className="glass-panel p-6 rounded-3xl shadow-2xl border-white/5 hover:border-white/10 transition-all duration-500">
            <h2 className="text-sm font-black uppercase tracking-widest text-pink-400 mb-6 flex items-center gap-2"><span className="w-1.5 h-1.5 bg-pink-400 rounded-full shadow-[0_0_8px_rgba(236,72,153,0.6)]" /> Animation Dynamics</h2>
            <div className="space-y-6">
              <div className="space-y-2"><div className="flex justify-between items-center"><label className="text-[9px] font-black uppercase tracking-widest text-slate-500">Lip-Sync Intensity</label><span className="text-[10px] font-bold text-pink-400">{lipSync.intensity}%</span></div><input type="range" min="0" max="100" value={lipSync.intensity} onChange={e => setLipSync(prev => ({ ...prev, intensity: parseInt(e.target.value) }))} className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-pink-500 transition-all" /></div>
              <div className="space-y-2"><div className="flex justify-between items-center"><label className="text-[9px] font-black uppercase tracking-widest text-slate-500">Facial Expression</label><span className="text-[10px] font-bold text-pink-400">{lipSync.expression}%</span></div><input type="range" min="0" max="100" value={lipSync.expression} onChange={e => setLipSync(prev => ({ ...prev, expression: parseInt(e.target.value) }))} className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-pink-500 transition-all" /></div>
            </div>
          </section>
        </div>

        <div className="lg:col-span-7 space-y-6">
          <section className="glass-panel p-6 rounded-3xl shadow-2xl border-white/5 hover:border-white/10 transition-all duration-500">
            <div className="flex items-center justify-between mb-6">
                <h2 className="text-sm font-black uppercase tracking-widest text-indigo-400 flex items-center gap-2"><span className="w-1.5 h-1.5 bg-indigo-400 rounded-full shadow-[0_0_8px_rgba(129,140,248,0.6)]" /> Neural Scripting</h2>
                <div className="flex gap-2">
                    <button onClick={() => scriptFileInputRef.current?.click()} disabled={isAutoSegmenting} className="p-2 bg-slate-900 border border-slate-800 rounded-xl transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 hover:bg-indigo-600/10 hover:text-indigo-400 hover:scale-105 active:scale-95 group relative" title="Upload Script File (.txt, .md)">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
                      <input type="file" ref={scriptFileInputRef} className="hidden" accept=".txt,.md" onChange={handleScriptFileUpload} />
                    </button>
                    <button onClick={handleGlobalAutoSplit} disabled={isAutoSegmenting} className={`p-2 bg-slate-900 border border-slate-800 rounded-xl transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 hover:bg-indigo-600/10 hover:text-indigo-400 hover:scale-105 active:scale-95 group relative`} title="Global AI Script Partition"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.183.244l-.28.14a2 2 0 01-2.983-1.22l-1.012-3.036a2 2 0 01.326-1.92l.142-.185a2 2 0 00.354-1.218V5.5a2 2 0 012-2h.5a2 2 0 001.218-.354l.185-.142a2 2 0 011.92-.326l3.036 1.012a2 2 0 011.22 2.983l-.14.28a2 2 0 00-.244 1.183l.388 1.938a6 6 0 01-.517 3.86l-.158.318a6 6 0 00-.517 3.86l.477 2.387c.056.279.24.514.503.633a2 2 0 001.92-.326l.185-.142a2 2 0 011.218-.354h.5a2 2 0 001.218-.354l.185-.142a2 2 0 011.92-.326l3.036 1.012a2 2 0 011.22 2.983l-.14.28z" /></svg><div className="absolute -top-1 -right-1 w-2 h-2 bg-indigo-500 rounded-full animate-ping group-hover:scale-150 transition-all"></div></button>
                    <button onClick={undo} disabled={historyPointer <= 0} className={`p-2 bg-slate-900 border border-slate-800 rounded-xl transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 ${historyPointer <= 0 ? 'opacity-20 cursor-not-allowed' : 'hover:bg-slate-800 hover:text-indigo-400 hover:scale-105 active:scale-95'}`} title="Undo Script Change"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" /></svg></button>
                    <button onClick={redo} disabled={historyPointer >= segmentsHistory.length - 1} className={`p-2 bg-slate-900 border border-slate-800 rounded-xl transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 ${historyPointer >= segmentsHistory.length - 1 ? 'opacity-20 cursor-not-allowed' : 'hover:bg-slate-800 hover:text-indigo-400 hover:scale-105 active:scale-95'}`} title="Redo Script Change"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 10h-10a8 8 0 00-8 8v2m18-10l-6 6m6-6l-6-6" /></svg></button>
                </div>
            </div>
            <div className="space-y-4">
              <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide items-center">
                {segments.map((s, i) => (
                  <button 
                    key={s.id} 
                    onClick={() => {
                      setActiveSegmentIndex(i);
                      if (s.videoUrl) {
                        setVideoResult({
                          url: s.videoUrl,
                          id: s.id,
                          prompt: s.text,
                          avatarId: 'custom',
                          resolution: exportConfig.resolution,
                          scriptSnippet: s.text.substring(0, 30)
                        });
                      }
                    }} 
                    className={`px-4 py-2 rounded-xl text-[10px] font-black transition-all duration-300 flex-shrink-0 border focus:outline-none flex items-center gap-2 ${activeSegmentIndex === i ? 'bg-indigo-600 border-indigo-500 shadow-[0_4px_12px_rgba(79,70,229,0.3)] scale-100' : 'bg-slate-900 text-slate-500 border-slate-800 hover:bg-slate-800 hover:text-slate-300 hover:scale-105 active:scale-95'}`}
                  >
                    <span>CLIP {i+1}</span>
                    {s.status === 'loading' || s.status === 'polling' ? (
                      <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
                    ) : s.status === 'success' ? (
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    ) : s.status === 'error' ? (
                      <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
                    ) : null}
                  </button>
                ))}
                <button onClick={handleAddSegment} className="w-8 h-8 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-400 hover:bg-slate-800 hover:text-indigo-400 hover:scale-110 active:scale-90 transition-all duration-200" title="Add Segment"><span className="text-lg font-bold">+</span></button>
              </div>
              <div className="relative group/textarea">
                <textarea value={segments[activeSegmentIndex].text} onChange={e => handleUpdateSegment(activeSegmentIndex, e.target.value)} placeholder="Enter script segment..." className="w-full h-44 bg-black/40 border border-slate-800 rounded-2xl p-4 text-xs leading-relaxed focus:border-indigo-500 outline-none transition-all duration-300 resize-none font-medium shadow-inner" />
                <div className="absolute top-2 right-2 flex gap-2 opacity-60 group-hover/textarea:opacity-100 transition-opacity duration-300">
                  <button onClick={handleAutoSegment} disabled={isAutoSegmenting || !segments[activeSegmentIndex].text} className={`p-1.5 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 rounded-lg transition-all duration-200 hover:scale-110 active:scale-90 ${isAutoSegmenting ? 'animate-pulse opacity-50' : ''}`} title="Smart Split"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg></button>
                  <button onClick={handleCondenseSegment} disabled={isCondensing || !segments[activeSegmentIndex].text || segments[activeSegmentIndex].text.length < 10} className={`p-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 rounded-lg transition-all duration-200 hover:scale-110 active:scale-90 ${isCondensing ? 'animate-pulse opacity-50' : ''}`} title="Condense"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 13l-7 7-7-7m14-8l-7 7-7-7" /></svg></button>
                  {segments.length > 1 && (<button onClick={() => handleRemoveSegment(activeSegmentIndex)} className="p-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-lg transition-all duration-200 hover:scale-110 active:scale-90" title="Remove Segment"><svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg></button>)}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <button 
                  onClick={handleGenerateAll} 
                  disabled={isGeneratingAll || isAnalyzingVoice || isAutoSegmenting || isCondensing} 
                  className={`py-4 bg-indigo-600 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all duration-300 focus:outline-none flex items-center justify-center gap-3 ${isGeneratingAll ? 'opacity-50' : 'hover:bg-indigo-500 hover:scale-[1.01] active:scale-[0.99] shadow-xl shadow-indigo-500/20'}`}
                >
                  {isGeneratingAll ? (
                    <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /><span>Processing CLIP {activeSegmentIndex + 1}...</span></>
                  ) : (
                    <span>Generate All</span>
                  )}
                </button>
                <button 
                  onClick={handlePlaySequentially} 
                  disabled={!somePartsReady || isPreviewingProject} 
                  className={`py-4 bg-slate-800 border border-slate-700 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all duration-300 focus:outline-none flex items-center justify-center gap-3 ${isPreviewingProject ? 'opacity-50' : 'hover:bg-slate-700 hover:scale-[1.01] active:scale-[0.99]'}`}
                >
                  {isPreviewingProject ? <div className="w-4 h-4 border-2 border-indigo-400/30 border-t-indigo-400 rounded-full animate-spin" /> : <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" /></svg>}
                  <span>Preview Project</span>
                </button>
              </div>
            </div>
          </section>

          <section className="glass-panel p-6 rounded-3xl shadow-2xl border-white/5 min-h-[500px] flex flex-col relative overflow-hidden bg-black/40 group/preview hover:border-white/10 transition-all duration-700">
            <canvas ref={canvasRef} className="hidden" />
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-sm font-black uppercase tracking-widest text-blue-400 flex items-center gap-2">
                <span className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-pulse shadow-[0_0_8px_rgba(96,165,250,0.8)]" /> 
                Neural Performance Preview
              </h2>
              {videoResult && <div className="text-[10px] font-bold text-slate-500 bg-slate-900 border border-slate-800 px-3 py-1 rounded-lg uppercase tracking-tighter">Live Monitor</div>}
            </div>
            
            <div className="flex-1 relative rounded-2xl overflow-hidden bg-black border border-slate-800/50 group shadow-2xl transition-all duration-500">
              {videoResult ? (
                <div className="relative w-full h-full animate-fade-in">
                  <video 
                    key={videoResult.url}
                    ref={videoRef} 
                    src={videoResult.url} 
                    autoPlay 
                    playsInline 
                    controls 
                    className="w-full h-full object-contain focus:outline-none" 
                  />
                </div>
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center opacity-40">
                  <div className="w-20 h-20 border-2 border-dashed border-slate-800 rounded-full animate-spin-slow mb-4 flex items-center justify-center">
                    <div className="w-12 h-12 border-2 border-blue-500/20 rounded-full animate-reverse-spin" />
                  </div>
                  <span className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-700 animate-pulse">Awaiting Synthesis Command</span>
                </div>
              )}
            </div>

            <div className="mt-6 p-4 rounded-2xl bg-black/60 border border-white/5 shadow-inner">
              <div className="flex items-center justify-between mb-4">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Neural Performance Buffer</span>
                {somePartsReady && (
                  <span className="text-[8px] font-black text-emerald-400 uppercase tracking-widest flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.8)]" /> 
                    {segments.filter(s => !!s.videoUrl).length} Clips Ready
                  </span>
                )}
              </div>
              <div className="grid grid-cols-4 md:grid-cols-6 gap-3">
                {segments.map((s, i) => (
                  <div 
                    key={s.id} 
                    onClick={() => {
                      if (s.videoUrl) {
                        setVideoResult({ 
                          url: s.videoUrl, 
                          id: s.id, 
                          prompt: s.text, 
                          avatarId: 'custom', 
                          resolution: exportConfig.resolution, 
                          scriptSnippet: s.text.substring(0, 50) 
                        });
                        setActiveSegmentIndex(i);
                      }
                    }} 
                    className={`aspect-square rounded-xl border flex flex-col items-center justify-center cursor-pointer transition-all duration-300 hover:scale-110 active:scale-90 group relative shadow-md ${s.status === 'success' ? 'bg-emerald-500/10 border-emerald-500' : s.status === 'loading' || s.status === 'polling' ? 'bg-indigo-500/10 border-indigo-500 border-dashed animate-pulse' : s.status === 'error' ? 'bg-red-500/10 border-red-500' : 'bg-slate-900 border-slate-800 hover:border-slate-500'}`}
                  >
                    <span className="text-[10px] font-black">{i+1}</span>
                    {s.status === 'success' && <div className="w-4 h-0.5 bg-emerald-500/50 rounded-full mt-1 group-hover:w-6 transition-all duration-300" />}
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="glass-panel p-6 rounded-3xl shadow-2xl border-white/5 hover:border-white/10 transition-all duration-500">
            <h2 className="text-sm font-black uppercase tracking-widest text-emerald-400 mb-6 flex items-center gap-2"><span className="w-1.5 h-1.5 bg-emerald-400 rounded-full shadow-[0_0_8px_rgba(16,185,129,0.6)]" /> Audio Engineering</h2>
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-[9px] font-black uppercase tracking-widest text-slate-500">Background Music Track</label>
                  <div className="flex gap-2"><select value={audioDesign.bgmUrl || 'none'} onChange={e => setAudioDesign(prev => ({ ...prev, bgmUrl: e.target.value === 'none' ? null : e.target.value }))} className="flex-1 bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-[11px] font-bold outline-none focus:border-emerald-500 transition-all duration-300 hover:bg-slate-800 active:scale-[0.98]"><option value="none">Silence (No BGM)</option>{BACKGROUND_MUSIC_TRACKS.filter(t => t.url !== null).map(track => (<option key={track.id} value={track.url!}>{track.name}</option>))}</select>{audioDesign.bgmUrl && (<button onClick={() => setIsPreviewingBgm(!isPreviewingBgm)} className={`w-12 h-12 flex items-center justify-center rounded-xl border transition-all duration-300 hover:scale-110 active:scale-90 focus:outline-none ${isPreviewingBgm ? 'bg-emerald-500 border-emerald-400 text-white shadow-[0_0_15px_rgba(16,185,129,0.4)]' : 'bg-slate-900 border-slate-800 text-emerald-400'}`}>{isPreviewingBgm ? <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" /></svg> : <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" /></svg>}</button>)}</div>
                </div>
                <div className="space-y-2">
                  <label className="text-[9px] font-black uppercase tracking-widest text-slate-500">Master Sound Effect</label>
                  <div className="flex gap-2">
                    <select value={audioDesign.selectedSfx || 'none'} onChange={e => { setAudioDesign(prev => ({ ...prev, selectedSfx: e.target.value === 'none' ? null : e.target.value })); if (isPreviewingSfx) { sfxPreviewRef.current?.pause(); setIsPreviewingSfx(false); } }} className="flex-1 bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-[11px] font-bold outline-none focus:border-emerald-500 transition-all duration-300 hover:bg-slate-800 active:scale-[0.98]">
                      <option value="none">No Sound Effect</option>
                      {SOUND_EFFECTS.map(sfx => (<option key={sfx.id} value={sfx.url}>{sfx.name}</option>))}
                    </select>
                    {audioDesign.selectedSfx && (
                      <button onClick={() => setIsPreviewingSfx(!isPreviewingSfx)} className={`w-12 h-12 flex items-center justify-center rounded-xl border transition-all duration-300 hover:scale-110 active:scale-90 focus:outline-none ${isPreviewingSfx ? 'bg-blue-500 border-blue-400 text-white shadow-[0_0_15px_rgba(59,130,246,0.4)]' : 'bg-slate-900 border-slate-800 text-blue-400'}`}>
                        {isPreviewingSfx ? <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" /></svg> : <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" /></svg>}
                      </button>
                    )}
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-2">
                <div className="space-y-2"><div className="flex justify-between items-center"><label className="text-[9px] font-black uppercase tracking-widest text-slate-500">Voice Volume</label><span className="text-[10px] font-bold text-indigo-400">{audioDesign.voiceVolume}%</span></div><input type="range" min="0" max="100" value={audioDesign.voiceVolume} onChange={e => setAudioDesign(prev => ({ ...prev, voiceVolume: parseInt(e.target.value) }))} className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500 transition-all" /></div>
                <div className="space-y-2"><div className="flex justify-between items-center"><label className="text-[9px] font-black uppercase tracking-widest text-slate-500">Music Volume</label><span className="text-[10px] font-bold text-emerald-400">{audioDesign.bgmVolume}%</span></div><input type="range" min="0" max="100" value={audioDesign.bgmVolume} onChange={e => setAudioDesign(prev => ({ ...prev, bgmVolume: parseInt(e.target.value) }))} className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-500 transition-all" /></div>
                <div className="space-y-2"><div className="flex justify-between items-center"><label className="text-[9px] font-black uppercase tracking-widest text-slate-500">SFX Volume</label><span className="text-[10px] font-bold text-blue-400">{audioDesign.sfxVolume}%</span></div><input type="range" min="0" max="100" value={audioDesign.sfxVolume} onChange={e => setAudioDesign(prev => ({ ...prev, sfxVolume: parseInt(e.target.value) }))} className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-blue-500 transition-all" /></div>
              </div>
            </div>
          </section>

          <section className="glass-panel p-6 rounded-3xl shadow-2xl border-white/5 hover:border-white/10 transition-all duration-500">
            <h2 className="text-sm font-black uppercase tracking-widest text-emerald-400 mb-6 flex items-center gap-2"><span className="w-1.5 h-1.5 bg-emerald-400 rounded-full shadow-[0_0_8px_rgba(16,185,129,0.6)]" /> Master Export Core</h2>
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-[9px] font-black uppercase tracking-widest text-slate-500">Export Format</label>
                  <div className="grid grid-cols-3 gap-2">
                    {(['mp4', 'webm', 'gif'] as const).map((fmt) => (
                      <button
                        key={fmt}
                        onClick={() => setExportConfig(prev => ({ ...prev, format: fmt }))}
                        className={`py-2 rounded-xl text-[9px] font-black uppercase border transition-all duration-300 ${exportConfig.format === fmt ? 'bg-emerald-500/20 border-emerald-500 text-emerald-200' : 'bg-slate-900 border-slate-800 text-slate-500 hover:border-slate-600'}`}
                      >
                        {fmt}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-[9px] font-black uppercase tracking-widest text-slate-500">Render Resolution</label>
                  <div className="grid grid-cols-2 gap-2">
                    {(['720p', '1080p'] as const).map((res) => (
                      <button
                        key={res}
                        onClick={() => setExportConfig(prev => ({ ...prev, resolution: res }))}
                        className={`py-2 rounded-xl text-[9px] font-black uppercase border transition-all duration-300 ${exportConfig.resolution === res ? 'bg-emerald-500/20 border-emerald-500 text-emerald-200' : 'bg-slate-900 border-slate-800 text-slate-500 hover:border-slate-600'}`}
                      >
                        {res}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="space-y-4">
                <button 
                  onClick={handleMasterStitch} 
                  disabled={!somePartsReady || isExporting} 
                  className="w-full py-4 bg-emerald-600 hover:bg-emerald-500 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl shadow-emerald-500/20 hover:shadow-emerald-500/40 hover:scale-[1.01] active:scale-[0.99] transition-all duration-300"
                >
                  {isExporting ? 'Synthesizing Performance Master...' : `Synthesize Final Master ${exportConfig.format.toUpperCase()}`}
                </button>
                <button onClick={handleClearCache} className="w-full py-2 text-[9px] font-black uppercase text-slate-600 hover:text-red-400 hover:underline transition-all duration-300 underline-offset-4 focus:outline-none">Purge Project Data</button>
              </div>
            </div>
          </section>
        </div>
      </main>
      
      <style>{`
        .scrollbar-hide::-webkit-scrollbar { display: none; }
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .animate-fade-in { animation: fadeIn 0.4s ease-out forwards; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(15px) scale(0.98); } to { opacity: 1; transform: translateY(0) scale(1); } }
        .animate-spin-slow { animation: spin 4s linear infinite; }
        .animate-reverse-spin { animation: spin-reverse 2s linear infinite; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes spin-reverse { from { transform: rotate(360deg); } to { transform: rotate(0deg); } }
        @keyframes bounce-soft { 0%, 100% { transform: translate(-50%, 0); } 50% { transform: translate(-50%, -10px); } }
        .animate-bounce-soft { animation: bounce-soft 3s ease-in-out infinite; }
        @keyframes pulse-fast { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.7; transform: scale(0.98); } }
        .animate-pulse-fast { animation: pulse-fast 1s ease-in-out infinite; }
        @keyframes loading { 0% { transform: translateX(-100%); } 100% { transform: translateX(300%); } }
        @keyframes visualizer { 0%, 100% { height: 20%; } 50% { height: 100%; } }
        .animate-visualizer { animation: visualizer 0.5s ease-in-out infinite; }
        input[type="range"]::-webkit-slider-thumb { transition: transform 0.1s ease-out; }
        input[type="range"]:active::-webkit-slider-thumb { transform: scale(1.4); }
      `}</style>
    </div>
  );
};

export default App;
