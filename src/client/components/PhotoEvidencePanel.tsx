import React, { useRef, useState } from 'react';
import { RoomSceneData } from '../../shared/types';
import {
  Camera,
  Upload,
  AlertOctagon,
  Eye,
  Sparkles,
  ShieldAlert,
  CheckCircle2,
} from 'lucide-react';

interface PhotoEvidencePanelProps {
  scene: RoomSceneData;
  onSelectObject: (id: string) => void;
  onUploadCustomPhoto: (base64: string, mimeType: string, title: string) => void;
  isAnalyzing: boolean;
}

export const PhotoEvidencePanel: React.FC<PhotoEvidencePanelProps> = ({
  scene,
  onSelectObject,
  onUploadCustomPhoto,
  isAnalyzing,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [showHotspots, setShowHotspots] = useState<boolean>(true);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      const commaIdx = result.indexOf(',');
      if (commaIdx !== -1) {
        const base64 = result.slice(commaIdx + 1);
        onUploadCustomPhoto(
          base64,
          file.type || 'image/jpeg',
          file.name.replace(/\.[^/.]+$/, '')
        );
      }
    };
    reader.readAsDataURL(file);
  };

  const isBathroomPreset = scene.id === 'parent-bathroom-accident';

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Camera className="w-4 h-4 text-sky-400" />
          <h3 className="text-sm font-bold text-white">
            Source Room Photo & 3-Layer Spatial Evidence
          </h3>
          {scene.originStoryBadge && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40">
              {scene.originStoryBadge}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowHotspots((s) => !s)}
            className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs transition"
          >
            <Eye className="w-3.5 h-3.5 text-sky-400" />
            {showHotspots ? 'Hide 3D Callouts' : 'Show 3D Callouts'}
          </button>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileChange}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isAnalyzing}
            className="flex items-center gap-1.5 px-3 py-1 rounded-md bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white text-xs font-semibold transition shadow"
          >
            <Upload className="w-3.5 h-3.5" />
            Upload Room Photo
          </button>
        </div>
      </div>

      {/* Main Photo Display with Interactive 3D Layer Hotspots */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-stretch">
        <div className="lg:col-span-7 relative rounded-lg overflow-hidden border border-slate-800 bg-slate-950 min-h-[210px] max-h-[265px] flex items-center justify-center">
          <img
            src={scene.photoUrl}
            alt={scene.title}
            className="w-full h-full object-cover max-h-[265px]"
          />

          {/* Interactive 3-Tier Hotspots for Parent's Bathroom Real Photo */}
          {showHotspots && isBathroomPreset && (
            <>
              {/* 1. Shattered Tempered Glass on Floor (Left-Bottom) */}
              <button
                onClick={() => onSelectObject('obj-overhead-glass-cabinet')}
                style={{ left: '14%', top: '62%' }}
                className="absolute group flex items-center gap-1.5 px-2 py-1 rounded-full bg-rose-600/95 text-white text-[11px] font-bold shadow-lg ring-2 ring-white/80 hover:scale-105 transition"
              >
                <AlertOctagon className="w-3.5 h-3.5 animate-pulse" />
                <span>[Overhead→Floor] Shattered Cabinet Glass</span>
              </button>

              {/* 2. Existing Wall Grab Bar (Top-Right) */}
              <button
                onClick={() => onSelectObject('obj-grab-bar')}
                style={{ left: '54%', top: '16%' }}
                className="absolute group flex items-center gap-1 px-2 py-1 rounded-full bg-sky-600/95 text-white text-[11px] font-bold shadow-lg ring-2 ring-white/80 hover:scale-105 transition"
              >
                <CheckCircle2 className="w-3 h-3" />
                <span>[Mid 78cm] Existing Grab Bar</span>
              </button>

              {/* 3. Protruding Shelf / Overhead Cabinet Zone (Right) */}
              <button
                onClick={() => onSelectObject('obj-overhead-glass-cabinet')}
                style={{ left: '62%', top: '38%' }}
                className="absolute group flex items-center gap-1 px-2 py-1 rounded-full bg-rose-700/95 text-white text-[11px] font-bold shadow-lg ring-2 ring-rose-300 hover:scale-105 transition"
              >
                <ShieldAlert className="w-3.5 h-3.5" />
                <span>[Overhead 128-178cm] Head-Strike Zone</span>
              </button>

              {/* 4. Floor Caddies Blocking Crutch Tips (Center-Right) */}
              <button
                onClick={() => onSelectObject('obj-mint-caddy')}
                style={{ left: '43%', top: '54%' }}
                className="absolute group flex items-center gap-1 px-2 py-1 rounded-full bg-amber-600/95 text-white text-[11px] font-bold shadow-lg ring-2 ring-white/80 hover:scale-105 transition"
              >
                <span>[Floor 0-30cm] Basin & Caddy Block Crutch Tip</span>
              </button>
            </>
          )}
        </div>

        {/* Right Side: Argon 3-Layer Causal Chain Explanation */}
        <div className="lg:col-span-5 flex flex-col justify-between bg-slate-950/90 border border-slate-800/90 rounded-lg p-3 space-y-2">
          <div>
            <div className="flex items-center gap-1.5 text-xs font-bold text-sky-400 uppercase tracking-wider mb-1">
              <Sparkles className="w-3.5 h-3.5" />
              Why 2D Checklists Missed This Accident
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              {scene.argonObservationSummary}
            </p>
          </div>

          <div className="bg-rose-950/35 border border-rose-500/30 rounded-lg p-2.5 text-[11px] space-y-1">
            <div className="font-bold text-rose-300">
              3D Domino Effect Caught by HomeFit 3D:
            </div>
            <div className="text-slate-300">
              <span className="text-amber-300 font-semibold">1. Floor [0–30cm]:</span> Blue basin & mint caddy block right crutch tip (stance narrowed to 44cm).
            </div>
            <div className="text-slate-300">
              <span className="text-sky-300 font-semibold">2. Mid [30–130cm]:</span> Reaching wall grab bar from narrowed base forces +28cm forward/lateral torso lean.
            </div>
            <div className="text-slate-300">
              <span className="text-rose-300 font-semibold">3. Overhead [130–190cm]:</span> Head trajectory arcs directly into protruding tempered-glass cabinet door.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
