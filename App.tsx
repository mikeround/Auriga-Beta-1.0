import React, { useState, useEffect, useRef, useCallback } from 'react';
import { AnalysisResult, LiveDetection, ChatMessage } from './types';
import { analyzeImage, detectLiveObjects, processChatCommand } from './services/geminiService';
import { generateForensicReport } from './services/pdfService';
import PaperCanvas from './components/PaperCanvas';
import Controls from './components/Controls';

// Type definition for Web Speech API
declare global {
  interface Window {
    webkitSpeechRecognition: any;
    SpeechRecognition: any;
  }
}

const App: React.FC = () => {
  // State
  const [inputMode, setInputMode] = useState<'file' | 'camera'>('file');
  const [file, setFile] = useState<File | null>(null);
  
  // Reference File logic removed for MVP
  // const [referenceFile, setReferenceFile] = useState<File | null>(null);
  // const [referencePreview, setReferencePreview] = useState<string | null>(null);

  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isVideoFile, setIsVideoFile] = useState<boolean>(false); 
  const [detailLevel, setDetailLevel] = useState<number>(50);
  const [language, setLanguage] = useState<string>("Español");
  const [focus, setFocus] = useState<string>("general");
  
  const [analysisData, setAnalysisData] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Geolocation State
  const [userLocation, setUserLocation] = useState<{ lat: number, lng: number } | undefined>(undefined);

  // Camera State
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [isPaused, setIsPaused] = useState(false); 
  const streamRef = useRef<MediaStream | null>(null);
  
  // File Video State
  const fileVideoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1.0);
  const [volume, setVolume] = useState(1.0);
  const [currentTime, setCurrentTime] = useState(0);

  // Live Detection State
  const [liveDetections, setLiveDetections] = useState<LiveDetection[]>([]);
  const isDetectingRef = useRef(false);
  
  // RATE LIMIT PROTECTION
  const rateLimitBackoffRef = useRef<number>(0);
  const [rateLimitActive, setRateLimitActive] = useState(false);

  // --- Chat / Neural Link State ---
  const [viewMode, setViewMode] = useState<'log' | 'chat'>('log');
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
      { id: 'init', sender: 'ai', text: 'Bienvenido a Chronos MVP. Cargue una imagen o vídeo para comenzar.', timestamp: new Date().toLocaleTimeString() }
  ]);
  const [chatInput, setChatInput] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [isChatProcessing, setIsChatProcessing] = useState(false);
  const [isVoiceModeEnabled, setIsVoiceModeEnabled] = useState(false); 
  const chatEndRef = useRef<HTMLDivElement>(null);

  // --- MOBILE UI STATE ---
  const [mobileLeftPanelOpen, setMobileLeftPanelOpen] = useState(false);
  const [mobileRightPanelOpen, setMobileRightPanelOpen] = useState(false);

  // Scroll to bottom of chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, viewMode]);

  // Init Geolocation
  useEffect(() => {
      if (navigator.geolocation) {
          navigator.geolocation.getCurrentPosition(
              (position) => {
                  setUserLocation({
                      lat: position.coords.latitude,
                      lng: position.coords.longitude
                  });
              },
              (err) => {
                  console.warn("Geolocation access denied or failed", err);
              }
          );
      }
  }, []);

  // --- Helpers ---
  
  const fileToGenerativePart = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = reader.result as string;
        const base64Data = base64String.split(',')[1];
        resolve(base64Data);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const generateAudioPlaceholder = (): string => {
      const canvas = document.createElement('canvas');
      canvas.width = 1000;
      canvas.height = 1000;
      const ctx = canvas.getContext('2d');
      if(ctx) {
          // Professional Audio Placeholder
          ctx.fillStyle = "#f8fafc"; 
          ctx.fillRect(0,0,1000,1000);
          
          ctx.fillStyle = "#475569"; 
          ctx.font = "bold 60px 'Inter', sans-serif";
          ctx.textAlign = "center";
          ctx.fillText("ARCHIVO DE AUDIO DETECTADO", 500, 450);
          ctx.fillStyle = "#2563eb"; 
          ctx.font = "40px 'Inter', sans-serif";
          ctx.fillText("ANÁLISIS DE ONDA REQUERIDO", 500, 520);
          
          ctx.beginPath();
          ctx.moveTo(100, 600);
          for(let i=100; i<900; i+=10) {
              const h = Math.random() * 200;
              ctx.lineTo(i, 600 - h/2);
              ctx.lineTo(i+5, 600 + h/2);
          }
          ctx.strokeStyle = "#475569";
          ctx.lineWidth = 4;
          ctx.stroke();
      }
      return canvas.toDataURL('image/jpeg');
  };

  const handleFileChange = async (selectedFile: File) => {
    setFile(selectedFile);
    setAnalysisData(null);
    setLiveDetections([]);
    setError(null);
    stopCamera();
    
    // Reset video state
    setIsPlaying(false);
    setCurrentTime(0);
    setPlaybackRate(1.0);

    if (selectedFile.type.startsWith('video/')) {
        const objectUrl = URL.createObjectURL(selectedFile);
        setImagePreview(objectUrl);
        setIsVideoFile(true);
    } else if (selectedFile.type.startsWith('audio/')) {
        const thumb = generateAudioPlaceholder();
        setImagePreview(thumb);
        setIsVideoFile(false);
    } else {
        const objectUrl = URL.createObjectURL(selectedFile);
        setImagePreview(objectUrl);
        setIsVideoFile(false);
    }
    
    setChatMessages([{ id: 'init', sender: 'ai', text: 'Nueva fuente detectada. Analizando contenido...', timestamp: new Date().toLocaleTimeString() }]);
    
    setMobileLeftPanelOpen(false);
    setMobileRightPanelOpen(false);
  };

  // Removed handleReferenceChange for MVP

  // --- Camera Logic ---
  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } } 
      });
      
      streamRef.current = stream;
      setIsCameraActive(true); 
      setIsPaused(false);
      setAnalysisData(null); 
      setImagePreview(null); 
      setError(null);
      setLiveDetections([]);
    } catch (err) {
      console.error("Camera Error:", err);
      setError("No se pudo acceder a la cámara.");
    }
  };

  const setVideoRef = useCallback((node: HTMLVideoElement | null) => {
      videoRef.current = node;
      if (node && streamRef.current) {
          node.srcObject = streamRef.current;
      }
  }, []);

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setIsCameraActive(false);
    setIsPaused(false);
    setLiveDetections([]);
    if (videoRef.current) {
        videoRef.current.srcObject = null;
    }
  };

  const togglePause = () => {
    if (!videoRef.current) return;
    if (isPaused) {
      videoRef.current.play();
      setIsPaused(false);
    } else {
      videoRef.current.pause();
      setIsPaused(true);
    }
  };

  const captureFrame = (sourceVideo: HTMLVideoElement | null): string | null => {
    if (!sourceVideo) return null;
    const canvas = document.createElement("canvas");
    canvas.width = sourceVideo.videoWidth;
    canvas.height = sourceVideo.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    // Draw what's currently on the video element
    ctx.drawImage(sourceVideo, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.7); 
  };

  // --- LIVE DETECTION LOOP (Recursive Timeout) ---
  useEffect(() => {
    let timeoutId: any;
    let isMounted = true;

    const tick = async () => {
        if (!isMounted) return;

        // Base Check: Are we in a mode that needs detection?
        const needsDetection = (inputMode === 'camera' && isCameraActive && !isPaused && !loading) ||
                               (inputMode === 'file' && isVideoFile && isPlaying && !loading);
        
        if (!needsDetection) {
            // Idle check
            timeoutId = setTimeout(tick, 1000);
            return;
        }

        // Check Backoff
        const now = Date.now();
        if (now < rateLimitBackoffRef.current) {
            if (!rateLimitActive) setRateLimitActive(true);
            timeoutId = setTimeout(tick, 1000);
            return;
        } else {
            if (rateLimitActive) setRateLimitActive(false);
        }

        // Capture
        const videoEl = inputMode === 'camera' ? videoRef.current : fileVideoRef.current;
        if (!videoEl || videoEl.paused || videoEl.ended) {
             // If video isn't ready, wait a bit
             timeoutId = setTimeout(tick, 500);
             return;
        }

        const captureTimestamp = videoEl.currentTime; // CRITICAL FOR SYNC
        const frame = captureFrame(videoEl);
        let nextDelay = 1000; // BASE DELAY: 1.0 Seconds (Faster Response)

        if (frame) {
            const base64 = frame.split(',')[1];
            try {
                // Perform Detection
                const results = await detectLiveObjects(base64);
                if (isMounted) {
                    // Only update if we are still effectively playing/active
                    if ((inputMode === 'camera' && !isPaused) || (inputMode === 'file' && isPlaying)) {
                        // Inject Timestamp for Sync
                        setLiveDetections(results.map(r => ({ ...r, timestamp: captureTimestamp })));
                    }
                }
            } catch (err: any) {
                // Handle Quota Error
                if (err.message === "QUOTA_EXCEEDED" || err.status === 429) {
                     console.warn("Quota Limit Hit. Backing off for 10s.");
                     rateLimitBackoffRef.current = Date.now() + 10000; // 10s Penalty
                     nextDelay = 5000; // Retry slower
                }
            }
        }
        
        timeoutId = setTimeout(tick, nextDelay);
    };

    tick();

    return () => {
        isMounted = false;
        clearTimeout(timeoutId);
    };
  }, [inputMode, isCameraActive, isPaused, loading, isVideoFile, isPlaying]);


  const handleAction = async () => {
    if (inputMode === 'camera' && !isCameraActive) {
      await startCamera();
      return;
    }

    setLoading(true);
    setError(null);

    // Close mobile panels when starting analysis
    setMobileLeftPanelOpen(false);
    setMobileRightPanelOpen(false);

    try {
      let base64Data = "";
      let mimeType = "image/jpeg";
      let metadataString = "Source: Live Neural Feed\nTimestamp: " + new Date().toISOString();
      let referenceBase64: string | undefined = undefined;
      let referenceMimeType: string | undefined = undefined;

      // MVP Change: Reference Image logic removed from handleAction

      if (inputMode === 'camera' && isCameraActive) {
        const capturedDataUrl = captureFrame(videoRef.current);
        if (!capturedDataUrl) throw new Error("Failed to capture video frame");
        stopCamera();
        setImagePreview(capturedDataUrl); 
        setIsVideoFile(false);
        base64Data = capturedDataUrl.split(',')[1];
      
      } else if (inputMode === 'file' && file) {
        // For Full Analysis, we send the file content
        base64Data = await fileToGenerativePart(file);
        mimeType = file.type;
        metadataString = `Filename: ${file.name}\nSize: ${file.size} bytes\nType: ${file.type}\nModified: ${new Date(file.lastModified).toISOString()}`;
      } else {
        throw new Error("No source data found.");
      }

      // Updated call: No Reference data passed
      const data = await analyzeImage(base64Data, mimeType, detailLevel, language, focus, metadataString, undefined, undefined, userLocation);
      setAnalysisData(data);
      setChatMessages(prev => [...prev, { id: Date.now().toString(), sender: 'ai', text: `Análisis completado. ${data.objects.length} objetos detectados.`, timestamp: new Date().toLocaleTimeString() }]);
      
      // Auto open right panel on mobile on success
      if (window.innerWidth < 768) {
          setMobileRightPanelOpen(true);
      }

    } catch (err: any) {
      console.error(err);
      setError(err.message || "Fallo del sistema.");
    } finally {
      setLoading(false);
    }
  };

  const handleModeChange = (mode: 'file' | 'camera') => {
    setInputMode(mode);
    setError(null);
    if (mode === 'file') stopCamera();
    else {
      setAnalysisData(null);
      setImagePreview(null);
    }
  };

  // --- TTS Function ---
  const speakText = (text: string) => {
      if (!window.speechSynthesis) return;
      window.speechSynthesis.cancel();
      const cleanText = text.replace(/\*/g, '').replace(/#/g, '');
      const utterance = new SpeechSynthesisUtterance(cleanText);
      utterance.lang = language === 'English' ? 'en-US' : 'es-ES'; 
      utterance.rate = 1.1;
      window.speechSynthesis.speak(utterance);
  };

  // --- Chat Functions ---

  const handleSendMessage = async (overrideText?: string) => {
    const textToSend = overrideText || chatInput;
    if (!textToSend.trim()) return;
    
    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      sender: 'user',
      text: textToSend,
      timestamp: new Date().toLocaleTimeString()
    };

    setChatMessages(prev => [...prev, userMsg]);
    setChatInput("");
    setIsChatProcessing(true);

    try {
      const responseText = await processChatCommand(userMsg.text, chatMessages, analysisData);
      const aiMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        sender: 'ai',
        text: responseText,
        timestamp: new Date().toLocaleTimeString()
      };
      setChatMessages(prev => [...prev, aiMsg]);
      
      if (isVoiceModeEnabled) {
          speakText(responseText);
      }

    } catch (e) {
      console.error(e);
    } finally {
      setIsChatProcessing(false);
    }
  };

  // --- Voice Recognition ---
  const startListening = () => {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      alert("Navegador no compatible. Use Chrome.");
      return;
    }
    
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.lang = language === "English" ? "en-US" : "es-ES";
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onstart = () => setIsListening(true);
    recognition.onend = () => setIsListening(false);
    
    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setChatInput(transcript);
      handleSendMessage(transcript);
    };

    recognition.start();
  };

  // --- File Playback Controls ---
  const toggleFileVideoPlay = () => {
    if (fileVideoRef.current) {
        if (isPlaying) fileVideoRef.current.pause();
        else fileVideoRef.current.play();
        setIsPlaying(!isPlaying);
    }
  };
  
  const stopFileVideo = () => {
      if (fileVideoRef.current) {
          fileVideoRef.current.pause();
          fileVideoRef.current.currentTime = 0;
          setIsPlaying(false);
          setCurrentTime(0);
          setLiveDetections([]);
      }
  };

  const rewindFileVideo = () => {
      if (fileVideoRef.current) {
          fileVideoRef.current.currentTime = Math.max(0, fileVideoRef.current.currentTime - 10);
      }
  };

  const handleSpeedChange = (val: number) => {
      setPlaybackRate(val);
      if (fileVideoRef.current) fileVideoRef.current.playbackRate = val;
  };

  const handleVolumeChange = (val: number) => {
      setVolume(val);
      if (fileVideoRef.current) fileVideoRef.current.volume = val;
  };

  const handleTimeUpdate = () => {
      if (fileVideoRef.current) setCurrentTime(fileVideoRef.current.currentTime);
  };

  const handleExportPDF = useCallback(() => {
    if (analysisData) {
        generateForensicReport(analysisData, imagePreview);
    }
  }, [analysisData, imagePreview]);

  useEffect(() => {
    return () => { stopCamera(); };
  }, []);

  return (
    <div className="h-screen w-screen flex flex-col bg-corp-bg text-corp-text overflow-hidden relative font-sans">
      
      {/* Header */}
      <header className="shrink-0 py-2 md:py-3 px-4 md:px-6 bg-white z-20 border-b border-corp-border shadow-sm flex items-center justify-between">
        <div className="flex items-center gap-2 md:gap-3">
          <div className="w-6 h-6 md:w-8 md:h-8 bg-corp-primary rounded-md flex items-center justify-center text-white font-bold text-sm md:text-lg">M</div>
          <div>
             <h1 className="text-base md:text-xl font-bold text-gray-900 tracking-tight leading-none">
              CHRONOS <span className="text-corp-primary font-normal">MVP</span>
             </h1>
          </div>
        </div>
        <div className="flex items-center gap-3">
             {rateLimitActive && (
                 <div className="bg-orange-100 text-orange-800 text-[10px] px-2 py-0.5 rounded font-bold border border-orange-300 animate-pulse">
                     ⚠️ LIMIT
                 </div>
             )}
             <div className="text-[10px] text-corp-subtext hidden sm:block">
                v1.0 (BETA)
            </div>
        </div>
      </header>

      {/* Main Viewport */}
      <main className="flex-1 min-h-0 flex flex-col px-0 md:px-6 pb-2 relative z-10 md:pt-6">
        
        {/* MOBILE OVERLAY (Backdrop) */}
        {(mobileLeftPanelOpen || mobileRightPanelOpen) && (
            <div 
              className="fixed inset-0 bg-black/60 z-40 md:hidden backdrop-blur-sm transition-opacity"
              onClick={() => {
                  setMobileLeftPanelOpen(false);
                  setMobileRightPanelOpen(false);
              }}
            />
        )}

        <div className="flex-1 min-h-0 relative flex items-center justify-center bg-white md:rounded-lg overflow-hidden border-y md:border border-corp-border shadow-soft">
          
          {/* STATE 1: Camera Active */}
          {inputMode === 'camera' && isCameraActive && (
            <div className="relative w-full h-full bg-black flex items-center justify-center group">
              <video 
                ref={setVideoRef}
                autoPlay={!isPaused}
                playsInline 
                muted
                className="absolute inset-0 w-full h-full object-contain"
              />
              
              {/* HUD */}
              {liveDetections.map((det, idx) => {
                const [ymin, xmin, ymax, xmax] = det.box_2d;
                return (
                  <div key={idx} className="absolute border-2 border-red-500 pointer-events-none transition-all duration-300"
                    style={{ 
                        top: `${ymin / 10}%`, 
                        left: `${xmin / 10}%`, 
                        width: `${(xmax - xmin) / 10}%`, 
                        height: `${(ymax - ymin) / 10}%` 
                    }}>
                    <div className="absolute -top-6 left-0 bg-red-500 text-white text-[10px] px-2 py-0.5 font-bold rounded-t">
                      {det.label}
                    </div>
                  </div>
                );
              })}

              <div className={`absolute bottom-8 left-1/2 -translate-x-1/2 transition-opacity duration-300 ${isPaused ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                <button onClick={togglePause} className="bg-white/90 backdrop-blur border border-gray-300 text-gray-800 px-6 py-2 rounded shadow-lg font-bold hover:bg-white transition-all">
                  {isPaused ? "Reanudar Feed" : "Congelar Imagen"}
                </button>
              </div>

              <div className="absolute top-4 left-4 flex flex-col gap-1">
                <div className="text-white font-mono text-xs flex items-center gap-2 bg-black/50 px-2 py-1 rounded">
                    <span className={`w-2 h-2 rounded-full ${isPaused ? 'bg-yellow-500' : 'bg-red-500 animate-pulse'}`}></span>
                    {isPaused ? "PAUSADO" : "EN VIVO"}
                </div>
              </div>
            </div>
          )}

          {/* STATE 2: Result/Preview (Including Video Files) */}
          {(!isCameraActive && imagePreview) && (
            <PaperCanvas 
              imageSrc={imagePreview} 
              data={analysisData} 
              liveDetections={liveDetections} 
              detailLevel={detailLevel}
              isVideo={isVideoFile}
              videoRef={fileVideoRef} 
              onTimeUpdate={handleTimeUpdate} 
              onExportPDF={handleExportPDF}
            />
          )}

          {/* STATE 3: Idle */}
          {(!isCameraActive && !imagePreview) && (
             <div className="w-full h-full flex items-center justify-center bg-gray-50 text-gray-400">
               <div className="text-center p-8 md:p-12">
                 <svg className="w-12 h-12 md:w-16 md:h-16 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"></path></svg>
                 <p className="text-base md:text-lg font-semibold text-gray-600">Listo para Analizar</p>
                 <p className="text-xs md:text-sm">Seleccione una imagen o use la cámara.</p>
               </div>
            </div>
          )}
        </div>

        {/* --- MOBILE PANEL TOGGLES --- */}
        {(analysisData) && (
            <>
                <button 
                    onClick={() => setMobileLeftPanelOpen(!mobileLeftPanelOpen)}
                    className="md:hidden absolute top-4 left-4 z-30 bg-white/90 backdrop-blur border border-gray-300 text-corp-primary px-3 py-2 rounded-full shadow-lg text-xs font-bold flex items-center gap-1 active:scale-95 transition-transform"
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16"></path></svg>
                    DATOS
                </button>
                <button 
                    onClick={() => setMobileRightPanelOpen(!mobileRightPanelOpen)}
                    className="md:hidden absolute top-4 right-4 z-30 bg-white/90 backdrop-blur border border-gray-300 text-corp-primary px-3 py-2 rounded-full shadow-lg text-xs font-bold flex items-center gap-1 active:scale-95 transition-transform"
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"></path></svg>
                    INFO
                </button>
            </>
        )}

        {/* --- LEFT PANEL: Metadata & Web Provenance (Simplified) --- */}
        {(analysisData) && (
          <div 
            className={`
                bg-white p-4 border-r border-corp-border shadow-2xl font-sans text-xs text-corp-text overflow-y-auto
                fixed inset-y-0 left-0 w-80 h-full z-50 transform transition-transform duration-300 ease-in-out
                md:absolute md:top-8 md:left-8 md:w-72 md:h-auto md:max-h-[80vh] md:rounded-md md:border md:shadow-lg md:z-30 md:inset-auto md:transform-none
                ${mobileLeftPanelOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
            `}
          >
              <h2 className="text-corp-primary font-bold text-sm mb-4 border-b border-gray-100 pb-2 flex items-center justify-between">
                <span className="flex items-center gap-2">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                    Metadatos
                </span>
                <button onClick={() => setMobileLeftPanelOpen(false)} className="md:hidden bg-gray-100 p-1 rounded-full text-gray-500">
                    ✕
                </button>
              </h2>
              
              {/* Metadata Section */}
              {analysisData?.metadata_analysis && (
                  <div className="mb-6">
                      <div className="bg-gray-50 p-2 rounded border border-gray-200 text-[10px] space-y-1 text-gray-600">
                          {Object.entries(analysisData.metadata_analysis.technical_metadata).map(([k, v]) => (
                              <div key={k} className="flex justify-between border-b border-gray-100 last:border-0 py-0.5">
                                  <span className="font-semibold uppercase text-gray-400">{k.replace('_', ' ')}:</span>
                                  <span className="text-right truncate max-w-[120px]" title={v}>{v}</span>
                              </div>
                          ))}
                      </div>
                  </div>
              )}

              {/* Web Provenance Section */}
              {analysisData?.web_provenance && analysisData.web_provenance.length > 0 && (
                  <div className="mb-4">
                      <h3 className="font-bold text-corp-primary mb-2">Referencias Web</h3>
                      <div className="flex flex-col gap-2">
                          {analysisData.web_provenance.map((item, idx) => (
                              <a key={idx} href={item.url} target="_blank" rel="noopener noreferrer"
                                className="block bg-white p-2 border rounded hover:shadow-sm transition-all group">
                                <div className="font-semibold text-blue-700 truncate text-[10px]">{item.source_title}</div>
                                <div className="text-[9px] text-gray-400 truncate">{item.url}</div>
                              </a>
                          ))}
                      </div>
                  </div>
              )}
          </div>
        )}

        {/* --- RIGHT PANEL: Analysis Log & Chat Interface (MVP Version) --- */}
        {analysisData && (
          <div 
            className={`
                bg-white border-l border-corp-border shadow-2xl font-sans text-xs text-corp-text flex flex-col
                fixed inset-y-0 right-0 w-full md:w-80 h-full z-50 transform transition-transform duration-300 ease-in-out
                md:absolute md:top-8 md:right-8 md:w-80 md:h-auto md:max-h-[80vh] md:rounded-md md:border md:shadow-xl md:z-30 md:inset-auto md:transform-none
                ${mobileRightPanelOpen ? 'translate-x-0' : 'translate-x-full md:translate-x-0'}
            `}
          >
            
            {/* Header / Tabs */}
            <div className="flex border-b border-gray-200 shrink-0 bg-gray-50 rounded-t-md overflow-hidden relative">
               <button 
                onClick={() => setViewMode('log')}
                className={`flex-1 py-3 md:py-2.5 text-center font-bold text-xs transition-all ${viewMode === 'log' ? 'bg-white text-corp-primary border-t-2 border-corp-primary' : 'text-gray-500 hover:text-gray-700'}`}
               >
                 Resultados
               </button>
               <button 
                onClick={() => setViewMode('chat')}
                className={`flex-1 py-3 md:py-2.5 text-center font-bold text-xs transition-all ${viewMode === 'chat' ? 'bg-white text-corp-primary border-t-2 border-corp-primary' : 'text-gray-500 hover:text-gray-700'}`}
               >
                 Asistente
               </button>
               {/* Mobile Close Button (Absolute right) */}
               <button 
                onClick={() => setMobileRightPanelOpen(false)} 
                className="md:hidden absolute top-2 right-2 bg-gray-100 rounded-full p-2 text-gray-500 hover:text-gray-700 z-10"
               >
                 ✕
               </button>
            </div>

            {/* --- VIEW: LOGS (SIMPLIFIED FOR MVP) --- */}
            {viewMode === 'log' && (
               <div className="p-4 overflow-y-auto">
                    
                    {/* CRITICAL SECURITY ALERTS (High Priority) */}
                    {analysisData.events && analysisData.events.length > 0 && (
                        <div className="mb-6">
                        <h2 className="text-red-600 font-bold text-sm mb-2 pb-1 flex items-center gap-2">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
                            Alertas
                        </h2>
                        <div className="flex flex-col gap-2">
                            {analysisData.events.map((evt, idx) => (
                                <div key={idx} className={`bg-red-50 border-l-4 border-red-500 p-3 rounded shadow-sm`}>
                                    <div className="flex justify-between items-center mb-1">
                                        <span className="text-red-700 font-bold uppercase text-[10px]">{evt.type}</span>
                                        <span className="bg-red-100 text-red-800 px-1.5 py-0.5 rounded text-[9px] font-bold">{evt.severity}</span>
                                    </div>
                                    <div className="text-gray-700 text-[10px] mb-1">{evt.description}</div>
                                </div>
                            ))}
                        </div>
                        </div>
                    )}

                    <h2 className="text-gray-900 font-bold text-sm mb-4 border-b border-gray-200 pb-2">Resumen</h2>
                    <p className="leading-relaxed whitespace-pre-line text-gray-600 text-[11px] mb-4">{analysisData.summary}</p>
                    
                    {/* Audio Info (if exists) */}
                    {analysisData.audio_analysis && analysisData.audio_analysis.detected && (
                    <div className="mb-4 pb-4 border-b border-gray-100">
                        <h3 className="font-bold text-gray-700 mb-2 text-[10px] uppercase">Audio Detectado</h3>
                        
                        <div className="mb-2 bg-blue-50 p-2 rounded border border-blue-100">
                            <span className="text-gray-500 block mb-1 text-[9px] uppercase">Entorno</span>
                            <span className="text-blue-800 font-bold uppercase text-[10px]">{analysisData.audio_analysis.environment_class}</span>
                        </div>

                        {analysisData.audio_analysis.detected_sounds && analysisData.audio_analysis.detected_sounds.length > 0 && (
                        <div>
                            <span className="text-gray-500 block mb-1 text-[9px] uppercase">Sonidos</span>
                            <div className="flex flex-wrap gap-1">
                                {analysisData.audio_analysis.detected_sounds.map((sound, i) => (
                                    <span key={i} className="px-2 py-0.5 text-[9px] font-semibold rounded border border-gray-200 text-gray-700 bg-gray-100">
                                        {sound}
                                    </span>
                                ))}
                            </div>
                        </div>
                        )}
                    </div>
                    )}

                    <h3 className="font-bold text-gray-900 mb-2">Objetos ({analysisData.objects.length})</h3>
                    <ul className="list-disc pl-4 space-y-1 text-[11px] text-gray-600">
                        {analysisData.objects.slice(0, 10).map((obj, i) => (
                            <li key={i}>{obj.name} <span className="text-gray-400">({obj.material})</span></li>
                        ))}
                        {analysisData.objects.length > 10 && <li>... y {analysisData.objects.length - 10} más.</li>}
                    </ul>
               </div>
            )}

            {/* --- VIEW: CHAT --- */}
            {viewMode === 'chat' && (
                <div className="flex flex-col flex-1 min-h-0 bg-gray-50">
                    <div className="flex-1 overflow-y-auto p-4 space-y-3">
                        {chatMessages.map((msg) => (
                           <div key={msg.id} className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}>
                               <div className={`max-w-[90%] p-2.5 rounded-lg shadow-sm text-[11px] ${msg.sender === 'user' ? 'bg-blue-600 text-white rounded-br-none' : 'bg-white border border-gray-200 text-gray-800 rounded-bl-none'}`}>
                                   <p className="whitespace-pre-wrap">{msg.text}</p>
                               </div>
                               <span className="text-[9px] text-gray-400 mt-1">{msg.timestamp}</span>
                           </div>
                        ))}
                        {isChatProcessing && (
                            <div className="flex items-start">
                                <div className="bg-white border border-gray-200 p-2 rounded-lg shadow-sm">
                                    <span className="text-gray-500 text-[10px] animate-pulse">Escribiendo...</span>
                                </div>
                            </div>
                        )}
                        <div ref={chatEndRef}></div>
                    </div>

                    <div className="p-2 border-t border-gray-200 bg-white shrink-0">
                        <div className="flex gap-2">
                           <input 
                              type="text" 
                              value={chatInput}
                              onChange={(e) => setChatInput(e.target.value)}
                              onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                              placeholder="Pregunta sobre el análisis..."
                              className="flex-1 bg-gray-100 border border-gray-300 rounded-md p-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all text-gray-900"
                           />
                           <button 
                             onClick={startListening}
                             className={`px-3 rounded-md border transition-colors ${isListening ? 'bg-red-500 border-red-600 text-white animate-pulse' : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-100'}`}
                           >
                             🎤
                           </button>
                           <button 
                             onClick={() => handleSendMessage()}
                             disabled={isChatProcessing}
                             className="px-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors"
                           >
                             ➜
                           </button>
                        </div>
                    </div>
                </div>
            )}
          </div>
        )}

        {error && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-red-100 text-red-800 px-6 py-3 border border-red-300 rounded-md shadow-lg font-semibold z-50 text-xs flex items-center gap-2">
            <svg className="w-4 h-4 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
            Error: {error}
          </div>
        )}

      </main>

      <footer className="shrink-0 bg-white text-gray-600 p-3 md:p-4 border-t border-gray-200 z-20 shadow-[0_-5px_15px_rgba(0,0,0,0.05)] overflow-x-hidden">
        <div className="max-w-[1600px] mx-auto w-full">
           <Controls 
            onFileChange={handleFileChange}
            inputMode={inputMode}
            setInputMode={handleModeChange}
            detailLevel={detailLevel}
            setDetailLevel={setDetailLevel}
            language={language}
            setLanguage={setLanguage}
            focus={focus}
            setFocus={setFocus}
            onAnalyze={handleAction}
            loading={loading}
            hasImage={!!file || !!imagePreview}
            isCameraActive={isCameraActive}
            isVideo={isVideoFile}
            isPlaying={isPlaying}
            togglePlay={toggleFileVideoPlay}
            stopVideo={stopFileVideo}
            rewindVideo={rewindFileVideo}
            playbackRate={playbackRate}
            setPlaybackRate={handleSpeedChange}
            volume={volume}
            setVolume={handleVolumeChange}
            isVoiceModeEnabled={isVoiceModeEnabled}
            setIsVoiceModeEnabled={setIsVoiceModeEnabled}
          />
        </div>
      </footer>
    </div>
  );
};

export default App;