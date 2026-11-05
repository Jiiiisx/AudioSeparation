import React, { useState } from 'react';
import { Waves, Sparkles, Music, Upload, Link2, AlertCircle, Loader2 } from 'lucide-react';

interface TopNavbarProps {
  onSelectPreset: (genre: 'edm' | 'pop' | 'rock') => void;
  activePreset: string;
  onFileUpload: (file: File) => void;
  onFetchSpotify: (url: string) => Promise<void>;
  isProcessingUrl: boolean;
  serverStatus: 'online' | 'offline' | 'checking';
}

export const TopNavbar: React.FC<TopNavbarProps> = ({
  onSelectPreset,
  activePreset,
  onFileUpload,
  onFetchSpotify,
  isProcessingUrl,
  serverStatus,
}) => {
  const [spotifyUrl, setSpotifyUrl] = useState('');
  const [urlMessage, setUrlMessage] = useState<string | null>(null);

  const handleUrlSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!spotifyUrl.trim()) return;

    setUrlMessage(null);
    try {
      await onFetchSpotify(spotifyUrl);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Gagal memproses URL';
      setUrlMessage(msg);
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onFileUpload(file);
    }
  };

  return (
    <header className="bg-slate-900/90 border-b border-slate-800 sticky top-0 z-50 backdrop-blur-md px-4 py-3">
      <div className="max-w-7xl mx-auto flex flex-col lg:flex-row items-center justify-between gap-4">
        {/* Brand & Academic Meta */}
        <div className="flex items-center gap-3 w-full lg:w-auto justify-between lg:justify-start">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/20">
              <Waves className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-slate-100 text-sm tracking-tight">Riemann Audio Lab</span>
                <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
                  Pertemuan 11
                </span>
              </div>
              <p className="text-[11px] text-slate-400 hidden sm:block">
                Deteksi Bass & Akumulasi Energi Musik Menggunakan Jumlah Riemann
              </p>
            </div>
          </div>

          {/* Status Server */}
          <div className="flex items-center gap-1.5 text-[11px] font-mono text-slate-400 bg-slate-950 px-2.5 py-1 rounded-full border border-slate-800">
            <span
              className={`w-2 h-2 rounded-full ${
                serverStatus === 'online'
                  ? 'bg-emerald-400 shadow-sm shadow-emerald-400/50'
                  : serverStatus === 'checking'
                  ? 'bg-amber-400 animate-pulse'
                  : 'bg-slate-500'
              }`}
            />
            <span>{serverStatus === 'online' ? 'Backend AI Ready' : 'Client DSP (Offline Ready)'}</span>
          </div>
        </div>

        {/* Input Spotify URL Bar */}
        <form onSubmit={handleUrlSubmit} className="flex-1 max-w-xl w-full flex items-center gap-2">
          <div className="relative flex-1">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
              <Link2 className="w-4 h-4 text-emerald-400" />
            </div>
            <input
              type="text"
              placeholder="Paste Spotify Song / YouTube Track URL..."
              value={spotifyUrl}
              onChange={(e) => setSpotifyUrl(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition font-mono"
            />
          </div>
          <button
            type="submit"
            disabled={isProcessingUrl || !spotifyUrl.trim()}
            className="px-3 py-1.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:opacity-50 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition shadow-sm whitespace-nowrap cursor-pointer disabled:cursor-not-allowed"
          >
            {isProcessingUrl ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Memproses...
              </>
            ) : (
              <>
                <Sparkles className="w-3.5 h-3.5" /> Fetch & Split
              </>
            )}
          </button>
        </form>

        {/* 1-Click Presets & File Upload */}
        <div className="flex items-center gap-1.5 w-full lg:w-auto justify-end overflow-x-auto pb-1 lg:pb-0">
          <span className="text-[11px] font-mono text-slate-400 mr-1 hidden xl:inline">Preset:</span>
          {(['edm', 'pop', 'rock'] as const).map((p) => (
            <button
              key={p}
              onClick={() => onSelectPreset(p)}
              className={`px-2.5 py-1 rounded-lg text-xs font-mono font-medium transition cursor-pointer flex items-center gap-1 ${
                activePreset === p
                  ? 'bg-cyan-600 text-white shadow-md shadow-cyan-600/30'
                  : 'bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-800'
              }`}
            >
              <Music className="w-3 h-3" />
              {p.toUpperCase()}
            </button>
          ))}

          {/* Upload Custom File */}
          <label className="px-2.5 py-1 rounded-lg text-xs font-mono text-slate-400 hover:text-slate-200 bg-slate-950 border border-slate-800 hover:border-slate-700 flex items-center gap-1 cursor-pointer transition">
            <Upload className="w-3 h-3 text-cyan-400" />
            <span>Upload</span>
            <input
              type="file"
              accept="audio/*"
              onChange={handleFileInput}
              className="hidden"
            />
          </label>
        </div>
      </div>

      {urlMessage && (
        <div className="max-w-7xl mx-auto mt-2 text-xs font-mono text-amber-300 bg-amber-950/40 border border-amber-800/60 px-3 py-1.5 rounded-lg flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 text-amber-400" />
          <span>{urlMessage}</span>
        </div>
      )}
    </header>
  );
};
