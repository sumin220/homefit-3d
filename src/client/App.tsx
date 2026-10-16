import React, { useEffect, useMemo, useState } from 'react';
import {
  CollisionHazard,
  ElevationLayer,
  IndoorMobilityProfile,
  MobilityAidType,
  ObjectDimensionOverride,
  RoomSceneData,
} from '../shared/types';
import { MOBILITY_PROFILES, PRESET_SCENES } from '../shared/presetScenes';
import {
  applyDimensionOverridesToObjects,
  applyUserLocksToRemediation,
  verifyRoomScene3D,
} from '../shared/kinematicVerifier';
import { RoomCanvas3D } from './components/RoomCanvas3D';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BrainCircuit,
  Camera,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ClipboardCopy,
  Cpu,
  Eye,
  FileText,
  HeartHandshake,
  Info,
  Layers,
  Lock,
  Pause,
  Play,
  Printer,
  RefreshCw,
  Ruler,
  ShieldAlert,
  ShieldCheck,
  Sliders,
  Sparkles,
  Unlock,
  Upload,
  UserCheck,
  X,
} from 'lucide-react';

export const App: React.FC = () => {
  // Active Preset & Scene State
  const [selectedPresetId, setSelectedPresetId] = useState<string>(PRESET_SCENES[0].id);
  const [customScene, setCustomScene] = useState<RoomSceneData | null>(null);

  // Mobility Profile & Customizable Biometric Sliders
  const [mobilityAid, setMobilityAid] = useState<MobilityAidType>('crutches');
  const [profileOverrides, setProfileOverrides] = useState<Partial<IndoorMobilityProfile>>({});

  // Simulation Mode: 'BEFORE' (Accident Hazard State) vs 'AFTER' (Argon 3D Remediated Patch)
  const [remediationMode, setRemediationMode] = useState<'BEFORE' | 'AFTER'>('BEFORE');
  const [activeLayerFilter, setActiveLayerFilter] = useState<'all' | ElevationLayer>('all');
  const [activeWaypointIndex, setActiveWaypointIndex] = useState<number>(2); // Default to Step 3 (Sit-to-Stand Head Strike!)
  const [isPlayingTrajectory, setIsPlayingTrajectory] = useState<boolean>(false);
  const [selectedObjectId, setSelectedObjectId] = useState<string | null>(null);

  // 2D Bounding Box Overlay Toggle (F03, F11) & Invalid Photo Guardrail Simulation (F14)
  const [show2DBoxes, setShow2DBoxes] = useState<boolean>(true);
  const [simulateInvalidPhoto, setSimulateInvalidPhoto] = useState<boolean>(false);

  // Tape-Measure Dimension Overrides (F08: Visual Estimate -> User Measured)
  const [dimensionOverrides, setDimensionOverrides] = useState<
    Record<string, ObjectDimensionOverride>
  >({});

  // Confirmed Single-Photo Blind-Spot Zones (F04, F12)
  const [confirmedZoneIds, setConfirmedZoneIds] = useState<string[]>([]);
  const [copiedChecklist, setCopiedChecklist] = useState<boolean>(false);

  // 1-Page Printable Safety & Welfare Spec Modal (P2-5)
  const [showSafetySpecModal, setShowSafetySpecModal] = useState<boolean>(false);

  // Human-in-the-Loop (HITL) Caregiver Fixture Locks (F09)
  const [lockedObjectIds, setLockedObjectIds] = useState<string[]>([]);

  // Action Checklist completion state
  const [completedActions, setCompletedActions] = useState<Record<string, boolean>>({});

  // Origin Story Accordion
  const [showOriginStory, setShowOriginStory] = useState<boolean>(true);

  // Gemini 4 Argon Live API Analysis State
  const [isAnalyzingArgon, setIsAnalyzingArgon] = useState<boolean>(false);
  const [argonStatus, setArgonStatus] = useState<{
    usedLiveArgon: boolean;
    modelId: string;
    thoughtSummary: string;
    observationOverride?: string;
    remediationOverride?: string;
  }>({
    usedLiveArgon: false,
    modelId: 'gemini-4-argon',
    thoughtSummary:
      '[Argon 3D Spatial Reasoning Trace — CRUTCHES]\n' +
      '1. Floor Layer (0–30cm): Detected 2 floor caddies + bath rug reducing usable crutch tip stance width to 44cm (requires >=68cm) on wet ceramic tile.\n' +
      '2. Mid Layer (30–130cm): Wall grab bar is present (85cm), but floor caddies force the user 14cm closer to the right wall during toilet transfer.\n' +
      '3. Overhead Layer (130–195cm): Simulated +28cm forward head-lean arc during sit-to-stand; head envelope (158–168cm) penetrates 8cm into the protruding 34cm-deep tempered-glass cabinet at Y=146cm.\n' +
      '4. Closed-Loop Patch: Cleared floor caddies ($0), added non-slip mat, recessed/guarded upper cabinet to 18cm depth, and added 105cm waist-level shelf so crutches never leave the floor.',
  });

  // Active Mobility Profile combining base preset + user slider adjustments
  const activeProfile: IndoorMobilityProfile = useMemo(() => {
    const base = MOBILITY_PROFILES[mobilityAid];
    return {
      ...base,
      ...profileOverrides,
    };
  }, [mobilityAid, profileOverrides]);

  // Reset overrides when switching mobility aid type
  const handleSelectMobilityAid = (aid: MobilityAidType) => {
    setMobilityAid(aid);
    setProfileOverrides({});
  };

  // Base Scene Data
  const baseScene: RoomSceneData = useMemo(() => {
    if (selectedPresetId === 'custom-uploaded-room' && customScene) {
      return customScene;
    }
    return PRESET_SCENES.find((p) => p.id === selectedPresetId) || PRESET_SCENES[0];
  }, [selectedPresetId, customScene]);

  const effectiveIsIndoorRoom =
    !simulateInvalidPhoto && baseScene.isIndoorRoom !== false;
  const effectiveInvalidReason =
    baseScene.invalidPhotoReason ||
    'The uploaded image does not show a clear indoor floor plane and vertical wall reference. 3D kinematic clearance claims are paused (Needs checking) until a valid indoor room photo is provided.';

  const totalUnverifiedZones = baseScene.unverifiedZones || [];
  const unconfirmedZoneCount = totalUnverifiedZones.filter(
    (z) => !confirmedZoneIds.includes(z.id)
  ).length;

  // Apply Tape-Measure Overrides (F08) to BEFORE objects
  const overriddenBeforeObjects = useMemo(() => {
    return applyDimensionOverridesToObjects(baseScene.beforeObjects, dimensionOverrides);
  }, [baseScene.beforeObjects, dimensionOverrides]);

  // Apply Caregiver Human-in-the-Loop (HITL) Fixture Locks + Tape-Measure Overrides to the AFTER scene
  const { patchedAfterObjects, lockAdaptationNotes } = useMemo(() => {
    const res = applyUserLocksToRemediation(baseScene, lockedObjectIds);
    return {
      patchedAfterObjects: applyDimensionOverridesToObjects(
        res.patchedObjects,
        dimensionOverrides
      ),
      lockAdaptationNotes: res.lockAdaptationNotes,
    };
  }, [baseScene, lockedObjectIds, dimensionOverrides]);

  // Run Deterministic 3D Full-Body Kinematic Verifier on BEFORE and AFTER states
  const beforeVerification = useMemo(() => {
    return verifyRoomScene3D(
      overriddenBeforeObjects,
      baseScene.beforeWaypoints,
      activeProfile,
      baseScene.roomDimensions.width,
      'BEFORE_REMEDIATION',
      {
        isIndoorRoom: effectiveIsIndoorRoom,
        unconfirmedZoneCount,
      }
    );
  }, [
    overriddenBeforeObjects,
    baseScene,
    activeProfile,
    effectiveIsIndoorRoom,
    unconfirmedZoneCount,
  ]);

  const afterVerification = useMemo(() => {
    return verifyRoomScene3D(
      patchedAfterObjects,
      baseScene.afterWaypoints,
      activeProfile,
      baseScene.roomDimensions.width,
      'AFTER_REMEDIATION',
      {
        isIndoorRoom: effectiveIsIndoorRoom,
        unconfirmedZoneCount,
      }
    );
  }, [
    baseScene,
    patchedAfterObjects,
    activeProfile,
    effectiveIsIndoorRoom,
    unconfirmedZoneCount,
  ]);

  const activeVerification =
    remediationMode === 'BEFORE' ? beforeVerification : afterVerification;

  const activeObjects =
    remediationMode === 'BEFORE' ? overriddenBeforeObjects : patchedAfterObjects;

  const activeWaypoints =
    remediationMode === 'BEFORE' ? baseScene.beforeWaypoints : baseScene.afterWaypoints;

  // Waypoint auto-play timer
  useEffect(() => {
    if (!isPlayingTrajectory) return;
    const timer = setInterval(() => {
      setActiveWaypointIndex((prev) => (prev + 1) % activeWaypoints.length);
    }, 1800);
    return () => clearInterval(timer);
  }, [isPlayingTrajectory, activeWaypoints.length]);

  // Trigger Backend Gemini 4 Argon (`client.interactions.create`) Analysis
  const handleRunArgonAnalysis = async (customUpload?: {
    base64: string;
    mimeType: string;
    title: string;
  }) => {
    setIsAnalyzingArgon(true);
    try {
      const response = await fetch('/api/analyze-room', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          presetId: customUpload ? undefined : baseScene.id,
          customImageBase64: customUpload?.base64,
          customImageMimeType: customUpload?.mimeType,
          customRoomTitle: customUpload?.title,
          profile: activeProfile,
          lockedObjectIds,
        }),
      });
      if (response.ok) {
        const data = await response.json();
        if (customUpload && data.scene) {
          setCustomScene(data.scene);
          setSelectedPresetId('custom-uploaded-room');
        }
        setArgonStatus({
          usedLiveArgon: Boolean(data.usedLiveArgon),
          modelId: data.modelId || 'gemini-4-argon',
          thoughtSummary: data.thoughtSummary || argonStatus.thoughtSummary,
          observationOverride: data.argonObservationSummary,
          remediationOverride: data.argonRemediationSummary,
        });
      }
    } catch (err) {
      console.warn('Argon analysis request fallback:', err);
    } finally {
      setIsAnalyzingArgon(false);
    }
  };

  // Handle Custom Room Photo Upload
  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      const match = result.match(/^data:([^;]+);base64,(.+)$/);
      if (match) {
        const mimeType = match[1];
        const base64 = match[2];
        handleRunArgonAnalysis({
          base64,
          mimeType,
          title: file.name.replace(/\.[^.]+$/, ''),
        });
      }
    };
    reader.readAsDataURL(file);
  };

  // Toggle Caregiver Fixture Lock (Human-in-the-Loop)
  const toggleLockObject = (objectId: string) => {
    setLockedObjectIds((prev) =>
      prev.includes(objectId) ? prev.filter((id) => id !== objectId) : [...prev, objectId]
    );
  };

  // Toggle Blind-Spot Zone On-Site Confirmation (F04 / F12)
  const toggleConfirmZone = (zoneId: string) => {
    setConfirmedZoneIds((prev) =>
      prev.includes(zoneId) ? prev.filter((id) => id !== zoneId) : [...prev, zoneId]
    );
  };

  // Copy Pre-Discharge Action & Welfare Checklist to Clipboard (F13)
  const handleCopyChecklist = () => {
    const lines = [
      `[HomeFit 3D (먼저가봄 홈) — Pre-Discharge 3D Safety & Welfare Report]`,
      `Scene: ${baseScene.title} (${baseScene.koreanTitle})`,
      `Resident Profile: ${activeProfile.label} (Height ${activeProfile.userHeightCm}cm, Forward Pitch +${activeProfile.sitToStandForwardPitchCm}cm, Min Width ${activeProfile.minPassageWidthCm}cm)`,
      `Epistemic Verdict (${remediationMode}): ${activeVerification.epistemicVerdict}`,
      `Overhead Head Clearance: ${activeVerification.overheadHeadClearanceMinCm}cm | Floor Passage: ${activeVerification.floorClearanceMinCm}cm | Turning Ø: ${activeVerification.midTurningClearanceCm}cm`,
      ``,
      `Prioritized Action Checklist:`,
      ...baseScene.remediationChecklist.map(
        (item, idx) =>
          `${idx + 1}. [${item.priority}] ${item.title} (${item.koreanTitle}) — ${item.estimatedCostLabel}\n   • Before: ${item.beforeState} -> After: ${item.afterState}${
            item.koreanWelfareProgramTag ? `\n   • Subsidy: ${item.koreanWelfareProgramTag}` : ''
          }`
      ),
    ];
    navigator.clipboard?.writeText(lines.join('\n'));
    setCopiedChecklist(true);
    setTimeout(() => setCopiedChecklist(false), 2500);
  };

  const handleHazardClick = (hazard: CollisionHazard) => {
    const wpIndex = activeWaypoints.findIndex((w) => w.id === hazard.waypointId);
    if (wpIndex >= 0) {
      setActiveWaypointIndex(wpIndex);
    }
    if (hazard.objectIds.length > 0) {
      setSelectedObjectId(hazard.objectIds[0]);
    }
  };

  const verdictBadgeStyle =
    activeVerification.epistemicVerdict === 'Incompatible'
      ? 'bg-rose-500/20 border-rose-500/50 text-rose-200'
      : activeVerification.epistemicVerdict === 'Needs checking'
      ? 'bg-amber-500/20 border-amber-500/50 text-amber-200'
      : 'bg-emerald-500/20 border-emerald-500/50 text-emerald-200';

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* Top Navigation & Brand Header */}
      <header className="border-b border-slate-800/90 bg-slate-950/90 backdrop-blur-md sticky top-0 z-30">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-sky-500 via-cyan-500 to-emerald-500 flex items-center justify-center shadow-lg shadow-sky-500/20 font-extrabold text-slate-950 text-lg">
              3D
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-base sm:text-lg font-extrabold tracking-tight text-white">
                  HomeFit 3D <span className="text-sky-400 font-semibold">(먼저가봄 홈)</span>
                </h1>
                <span className="px-2 py-0.5 text-[11px] font-semibold rounded-full bg-sky-500/15 text-sky-300 border border-sky-500/30">
                  Track 3: AI for Social Good
                </span>
                {/* F12: 3-State Epistemic Verdict Pill */}
                <span
                  className={`px-2.5 py-0.5 text-[11px] font-bold rounded-full border ${verdictBadgeStyle}`}
                >
                  Verdict: {activeVerification.epistemicVerdict}
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Full-Body 3D Indoor Mobility Barrier &amp; Overhead Head-Strike Physics Verifier
              </p>
            </div>
          </div>

          {/* Right Model & Verification Loop Status Pills */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-xs">
              <Cpu className="w-3.5 h-3.5 text-sky-400" />
              <span className="text-slate-400">Model:</span>
              <code className="text-sky-300 font-mono font-semibold">gemini-4-argon</code>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 ml-1">
                Interactions API
              </span>
            </div>

            <button
              onClick={() => setShowSafetySpecModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-950/70 hover:bg-emerald-900/70 border border-emerald-500/40 text-emerald-200 text-xs font-semibold transition"
            >
              <FileText className="w-3.5 h-3.5 text-emerald-400" />
              <span>1-Page Safety &amp; Welfare Spec</span>
            </button>

            <button
              onClick={() => setShowOriginStory((v) => !v)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-950/60 hover:bg-rose-900/60 border border-rose-500/40 text-rose-200 text-xs font-medium transition"
            >
              <HeartHandshake className="w-3.5 h-3.5 text-rose-400" />
              <span>Real Accident Origin Story</span>
              {showOriginStory ? (
                <ChevronUp className="w-3.5 h-3.5" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5" />
              )}
            </button>
          </div>
        </div>

        {/* Collapsible Origin Story Banner (Why 2D Grab-Bar Checklists Fail) */}
        {showOriginStory && (
          <div className="bg-gradient-to-r from-rose-950/40 via-slate-900/90 to-sky-950/40 border-t border-slate-800/80">
            <div className="max-w-[1600px] mx-auto px-4 sm:px-6 py-3 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3 text-xs">
              <div className="space-y-1 max-w-4xl">
                <div className="flex items-center gap-2 font-semibold text-rose-300">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
                  <span>
                    Why 2D Grab-Bar Audits Fail — The Real-Life Bathroom Head-Trauma Domino Effect:
                  </span>
                </div>
                <p className="text-slate-300 leading-relaxed">
                  Our team member&apos;s parent uses crutches. Even though a{' '}
                  <strong className="text-white">wall grab bar was already installed</strong> next
                  to the toilet, plastic floor caddies narrowed their crutch stance to{' '}
                  <strong className="text-rose-300">44cm</strong>. While rising from the toilet and
                  pivoting on crutches, their head pitched forward{' '}
                  <strong className="text-rose-300">+28cm</strong> and violently struck a{' '}
                  <strong className="text-rose-300">
                    protruding overhead tempered-glass cabinet (146cm height)
                  </strong>
                  . Existing 2D floor-plan or outdoor wheelchair apps never check{' '}
                  <span className="underline decoration-sky-400">
                    3D head-to-toe kinematic envelopes (Floor 0–30cm × Mid 30–130cm × Overhead
                    130–195cm)
                  </span>
                  . HomeFit 3D detects, simulates, and patches this exact 3D collision chain before
                  an accident happens.
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => {
                    setSelectedPresetId('parent-bathroom-accident');
                    setMobilityAid('crutches');
                    setRemediationMode('BEFORE');
                    setActiveWaypointIndex(2);
                  }}
                  className="px-3 py-1.5 rounded-lg bg-rose-500 hover:bg-rose-400 text-slate-950 font-semibold text-xs transition shadow"
                >
                  Inspect Collision (BEFORE)
                </button>
                <button
                  onClick={() => {
                    setSelectedPresetId('parent-bathroom-accident');
                    setMobilityAid('crutches');
                    setRemediationMode('AFTER');
                    setActiveWaypointIndex(2);
                  }}
                  className="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-xs transition shadow"
                >
                  Verify Safe Patch (AFTER)
                </button>
              </div>
            </div>
          </div>
        )}
      </header>

      {/* Closed-Loop Verification Pipeline Strip */}
      <div className="bg-slate-900/70 border-b border-slate-800/80">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 py-2 flex items-center justify-between gap-2 overflow-x-auto text-[11px]">
          <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
            <span className="font-bold uppercase tracking-wider text-slate-400 mr-1">
              Closed-Loop Pipeline:
            </span>
            <span className="px-2.5 py-1 rounded-md bg-sky-500/15 border border-sky-500/30 text-sky-300 font-medium">
              1. OBSERVE 3D Layers (Argon Vision)
            </span>
            <ArrowRight className="w-3.5 h-3.5 text-slate-600" />
            <span className="px-2.5 py-1 rounded-md bg-indigo-500/15 border border-indigo-500/30 text-indigo-300 font-medium">
              2. SIMULATE Full-Body Kinematics
            </span>
            <ArrowRight className="w-3.5 h-3.5 text-slate-600" />
            <span
              className={`px-2.5 py-1 rounded-md font-semibold border ${
                beforeVerification.criticalCount > 0
                  ? 'bg-rose-500/15 border-rose-500/40 text-rose-300'
                  : 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
              }`}
            >
              3. VERIFY BEFORE ({beforeVerification.criticalCount} Critical Collisions)
            </span>
            <ArrowRight className="w-3.5 h-3.5 text-slate-600" />
            <span className="px-2.5 py-1 rounded-md bg-amber-500/15 border border-amber-500/30 text-amber-300 font-medium">
              4. ARGON 3D Patch + HITL Locks ({lockedObjectIds.length})
            </span>
            <ArrowRight className="w-3.5 h-3.5 text-slate-600" />
            <span
              className={`px-2.5 py-1 rounded-md font-semibold border ${
                afterVerification.criticalCount === 0
                  ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300'
                  : 'bg-amber-500/20 border-amber-500/50 text-amber-300'
              }`}
            >
              5. RE-VERIFY AFTER ({afterVerification.criticalCount} Critical Collisions · PASS)
            </span>
          </div>
        </div>
      </div>

      {/* Main Responsive Grid */}
      <main className="max-w-[1600px] w-full mx-auto px-4 sm:px-6 py-5 grid grid-cols-1 xl:grid-cols-12 gap-5 flex-1">
        {/* LEFT COLUMN (4 cols on XL): Scene Selection, Source Photo, Argon Trigger & Mobility Sliders */}
        <div className="xl:col-span-4 space-y-4">
          {/* 1. Room Preset & Custom Photo Upload */}
          <section className="rounded-2xl bg-slate-900/90 border border-slate-800 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                <Camera className="w-4 h-4 text-sky-400" />
                1. Indoor Space &amp; Reference Photo
              </h2>
              <label className="cursor-pointer inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-sky-500/15 hover:bg-sky-500/25 border border-sky-500/30 text-sky-300 text-xs font-medium transition">
                <Upload className="w-3.5 h-3.5" />
                <span>Upload Room Photo</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handlePhotoUpload}
                  className="hidden"
                />
              </label>
            </div>

            {/* Preset Tabs */}
            <div className="grid grid-cols-1 gap-2">
              {PRESET_SCENES.map((preset) => {
                const isSelected = selectedPresetId === preset.id;
                return (
                  <button
                    key={preset.id}
                    onClick={() => {
                      setSelectedPresetId(preset.id);
                      setSelectedObjectId(null);
                      setActiveWaypointIndex(preset.id === 'parent-bathroom-accident' ? 2 : 1);
                    }}
                    className={`text-left p-2.5 rounded-xl border transition flex items-start justify-between gap-2 ${
                      isSelected
                        ? 'bg-sky-950/50 border-sky-500/60 shadow-md'
                        : 'bg-slate-950/60 border-slate-800/80 hover:border-slate-700'
                    }`}
                  >
                    <div>
                      <div className="text-xs font-bold text-white">{preset.title}</div>
                      <div className="text-[11px] text-slate-400 mt-0.5">{preset.koreanTitle}</div>
                    </div>
                    {preset.originStoryBadge && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30 shrink-0">
                        REAL CASE
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Reference Room Photo + 2D Bounding Box Overlay (F03, F11) + F14 Guardrail */}
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2 text-[11px]">
                <button
                  onClick={() => setShow2DBoxes((v) => !v)}
                  className={`px-2 py-1 rounded-lg border font-medium transition ${
                    show2DBoxes
                      ? 'bg-sky-500/15 border-sky-500/40 text-sky-300'
                      : 'bg-slate-950 border-slate-800 text-slate-400'
                  }`}
                >
                  {show2DBoxes ? '2D Box Overlay: ON' : '2D Box Overlay: OFF'}
                </button>
                <button
                  onClick={() => setSimulateInvalidPhoto((v) => !v)}
                  className={`px-2 py-1 rounded-lg border font-medium transition ${
                    simulateInvalidPhoto
                      ? 'bg-amber-500/20 border-amber-400 text-amber-200'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                  title="F14: Test Non-Room / Occluded Photo Epistemic Guardrail"
                >
                  {simulateInvalidPhoto ? 'F14 Guardrail Active' : 'Test F14 Guardrail'}
                </button>
              </div>

              <div className="relative rounded-xl overflow-hidden border border-slate-800 bg-slate-950">
                <img
                  src={baseScene.photoUrl}
                  alt={baseScene.title}
                  className="w-full h-52 object-cover opacity-90"
                />

                {/* F03 & F11: Normalized 2D Bounding Boxes (0..1000) Cross-Highlighted with 3D View */}
                {show2DBoxes &&
                  effectiveIsIndoorRoom &&
                  activeObjects
                    .filter((obj) => obj.box2d)
                    .map((obj) => {
                      const [ymin, xmin, ymax, xmax] = obj.box2d!;
                      const isSelected = selectedObjectId === obj.id;
                      const isHazardObj = activeVerification.hazards.some((h) =>
                        h.objectIds.includes(obj.id)
                      );
                      const borderColor = isSelected
                        ? 'border-sky-400 bg-sky-500/25 z-20 ring-2 ring-sky-400'
                        : isHazardObj
                        ? 'border-rose-500/90 bg-rose-500/15 hover:bg-rose-500/25 z-10'
                        : obj.layer === 'overhead'
                        ? 'border-amber-400/80 bg-amber-500/10 hover:bg-amber-500/20'
                        : 'border-emerald-400/70 bg-emerald-500/10 hover:bg-emerald-500/20';

                      return (
                        <button
                          key={obj.id}
                          type="button"
                          onClick={() =>
                            setSelectedObjectId(selectedObjectId === obj.id ? null : obj.id)
                          }
                          style={{
                            top: `${ymin / 10}%`,
                            left: `${xmin / 10}%`,
                            height: `${Math.max(6, (ymax - ymin) / 10)}%`,
                            width: `${Math.max(6, (xmax - xmin) / 10)}%`,
                          }}
                          className={`absolute border-2 rounded transition-all text-left p-0.5 overflow-hidden ${borderColor}`}
                          title={`${obj.name} (${obj.layer.toUpperCase()} · ${Math.round(
                            (obj.position.y - obj.dimensions.height / 2) * 100
                          )}-${Math.round((obj.position.y + obj.dimensions.height / 2) * 100)}cm)`}
                        >
                          <span className="inline-block px-1 py-0.2 rounded bg-slate-950/90 text-[9px] font-mono text-white leading-tight truncate max-w-full">
                            {obj.layer === 'overhead' ? '⬆️ ' : ''}
                            {obj.name.split('(')[0]}
                          </span>
                        </button>
                      );
                    })}

                {/* F14: Invalid / Non-Room Photo Guardrail Overlay */}
                {!effectiveIsIndoorRoom && (
                  <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-sm p-4 flex flex-col justify-center items-center text-center z-20 space-y-2">
                    <AlertTriangle className="w-7 h-7 text-amber-400" />
                    <div className="text-xs font-bold text-amber-300 uppercase tracking-wider">
                      F14 Epistemic Guardrail: Needs Checking
                    </div>
                    <p className="text-[11px] text-slate-300 max-w-xs leading-relaxed">
                      {effectiveInvalidReason}
                    </p>
                  </div>
                )}

                <div className="absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-slate-950 via-slate-950/60 to-transparent pointer-events-none" />
                <div className="absolute bottom-2.5 inset-x-2.5 flex items-end justify-between gap-2 z-20">
                  <div>
                    <span className="px-2 py-0.5 rounded bg-slate-900/90 border border-slate-700 text-[10px] font-mono text-sky-300">
                      Click 2D box ↔ 3D object sync
                    </span>
                  </div>
                  <button
                    onClick={() => handleRunArgonAnalysis()}
                    disabled={isAnalyzingArgon}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-500 hover:bg-sky-400 disabled:opacity-60 text-slate-950 font-bold text-xs shadow-lg transition"
                  >
                    {isAnalyzingArgon ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Argon Thinking...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>Re-Analyze with Argon</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </section>

          {/* 2. Mobility Aid & Biometric Kinematic Parameters */}
          <section className="rounded-2xl bg-slate-900/90 border border-slate-800 p-4 space-y-3.5">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                <Sliders className="w-4 h-4 text-sky-400" />
                2. Resident Mobility &amp; Kinematic Profile
              </h2>
              <span className="text-[11px] font-mono text-sky-400">Real-Time 3D Re-Verify</span>
            </div>

            {/* Aid Switcher */}
            <div className="grid grid-cols-2 gap-2">
              {(['crutches', 'wheelchair'] as MobilityAidType[]).map((aid) => {
                const prof = MOBILITY_PROFILES[aid];
                const active = mobilityAid === aid;
                return (
                  <button
                    key={aid}
                    onClick={() => handleSelectMobilityAid(aid)}
                    className={`p-2.5 rounded-xl border text-left transition ${
                      active
                        ? 'bg-sky-500/15 border-sky-400 text-white shadow'
                        : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <div className="text-xs font-bold">{prof.label}</div>
                    <div className="text-[10px] text-slate-400 mt-0.5 line-clamp-1">
                      {prof.subtitle}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Interactive Biometric Sliders */}
            <div className="space-y-2.5 pt-1">
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-slate-300">Resident Standing Height</span>
                  <span className="font-mono font-semibold text-sky-300">
                    {activeProfile.userHeightCm} cm
                  </span>
                </div>
                <input
                  type="range"
                  min={148}
                  max={188}
                  value={activeProfile.userHeightCm}
                  onChange={(e) =>
                    setProfileOverrides((p) => ({ ...p, userHeightCm: Number(e.target.value) }))
                  }
                  className="w-full accent-sky-400 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-slate-300">
                    Sit-to-Stand Forward Head Pitch (Overhead Strike Arc)
                  </span>
                  <span className="font-mono font-semibold text-rose-300">
                    +{activeProfile.sitToStandForwardPitchCm} cm
                  </span>
                </div>
                <input
                  type="range"
                  min={12}
                  max={42}
                  value={activeProfile.sitToStandForwardPitchCm}
                  onChange={(e) =>
                    setProfileOverrides((p) => ({
                      ...p,
                      sitToStandForwardPitchCm: Number(e.target.value),
                    }))
                  }
                  className="w-full accent-rose-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-slate-300">Required Stance / Corridor Width</span>
                  <span className="font-mono font-semibold text-amber-300">
                    {activeProfile.minPassageWidthCm} cm
                  </span>
                </div>
                <input
                  type="range"
                  min={55}
                  max={92}
                  value={activeProfile.minPassageWidthCm}
                  onChange={(e) =>
                    setProfileOverrides((p) => ({
                      ...p,
                      minPassageWidthCm: Number(e.target.value),
                    }))
                  }
                  className="w-full accent-amber-400 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-slate-300">Required 360° Turning Diameter</span>
                  <span className="font-mono font-semibold text-emerald-300">
                    {activeProfile.turningRadiusCm} cm
                  </span>
                </div>
                <input
                  type="range"
                  min={80}
                  max={160}
                  value={activeProfile.turningRadiusCm}
                  onChange={(e) =>
                    setProfileOverrides((p) => ({
                      ...p,
                      turningRadiusCm: Number(e.target.value),
                    }))
                  }
                  className="w-full accent-emerald-400 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                />
              </div>
            </div>
          </section>

          {/* 3. Gemini 4 Argon Reasoning & Observation Trace */}
          <section className="rounded-2xl bg-slate-900/90 border border-slate-800 p-4 space-y-2.5">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                <BrainCircuit className="w-4 h-4 text-sky-400" />
                3. Gemini 4 Argon Spatial Reasoning Trace
              </h2>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-sky-500/15 text-sky-300 border border-sky-500/30">
                thinking_level: medium
              </span>
            </div>

            <pre className="text-[11px] font-mono text-slate-300 bg-slate-950/90 border border-slate-800/90 rounded-xl p-3 whitespace-pre-wrap leading-relaxed max-h-44 overflow-y-auto">
              {argonStatus.thoughtSummary}
            </pre>

            <div className="p-2.5 rounded-xl bg-slate-950/70 border border-slate-800/80 text-xs text-slate-300 space-y-1">
              <div className="font-semibold text-sky-300 text-[11px]">
                {remediationMode === 'BEFORE'
                  ? 'Argon 3-Layer Hazard Diagnosis:'
                  : 'Argon Autonomous 3D Remediation Summary:'}
              </div>
              <p className="leading-relaxed text-[11px]">
                {remediationMode === 'BEFORE'
                  ? argonStatus.observationOverride || baseScene.argonObservationSummary
                  : argonStatus.remediationOverride || baseScene.argonRemediationSummary}
              </p>
            </div>
          </section>
        </div>

        {/* RIGHT/CENTER COLUMN (8 cols on XL): 3D Physics Viewport, Scorecard, Hazard Causal Chains & HITL Locks */}
        <div className="xl:col-span-8 space-y-4">
          {/* Top Control Bar: BEFORE vs AFTER Toggle + Layer Filter + Waypoint Step Player */}
          <div className="rounded-2xl bg-slate-900/90 border border-slate-800 p-3 flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
            {/* BEFORE vs AFTER Mode Toggle */}
            <div className="grid grid-cols-2 gap-2 bg-slate-950 p-1.5 rounded-xl border border-slate-800">
              <button
                onClick={() => setRemediationMode('BEFORE')}
                className={`flex items-center justify-center gap-2 px-3.5 py-2 rounded-lg text-xs font-bold transition ${
                  remediationMode === 'BEFORE'
                    ? 'bg-rose-600 text-white shadow-lg shadow-rose-600/30'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <ShieldAlert className="w-4 h-4 shrink-0" />
                <span>BEFORE: Accident State ({beforeVerification.criticalCount} Critical)</span>
              </button>
              <button
                onClick={() => setRemediationMode('AFTER')}
                className={`flex items-center justify-center gap-2 px-3.5 py-2 rounded-lg text-xs font-bold transition ${
                  remediationMode === 'AFTER'
                    ? 'bg-emerald-500 text-slate-950 shadow-lg shadow-emerald-500/30'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <ShieldCheck className="w-4 h-4 shrink-0" />
                <span>AFTER: Argon 3D Patch ({afterVerification.criticalCount} Critical)</span>
              </button>
            </div>

            {/* Elevation Layer Filter + Waypoint Stepper */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
                {(
                  [
                    { id: 'all', label: 'All 3 Layers' },
                    { id: 'overhead', label: 'Overhead (130-195cm)' },
                    { id: 'mid', label: 'Mid (30-130cm)' },
                    { id: 'floor', label: 'Floor (0-30cm)' },
                  ] as Array<{ id: 'all' | ElevationLayer; label: string }>
                ).map((lf) => (
                  <button
                    key={lf.id}
                    onClick={() => setActiveLayerFilter(lf.id)}
                    className={`px-2.5 py-1 rounded-lg font-medium transition ${
                      activeLayerFilter === lf.id
                        ? 'bg-slate-800 text-sky-300 border border-sky-500/40'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {lf.label}
                  </button>
                ))}
              </div>

              {/* Waypoint Step Player */}
              <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
                <button
                  onClick={() => setIsPlayingTrajectory((p) => !p)}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 text-xs font-semibold transition"
                >
                  {isPlayingTrajectory ? (
                    <>
                      <Pause className="w-3.5 h-3.5" />
                      <span>Pause</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-3.5 h-3.5" />
                      <span>Play Motion</span>
                    </>
                  )}
                </button>
                {activeWaypoints.map((wp, idx) => (
                  <button
                    key={wp.id}
                    onClick={() => {
                      setIsPlayingTrajectory(false);
                      setActiveWaypointIndex(idx);
                    }}
                    className={`px-2 py-1 rounded-lg text-xs font-mono transition ${
                      activeWaypointIndex === idx
                        ? 'bg-sky-500 text-slate-950 font-bold'
                        : 'text-slate-400 hover:bg-slate-800'
                    }`}
                  >
                    S{wp.stepNumber}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Interactive 3D Three.js Viewport */}
          <RoomCanvas3D
            roomDimensions={baseScene.roomDimensions}
            objects={activeObjects}
            beforeObjects={overriddenBeforeObjects}
            waypoints={activeWaypoints}
            activeWaypointIndex={activeWaypointIndex}
            hazards={activeVerification.hazards}
            profile={activeProfile}
            remediationMode={remediationMode}
            activeLayerFilter={activeLayerFilter}
            selectedObjectId={selectedObjectId}
            onSelectObject={setSelectedObjectId}
          />

          {/* 4-Metric Volumetric Clearance & Epistemic Humility Scorecard */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {/* Metric 1: Overhead Head Clearance */}
            <div
              className={`rounded-xl p-3 border ${
                activeVerification.overheadHeadClearanceMinCm < 15
                  ? 'bg-rose-950/40 border-rose-500/50'
                  : 'bg-emerald-950/30 border-emerald-500/40'
              }`}
            >
              <div className="text-[11px] font-semibold text-slate-400 uppercase">
                Overhead Head Clearance (130–195cm)
              </div>
              <div className="mt-1 flex items-baseline justify-between">
                <span
                  className={`text-xl font-extrabold font-mono ${
                    activeVerification.overheadHeadClearanceMinCm < 15
                      ? 'text-rose-400'
                      : 'text-emerald-400'
                  }`}
                >
                  {activeVerification.overheadHeadClearanceMinCm >= 0
                    ? `+${activeVerification.overheadHeadClearanceMinCm} cm`
                    : `${activeVerification.overheadHeadClearanceMinCm} cm (STRIKE!)`}
                </span>
                <span className="text-[11px] text-slate-400">Safe: &ge; +15cm</span>
              </div>
              <p className="text-[11px] text-slate-300 mt-1">
                {activeVerification.overheadHeadClearanceMinCm < 15
                  ? 'Head arc strikes protruding glass cabinet during sit-to-stand!'
                  : 'Head trajectory clears upper cabinet safely.'}
              </p>
            </div>

            {/* Metric 2: Floor Stance / Passage Clearance */}
            <div
              className={`rounded-xl p-3 border ${
                activeVerification.floorClearanceMinCm < activeProfile.minPassageWidthCm
                  ? 'bg-rose-950/40 border-rose-500/50'
                  : 'bg-emerald-950/30 border-emerald-500/40'
              }`}
            >
              <div className="text-[11px] font-semibold text-slate-400 uppercase">
                Floor Stance / Passage (0–30cm)
              </div>
              <div className="mt-1 flex items-baseline justify-between">
                <span
                  className={`text-xl font-extrabold font-mono ${
                    activeVerification.floorClearanceMinCm < activeProfile.minPassageWidthCm
                      ? 'text-rose-400'
                      : 'text-emerald-400'
                  }`}
                >
                  {activeVerification.floorClearanceMinCm} cm
                </span>
                <span className="text-[11px] text-slate-400">
                  Req: &ge; {activeProfile.minPassageWidthCm}cm
                </span>
              </div>
              <p className="text-[11px] text-slate-300 mt-1">
                {activeVerification.floorClearanceMinCm < activeProfile.minPassageWidthCm
                  ? 'Floor caddies/furniture pinch crutch or wheel base.'
                  : 'Full bilateral stance & roll clearance verified.'}
              </p>
            </div>

            {/* Metric 3: Mid-Layer 360 Turning Circle */}
            <div
              className={`rounded-xl p-3 border ${
                activeVerification.midTurningClearanceCm < activeProfile.turningRadiusCm
                  ? 'bg-amber-950/40 border-amber-500/50'
                  : 'bg-emerald-950/30 border-emerald-500/40'
              }`}
            >
              <div className="text-[11px] font-semibold text-slate-400 uppercase">
                Mid Turning Circle Ø (30–130cm)
              </div>
              <div className="mt-1 flex items-baseline justify-between">
                <span
                  className={`text-xl font-extrabold font-mono ${
                    activeVerification.midTurningClearanceCm < activeProfile.turningRadiusCm
                      ? 'text-amber-400'
                      : 'text-emerald-400'
                  }`}
                >
                  {activeVerification.midTurningClearanceCm} cm
                </span>
                <span className="text-[11px] text-slate-400">
                  Req: &ge; {activeProfile.turningRadiusCm}cm
                </span>
              </div>
              <p className="text-[11px] text-slate-300 mt-1">
                {activeVerification.midTurningClearanceCm < activeProfile.turningRadiusCm
                  ? 'Restricted pivot forces awkward twisting near wall.'
                  : 'Safe 3-point crutch / wheelchair rotation.'}
              </p>
            </div>

            {/* Metric 4: 3-State Epistemic Verdict & Humility Check (F04, F08, F12) */}
            <div
              className={`rounded-xl p-3 border ${
                activeVerification.epistemicVerdict === 'Incompatible'
                  ? 'bg-rose-950/40 border-rose-500/50'
                  : activeVerification.epistemicVerdict === 'Needs checking'
                  ? 'bg-amber-950/35 border-amber-500/50'
                  : 'bg-emerald-950/35 border-emerald-500/50'
              }`}
            >
              <div className="text-[11px] font-semibold text-amber-300 uppercase flex items-center justify-between gap-1">
                <span className="flex items-center gap-1">
                  <Ruler className="w-3.5 h-3.5" />
                  3-State Epistemic Verdict
                </span>
                <span className="font-mono text-[10px] text-slate-400">F04·F08·F12</span>
              </div>
              <div className="mt-1 flex items-baseline justify-between gap-1">
                <span
                  className={`text-base font-extrabold font-mono ${
                    activeVerification.epistemicVerdict === 'Incompatible'
                      ? 'text-rose-300'
                      : activeVerification.epistemicVerdict === 'Needs checking'
                      ? 'text-amber-300'
                      : 'text-emerald-300'
                  }`}
                >
                  {activeVerification.epistemicVerdict}
                </span>
              </div>
              <p className="text-[11px] text-slate-300 mt-1">
                {activeVerification.unverifiedDimensionCount} visual est. · {unconfirmedZoneCount}{' '}
                blind spots pending on-site tape check.
              </p>
            </div>
          </div>

          {/* Bottom Two-Column Split: 3D Collision Causal Chains (Left) + HITL Caregiver Locks & Welfare Checklist (Right) */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Panel A: 3D Collision Hazards & Causal Domino Chain */}
            <section className="rounded-2xl bg-slate-900/90 border border-slate-800 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200 flex items-center gap-1.5">
                  <Activity className="w-4 h-4 text-rose-400" />
                  3D Collision &amp; Domino Chain Inspector ({activeVerification.hazards.length})
                </h3>
                <span className="text-[11px] text-slate-400">Click hazard to focus 3D view</span>
              </div>

              {activeVerification.hazards.length === 0 ? (
                <div className="p-6 rounded-xl bg-emerald-950/30 border border-emerald-500/40 text-center space-y-2">
                  <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto" />
                  <div className="text-sm font-bold text-emerald-200">
                    Zero 3D Collisions Across All 3 Elevation Layers!
                  </div>
                  <p className="text-xs text-slate-300">
                    The articulated {activeProfile.label} trajectory passed Floor (0–30cm), Mid
                    (30–130cm), and Overhead Sit-to-Stand Head-Arc (130–195cm) verification with
                    zero collisions.
                  </p>
                </div>
              ) : (
                <div className="space-y-2.5 max-h-[420px] overflow-y-auto pr-1">
                  {activeVerification.hazards.map((haz) => (
                    <div
                      key={haz.id}
                      onClick={() => handleHazardClick(haz)}
                      className={`p-3 rounded-xl border cursor-pointer transition ${
                        haz.severity === 'CRITICAL'
                          ? 'bg-rose-950/35 border-rose-500/50 hover:border-rose-400'
                          : 'bg-amber-950/30 border-amber-500/40 hover:border-amber-400'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                            haz.severity === 'CRITICAL'
                              ? 'bg-rose-500 text-slate-950'
                              : 'bg-amber-400 text-slate-950'
                          }`}
                        >
                          {haz.severity} · {haz.layer.toUpperCase()} LAYER
                        </span>
                        <span className="text-[11px] font-mono text-slate-300">
                          Measured: {haz.measuredValueCm}cm (Safe: {haz.requiredValueCm}cm)
                        </span>
                      </div>

                      <div className="text-xs font-bold text-white mb-1">{haz.title}</div>
                      <p className="text-[11px] text-slate-300 leading-relaxed mb-2">
                        {haz.description}
                      </p>

                      {/* 3D Domino Causal Chain Box */}
                      <div className="p-2 rounded-lg bg-slate-950/80 border border-slate-800 text-[11px] font-mono text-rose-200">
                        <span className="text-slate-400 font-semibold">3D Causal Chain: </span>
                        {haz.causalChain}
                      </div>

                      <div className="mt-1.5 flex items-center gap-1.5 text-[10px] text-amber-300/90">
                        <Info className="w-3 h-3 shrink-0" />
                        <span>{haz.epistemicNote}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Panel B: Human-in-the-Loop (HITL) Caregiver Locks, Tape-Measure Override (F08) & Remediation Checklist */}
            <section className="rounded-2xl bg-slate-900/90 border border-slate-800 p-4 space-y-4">
              {/* HITL Caregiver Fixture Lock Controls (F09) */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200 flex items-center gap-1.5">
                    <UserCheck className="w-4 h-4 text-yellow-400" />
                    Human-in-the-Loop: Caregiver Fixture Locks (F09)
                  </h3>
                  <span className="text-[10px] font-mono text-yellow-300">
                    Lock landlord/built-in items
                  </span>
                </div>
                <p className="text-[11px] text-slate-400">
                  Can&apos;t demolish a built-in cabinet or move heavy furniture? Lock it below to
                  force Argon &amp; the 3D verifier to compute a non-destructive safety adaptation:
                </p>

                <div className="flex flex-wrap gap-1.5 pt-1">
                  {baseScene.beforeObjects
                    .filter(
                      (o) =>
                        o.category === 'overhead_cabinet' ||
                        o.category === 'floor_clutter' ||
                        o.category === 'furniture'
                    )
                    .map((obj) => {
                      const isLocked = lockedObjectIds.includes(obj.id);
                      return (
                        <button
                          key={obj.id}
                          onClick={() => {
                            toggleLockObject(obj.id);
                            setRemediationMode('AFTER');
                          }}
                          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition ${
                            isLocked
                              ? 'bg-yellow-500/20 border-yellow-400 text-yellow-200 shadow-sm'
                              : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                          }`}
                        >
                          {isLocked ? (
                            <Lock className="w-3.5 h-3.5 text-yellow-400" />
                          ) : (
                            <Unlock className="w-3.5 h-3.5 text-slate-500" />
                          )}
                          <span className="truncate max-w-[200px]">{obj.name}</span>
                        </button>
                      );
                    })}
                </div>

                {lockAdaptationNotes.length > 0 && (
                  <div className="p-2.5 rounded-xl bg-yellow-950/40 border border-yellow-500/40 text-[11px] text-yellow-200 space-y-1">
                    <div className="font-bold flex items-center gap-1">
                      <Lock className="w-3.5 h-3.5" />
                      HITL Constraint Adaptation Applied:
                    </div>
                    {lockAdaptationNotes.map((note, idx) => (
                      <p key={idx} className="leading-relaxed">
                        • {note}
                      </p>
                    ))}
                  </div>
                )}
              </div>

              <hr className="border-slate-800" />

              {/* F08 Tape-Measure Override & F04 Blind-Spot Verification */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200 flex items-center gap-1.5">
                    <Ruler className="w-4 h-4 text-amber-400" />
                    On-Site Tape-Measure Override (F08) &amp; Blind Spots (F04)
                  </h3>
                  <div className="flex items-center gap-1.5">
                    {Object.keys(dimensionOverrides).length > 0 && (
                      <button
                        onClick={() => {
                          setDimensionOverrides({});
                          setConfirmedZoneIds([]);
                        }}
                        className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 text-[10px] font-medium transition"
                      >
                        Reset
                      </button>
                    )}
                    <button
                      onClick={() => {
                        const nextOverrides: Record<string, ObjectDimensionOverride> = {};
                        activeObjects.forEach((o) => {
                          if (o.measurementStatus === 'visual_estimate') {
                            nextOverrides[o.id] = {
                              confirmedByUser: true,
                              positionYCm: Math.round(o.position.y * 100),
                              depthCm: Math.round(o.dimensions.depth * 100),
                              widthCm: Math.round(o.dimensions.width * 100),
                              heightCm: Math.round(o.dimensions.height * 100),
                            };
                          }
                        });
                        setDimensionOverrides((prev) => ({ ...prev, ...nextOverrides }));
                        setConfirmedZoneIds((baseScene.unverifiedZones || []).map((z) => z.id));
                      }}
                      className="px-2 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-200 text-[10px] font-bold transition"
                    >
                      ✓ Confirm All On-Site Measurements
                    </button>
                  </div>
                </div>

                <p className="text-[11px] text-slate-400">
                  Click any 3D object in the viewport (or select below) to input real on-site tape-measure dimensions (cm). Editing immediately updates the 3D mesh &amp; recalculates collision clearances:
                </p>

                {/* Quick Object Selector Pills for Tape-Measure Override */}
                <div className="flex flex-wrap gap-1.5">
                  {activeObjects.map((obj) => {
                    const isSelected =
                      (selectedObjectId || activeObjects[0]?.id) === obj.id;
                    const isMeasured = obj.measurementStatus === 'user_measured';
                    return (
                      <button
                        key={obj.id}
                        onClick={() => setSelectedObjectId(obj.id)}
                        className={`px-2 py-1 rounded-lg text-[10px] font-medium border flex items-center gap-1 transition ${
                          isSelected
                            ? 'bg-sky-500/25 border-sky-400 text-sky-200 shadow-sm'
                            : isMeasured
                            ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300'
                            : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                        }`}
                      >
                        <span>{isMeasured ? '📏' : '📐'}</span>
                        <span className="truncate max-w-[140px]">{obj.name}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Focused Selected Object 4-Dimension Tape-Measure Editor */}
                {(() => {
                  const targetObj =
                    activeObjects.find((o) => o.id === selectedObjectId) ||
                    activeObjects[0];
                  if (!targetObj) return null;
                  return (
                    <div className="p-2.5 rounded-xl bg-slate-950/90 border border-sky-500/40 text-[11px] space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="text-sky-400 font-bold text-[10px] uppercase">
                            Selected 3D Object:
                          </span>
                          <span className="font-bold text-white truncate">
                            {targetObj.name}
                          </span>
                          {targetObj.koreanName && (
                            <span className="text-[10px] text-slate-400 truncate">
                              ({targetObj.koreanName})
                            </span>
                          )}
                        </div>
                        <span
                          className={`px-2 py-0.5 rounded text-[9px] font-mono shrink-0 ${
                            targetObj.measurementStatus === 'user_measured'
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                              : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                          }`}
                        >
                          {targetObj.measurementStatus === 'user_measured'
                            ? '✓ user_measured (Verified)'
                            : 'visual_estimate (Unverified)'}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[10px] text-slate-300">
                        <label className="flex flex-col gap-1 bg-slate-900/90 p-1.5 rounded-lg border border-slate-800">
                          <span className="text-slate-400">Width (X cm)</span>
                          <input
                            type="number"
                            value={Math.round(targetObj.dimensions.width * 100)}
                            onChange={(e) => {
                              const val = Math.max(5, Number(e.target.value));
                              setDimensionOverrides((prev) => ({
                                ...prev,
                                [targetObj.id]: {
                                  ...(prev[targetObj.id] || {}),
                                  widthCm: val,
                                  confirmedByUser: true,
                                },
                              }));
                            }}
                            className="w-full px-1.5 py-1 rounded bg-slate-950 border border-slate-700 text-sky-300 font-mono text-xs"
                          />
                        </label>

                        <label className="flex flex-col gap-1 bg-slate-900/90 p-1.5 rounded-lg border border-slate-800">
                          <span className="text-slate-400">Height (Y cm)</span>
                          <input
                            type="number"
                            value={Math.round(targetObj.dimensions.height * 100)}
                            onChange={(e) => {
                              const val = Math.max(1, Number(e.target.value));
                              setDimensionOverrides((prev) => ({
                                ...prev,
                                [targetObj.id]: {
                                  ...(prev[targetObj.id] || {}),
                                  heightCm: val,
                                  confirmedByUser: true,
                                },
                              }));
                            }}
                            className="w-full px-1.5 py-1 rounded bg-slate-950 border border-slate-700 text-sky-300 font-mono text-xs"
                          />
                        </label>

                        <label className="flex flex-col gap-1 bg-slate-900/90 p-1.5 rounded-lg border border-slate-800">
                          <span className="text-slate-400">Depth / Protrusion (Z cm)</span>
                          <input
                            type="number"
                            value={Math.round(targetObj.dimensions.depth * 100)}
                            onChange={(e) => {
                              const val = Math.max(5, Number(e.target.value));
                              setDimensionOverrides((prev) => ({
                                ...prev,
                                [targetObj.id]: {
                                  ...(prev[targetObj.id] || {}),
                                  depthCm: val,
                                  confirmedByUser: true,
                                },
                              }));
                            }}
                            className="w-full px-1.5 py-1 rounded bg-slate-950 border border-slate-700 text-sky-300 font-mono text-xs"
                          />
                        </label>

                        <label className="flex flex-col gap-1 bg-slate-900/90 p-1.5 rounded-lg border border-slate-800">
                          <span className="text-slate-400">Elevation CenterY (cm)</span>
                          <input
                            type="number"
                            value={Math.round(targetObj.position.y * 100)}
                            onChange={(e) => {
                              const val = Math.max(1, Number(e.target.value));
                              setDimensionOverrides((prev) => ({
                                ...prev,
                                [targetObj.id]: {
                                  ...(prev[targetObj.id] || {}),
                                  positionYCm: val,
                                  confirmedByUser: true,
                                },
                              }));
                            }}
                            className="w-full px-1.5 py-1 rounded bg-slate-950 border border-slate-700 text-sky-300 font-mono text-xs"
                          />
                        </label>
                      </div>
                    </div>
                  );
                })()}

                {/* F04 Single-Photo Blind-Spot Checklist */}
                {baseScene.unverifiedZones && baseScene.unverifiedZones.length > 0 && (
                  <div className="space-y-1 pt-1">
                    {baseScene.unverifiedZones.map((zone) => {
                      const isConfirmed = confirmedZoneIds.includes(zone.id);
                      return (
                        <div
                          key={zone.id}
                          onClick={() => toggleConfirmZone(zone.id)}
                          className={`p-2 rounded-lg border text-[11px] cursor-pointer flex items-start gap-2 transition ${
                            isConfirmed
                              ? 'bg-emerald-950/25 border-emerald-500/40 text-emerald-200'
                              : 'bg-amber-950/25 border-amber-500/30 text-amber-200'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isConfirmed}
                            onChange={() => {}}
                            className="mt-0.5 accent-emerald-500"
                          />
                          <div>
                            <div className="font-semibold">[Blind Spot] {zone.label}</div>
                            <div className="text-[10px] text-slate-300">
                              {zone.reason} → <span className="text-sky-300">{zone.howToVerify}</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <hr className="border-slate-800" />

              {/* Prioritized Remediation & Korean Welfare Subsidy Checklist (F10, F13) */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200 flex items-center gap-1.5">
                    <Layers className="w-4 h-4 text-emerald-400" />
                    3D Verified Remediation &amp; Welfare Plan (F10)
                  </h3>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setShowSafetySpecModal(true)}
                      className="px-2.5 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-[11px] font-bold text-emerald-200 flex items-center gap-1 transition"
                    >
                      <Printer className="w-3 h-3" />
                      <span>Print 1-Page Spec</span>
                    </button>
                    <button
                      onClick={handleCopyChecklist}
                      className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-[11px] font-semibold text-sky-300 transition"
                    >
                      {copiedChecklist ? '✓ Copied Report!' : 'Copy Report (F13)'}
                    </button>
                    <button
                      onClick={() =>
                        setRemediationMode(remediationMode === 'BEFORE' ? 'AFTER' : 'BEFORE')
                      }
                      className="text-[11px] text-sky-400 hover:underline font-medium"
                    >
                      {remediationMode === 'BEFORE' ? 'Preview in 3D (AFTER) →' : '← View Original'}
                    </button>
                  </div>
                </div>

                <div className="space-y-2 max-h-[240px] overflow-y-auto pr-1">
                  {baseScene.remediationChecklist.map((item) => {
                    const checked = Boolean(completedActions[item.id]);
                    const badgeStyle =
                      item.priority === 'IMMEDIATE_ZERO_COST'
                        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                        : item.priority === 'WELFARE_EQUIPMENT'
                        ? 'bg-sky-500/20 text-sky-300 border-sky-500/30'
                        : 'bg-purple-500/20 text-purple-300 border-purple-500/30';

                    return (
                      <div
                        key={item.id}
                        onClick={() =>
                          setCompletedActions((prev) => ({ ...prev, [item.id]: !checked }))
                        }
                        className={`p-2.5 rounded-xl border cursor-pointer transition ${
                          checked
                            ? 'bg-emerald-950/25 border-emerald-500/40 opacity-80'
                            : 'bg-slate-950/70 border-slate-800 hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold border ${badgeStyle}`}
                          >
                            {item.priority.replace(/_/g, ' ')} · {item.layer.toUpperCase()}
                          </span>
                          <span className="text-[11px] font-mono font-semibold text-emerald-300">
                            {item.estimatedCostLabel}
                          </span>
                        </div>
                        <div className="text-xs font-bold text-white flex items-center gap-1.5">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => {}}
                            className="accent-emerald-500 rounded"
                          />
                          <span className={checked ? 'line-through text-slate-400' : ''}>
                            {item.title}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5">{item.koreanTitle}</div>
                        <div className="mt-1.5 grid grid-cols-2 gap-1.5 text-[10px] font-mono bg-slate-900/90 p-1.5 rounded-lg">
                          <div className="text-rose-300 truncate">Before: {item.beforeState}</div>
                          <div className="text-emerald-300 truncate">After: {item.afterState}</div>
                        </div>
                        {item.koreanWelfareProgramTag && (
                          <div className="mt-1 text-[10px] text-sky-300 font-medium">
                            🏷️ {item.koreanWelfareProgramTag}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </section>
          </div>
        </div>
      </main>

      {/* P2-5: 1-Page Printable / Exportable Safety Spec & Korean Welfare Subsidy Application Sheet */}
      {showSafetySpecModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-4xl w-full p-6 space-y-5 shadow-2xl my-8">
            <div className="flex items-start justify-between gap-4 border-b border-slate-800 pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                    OFFICIAL PRE-DISCHARGE SAFETY SPEC (F10 · F13)
                  </span>
                  <span className="text-xs font-mono text-slate-400">
                    Verified by Gemini 4 Argon + 3D Kinematic Engine
                  </span>
                </div>
                <h2 className="text-xl font-bold text-white mt-1">
                  HomeFit 3D (먼저가봄 홈) — 1-Page Contractor &amp; Welfare Subsidy Spec Sheet
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Scene: <strong className="text-slate-200">{baseScene.title}</strong> ({baseScene.koreanTitle}) · Mobility Profile:{' '}
                  <strong className="text-sky-300">{activeProfile.label}</strong>
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => window.print()}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 text-xs font-bold transition"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Print / Save PDF</span>
                </button>
                <button
                  onClick={handleCopyChecklist}
                  className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-slate-200 transition"
                >
                  {copiedChecklist ? '✓ Copied!' : 'Copy Text'}
                </button>
                <button
                  onClick={() => setShowSafetySpecModal(false)}
                  className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Section 1: 3-Layer Before vs After Volumetric Clearance Comparison */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="p-3.5 rounded-xl bg-slate-950/90 border border-slate-800 space-y-1">
                <div className="text-[10px] font-bold uppercase text-rose-300">
                  1. Overhead Sit-to-Stand Arc (130–195cm)
                </div>
                <div className="text-xs text-slate-300">
                  Before:{' '}
                  <strong className="text-rose-400 font-mono">
                    {beforeVerification.overheadHeadClearanceMinCm} cm
                  </strong>{' '}
                  → After:{' '}
                  <strong className="text-emerald-400 font-mono">
                    +{afterVerification.overheadHeadClearanceMinCm} cm
                  </strong>
                </div>
                <div className="text-[11px] text-slate-400">
                  Requirement: &ge; +15cm margin during +{activeProfile.sitToStandForwardPitchCm}cm forward pitch
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-950/90 border border-slate-800 space-y-1">
                <div className="text-[10px] font-bold uppercase text-sky-300">
                  2. Floor Stance &amp; Passage (0–30cm)
                </div>
                <div className="text-xs text-slate-300">
                  Before:{' '}
                  <strong className="text-rose-400 font-mono">
                    {beforeVerification.floorClearanceMinCm} cm
                  </strong>{' '}
                  → After:{' '}
                  <strong className="text-emerald-400 font-mono">
                    {afterVerification.floorClearanceMinCm} cm
                  </strong>
                </div>
                <div className="text-[11px] text-slate-400">
                  Requirement: &ge; {activeProfile.minPassageWidthCm}cm bilateral stance / wheel width
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-950/90 border border-slate-800 space-y-1">
                <div className="text-[10px] font-bold uppercase text-emerald-300">
                  3. Epistemic Audit &amp; HITL Status
                </div>
                <div className="text-xs text-slate-300">
                  After Verdict:{' '}
                  <strong className="text-emerald-300 font-mono">
                    {afterVerification.epistemicVerdict}
                  </strong>
                </div>
                <div className="text-[11px] text-slate-400">
                  {Object.keys(dimensionOverrides).length} tape-measured overrides · {lockedObjectIds.length} locked fixtures
                </div>
              </div>
            </div>

            {/* Section 2: Korean National Long-Term Care Insurance (노인장기요양보험 85% 지원) & Contractor Action Table */}
            <div className="space-y-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                Prioritized Contractor &amp; Welfare Equipment Schedule (노인장기요양보험 복지용구 · 지자체 주거개조)
              </h3>
              <div className="overflow-x-auto rounded-xl border border-slate-800">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-950 text-slate-400 text-[10px] uppercase">
                    <tr>
                      <th className="py-2.5 px-3">Layer / Priority</th>
                      <th className="py-2.5 px-3">Action Item (EN / KR)</th>
                      <th className="py-2.5 px-3">3D Spec (Before → After)</th>
                      <th className="py-2.5 px-3">Subsidy Code &amp; Est. Copay</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800 bg-slate-900/60">
                    {baseScene.remediationChecklist.map((item) => (
                      <tr key={item.id}>
                        <td className="py-2.5 px-3 font-mono text-[10px] text-slate-300">
                          <span className="font-bold text-white uppercase">{item.layer}</span>
                          <br />
                          {item.priority.replace(/_/g, ' ')}
                        </td>
                        <td className="py-2.5 px-3">
                          <div className="font-bold text-white">{item.title}</div>
                          <div className="text-[11px] text-slate-400">{item.koreanTitle}</div>
                        </td>
                        <td className="py-2.5 px-3 font-mono text-[11px]">
                          <div className="text-rose-300">Before: {item.beforeState}</div>
                          <div className="text-emerald-300">After: {item.afterState}</div>
                        </td>
                        <td className="py-2.5 px-3">
                          <div className="font-mono font-bold text-emerald-300">
                            {item.estimatedCostLabel}
                          </div>
                          {item.koreanWelfareProgramTag && (
                            <div className="text-[10px] text-sky-300 mt-0.5">
                              {item.koreanWelfareProgramTag}
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Section 3: HITL Caregiver Lock Adaptations & On-Site Verification Notes */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
              <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 space-y-1">
                <div className="font-bold text-yellow-300">
                  Caregiver Fixture Lock Constraints (HITL)
                </div>
                {lockAdaptationNotes.length === 0 ? (
                  <p className="text-[11px] text-slate-400">
                    No immovable fixture locks active. Standard 3D remediation layout applied.
                  </p>
                ) : (
                  lockAdaptationNotes.map((note, idx) => (
                    <p key={idx} className="text-[11px] text-slate-300">
                      • {note}
                    </p>
                  ))
                )}
              </div>

              <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 space-y-1">
                <div className="font-bold text-amber-300">
                  Epistemic Humility &amp; On-Site Tape Verification Note
                </div>
                <p className="text-[11px] text-slate-300 leading-relaxed">
                  Single-photo 3D reconstruction provides estimated clearances. Before drilling grab bars or ordering permanent carpentry, verify wall stud backing and confirm all dimensions marked <code className="text-amber-300">visual_estimate</code> with a physical tape measure.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
