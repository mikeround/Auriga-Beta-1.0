import React from 'react';

interface ControlsProps {
  onFileChange: (file: File) => void;
  // Reference props removed for MVP
  
  inputMode: 'file' | 'camera';
  setInputMode: (mode: 'file' | 'camera') => void;
  detailLevel: number;
  setDetailLevel: (val: number) => void;
  language: string;
  setLanguage: (val: string) => void;
  focus: string;
  setFocus: (val: string) => void;
  onAnalyze: () => void;
  loading: boolean;
  hasImage: boolean;
  isCameraActive: boolean;
  
  // Video Controls
  isVideo: boolean;
  isPlaying: boolean;
  togglePlay: () => void;
  stopVideo: () => void;
  rewindVideo: () => void;
  playbackRate: number;
  setPlaybackRate: (val: number) => void;
  volume: number;
  setVolume: (val: number) => void;

  // Voice Interaction
  isVoiceModeEnabled: boolean;
  setIsVoiceModeEnabled: (val: boolean) => void;
}

const Controls: React.FC<ControlsProps> = ({ 
  onFileChange,
  inputMode, setInputMode,
  detailLevel, setDetailLevel, 
  language, setLanguage,
  focus, setFocus,
  onAnalyze, loading, hasImage, isCameraActive,
  isVideo, isPlaying, togglePlay, stopVideo, rewindVideo, playbackRate, setPlaybackRate, volume, setVolume,
  isVoiceModeEnabled, setIsVoiceModeEnabled
}) => {
  return (
    <div className="flex flex-col gap-4 text-sm w-full">
      
      {/* --- UPPER CONTROLS --- */}
      <div className="grid grid-cols-2 md:flex md:flex-row gap-3 items-center justify-between">
        
        {/* Source Selection & Language */}
        <div className="col-span-2 md:col-span-auto flex flex-wrap gap-2 items-center justify-between md:justify-start">
            {/* Input Mode Toggle */}
            <div className="flex bg-white rounded-md border border-corp-border overflow-hidden shadow-sm shrink-0">
                <button 
                    onClick={() => setInputMode('file')}
                    className={`px-3 py-2 text-xs font-semibold transition-all ${inputMode === 'file' ? 'bg-corp-primary text-white' : 'text-corp-subtext hover:bg-gray-100'}`}
                >
                    Archivo
                </button>
                <button 
                    onClick={() => setInputMode('camera')}
                    className={`px-3 py-2 text-xs font-semibold transition-all ${inputMode === 'camera' ? 'bg-corp-primary text-white' : 'text-corp-subtext hover:bg-gray-100'}`}
                >
                    Cámara
                </button>
            </div>

            {/* Language Selector */}
            <select 
            value={language} 
            onChange={(e) => setLanguage(e.target.value)}
            className="bg-white text-corp-text border border-corp-border rounded-md py-1.5 px-2 text-xs focus:outline-none focus:ring-1 focus:ring-corp-primary shadow-sm w-24"
            >
                <option value="Español">ES</option>
                <option value="English">EN</option>
                <option value="Français">FR</option>
            </select>

            {/* Voice Toggle */}
            <button
                onClick={() => setIsVoiceModeEnabled(!isVoiceModeEnabled)}
                className={`flex items-center gap-1 px-2 py-1.5 rounded-md border text-xs font-bold transition-all ml-auto md:ml-0 ${
                    isVoiceModeEnabled 
                    ? 'bg-purple-100 text-purple-700 border-purple-300 shadow-sm' 
                    : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'
                }`}
                >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"></path></svg>
                {isVoiceModeEnabled ? 'Voz ON' : 'Voz OFF'}
            </button>
        </div>

        {/* File Input (Only if File mode) */}
        {inputMode === 'file' && (
            <div className="col-span-2 md:col-span-auto">
                <input 
                    type="file" 
                    accept="image/*,video/*,audio/*"
                    onChange={(e) => {
                    if (e.target.files?.[0]) onFileChange(e.target.files[0]);
                    }}
                    className="w-full md:w-48 text-xs text-corp-text file:py-1.5 file:px-3 file:rounded-md file:border-0 file:bg-gray-200 file:text-corp-text file:font-semibold hover:file:bg-gray-300 cursor-pointer"
                />
            </div>
        )}

        {/* Protocol Selector (Simplified for MVP) */}
         <div className="col-span-2 md:col-span-auto flex flex-col md:items-end gap-1">
            <select 
                value={focus} 
                onChange={(e) => setFocus(e.target.value)}
                className="w-full md:w-auto bg-white text-corp-text border border-corp-border rounded-md py-1.5 px-3 text-xs focus:outline-none focus:ring-1 focus:ring-corp-primary shadow-sm font-semibold"
            >
                <option value="general">Análisis General</option>
                <option value="security">Seguridad / Riesgos</option>
                <option value="tracking">Seguimiento Objetos</option>
            </select>
        </div>
      </div>

      {/* --- VIDEO CONTROLS --- */}
      {isVideo && (
        <div className="bg-gray-50 border border-gray-200 rounded p-2 flex flex-wrap items-center justify-between gap-2">
             <div className="flex items-center gap-2">
                <button onClick={rewindVideo} className="text-corp-subtext hover:text-corp-primary p-2 bg-white border border-corp-border rounded active:scale-95 transition-transform">
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M11 18V6l-8.5 6 8.5 6zm.5-6l8.5 6V6l-8.5 6z"/></svg>
                </button>
                <button onClick={togglePlay} className="text-white bg-corp-primary p-2 border border-transparent rounded active:scale-95 transition-transform shadow-sm">
                    {isPlaying ? (
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/></svg>
                    ) : (
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                    )}
                </button>
                <button onClick={stopVideo} className="text-corp-danger hover:bg-red-50 p-2 bg-white border border-corp-border rounded active:scale-95 transition-transform">
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M6 6h12v12H6z"/></svg>
                </button>
             </div>
             
             <div className="flex items-center gap-4 flex-1 justify-end min-w-[150px]">
                 <div className="flex flex-col gap-1 w-20">
                     <span className="text-[9px] text-corp-subtext font-bold uppercase">Vel {playbackRate.toFixed(1)}x</span>
                     <input 
                        type="range" min="0.5" max="2.0" step="0.1" 
                        value={playbackRate} 
                        onChange={e => setPlaybackRate(parseFloat(e.target.value))}
                        className="h-1.5 bg-gray-300 rounded-lg appearance-none cursor-pointer accent-corp-primary"
                     />
                 </div>
                 <div className="flex flex-col gap-1 w-20">
                     <span className="text-[9px] text-corp-subtext font-bold uppercase">Vol {Math.round(volume * 100)}%</span>
                     <input 
                        type="range" min="0" max="1" step="0.1" 
                        value={volume} 
                        onChange={e => setVolume(parseFloat(e.target.value))}
                        className="h-1.5 bg-gray-300 rounded-lg appearance-none cursor-pointer accent-corp-primary"
                     />
                 </div>
             </div>
        </div>
      )}

      {/* --- ACTION & DETAIL --- */}
      <div className="flex gap-3 items-center">
        <div className="flex items-center gap-2 flex-1 bg-gray-50 p-1.5 rounded border border-gray-200">
          <label className="text-corp-subtext text-[10px] font-bold uppercase whitespace-nowrap pl-1">Detalle</label>
          <input 
              type="range" 
              min="1" 
              max="100" 
              value={detailLevel} 
              onChange={(e) => setDetailLevel(parseInt(e.target.value))}
              className="w-full h-1.5 bg-gray-300 rounded-lg appearance-none cursor-pointer accent-corp-primary"
            />
          <span className="text-corp-primary font-bold text-xs w-6 text-right">{detailLevel}%</span>
        </div>

        <button
          onClick={onAnalyze}
          disabled={loading || (inputMode === 'file' && !hasImage)}
          className={`
            px-6 py-2.5 text-xs font-bold uppercase tracking-wider rounded-md shadow-md transition-all shrink-0
            ${loading || (inputMode === 'file' && !hasImage)
              ? 'bg-gray-200 text-gray-400 cursor-not-allowed border border-gray-300' 
              : 'bg-corp-primary text-white hover:bg-blue-700 hover:shadow-lg border border-transparent active:scale-95'
            }
          `}
        >
          {loading 
            ? "Analizando..." 
            : inputMode === 'camera' && isCameraActive 
              ? "Capturar" 
              : inputMode === 'camera' 
                ? "Cámara"
                : "Analizar"
          }
        </button>
      </div>

    </div>
  );
};

export default Controls;