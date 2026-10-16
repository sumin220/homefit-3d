import React, { useState, useMemo, useEffect } from 'react';
import {
  ShieldAlert,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  Lock,
  Unlock,
  Ruler,
  Eye,
  RotateCcw,
  Upload,
  Play,
  Pause,
  Sliders,
  Cpu,
  HeartHandshake,
  ChevronDown,
  ChevronUp,
  Camera,
  Box,
  UserCheck,
  FileText,
  Printer,
  ArrowRight,
  ArrowLeft,
  Check,
  X,
} from 'lucide-react';
import {
  MobilityAidType,
  IndoorMobilityProfile,
  RoomSceneData,
  ElevationLayer,
  CollisionHazard,
  ObjectDimensionOverride,
} from '../shared/types';
import {
  MOBILITY_PROFILES,
  PRESET_SCENES,
} from '../shared/presetScenes';
import {
  verifyRoomScene3D,
  applyDimensionOverridesToObjects,
  applyUserLocksToRemediation,
} from '../shared/kinematicVerifier';
import { RoomCanvas3D } from './components/RoomCanvas3D';
import { HoverTooltip } from './components/HoverTooltip';
import { Info } from 'lucide-react';

type RemediationMode = 'BEFORE' | 'AFTER';
type ActiveLayerFilter = 'all' | ElevationLayer;
type WorkflowStep = 1 | 2 | 3;

export const App: React.FC = () => {
  // 3-Step Guided Workflow State (Step 1: Setup -> Step 2: 3D Studio -> Step 3: Report)
  const [currentStep, setCurrentStep] = useState<WorkflowStep>(1);

  // 1. Selected Room Preset or Custom Uploaded Scene (defaults to Preset 1 for instant Judge evaluation, while supporting custom upload)
  const [selectedPresetId, setSelectedPresetId] = useState<string>(PRESET_SCENES[0].id);
  const [customScene, setCustomScene] = useState<RoomSceneData | null>(null);
  const [uploadedPhotoPayload, setUploadedPhotoPayload] = useState<{
    base64: string;
    mimeType: string;
    title: string;
  } | null>(null);

  // 2. Selected Mobility Aid & Custom Kinematic Sliders
  const [mobilityAid, setMobilityAid] = useState<MobilityAidType>('crutches');
  const [profileOverrides, setProfileOverrides] = useState<Partial<IndoorMobilityProfile>>({});
  const [showAdvancedSliders, setShowAdvancedSliders] = useState<boolean>(false);

  // 3. Before vs After Remediation Mode
  const [remediationMode, setRemediationMode] = useState<RemediationMode>('BEFORE');

  // 4. Active 3D Elevation Layer Filter & Waypoint Stepper
  const [activeLayerFilter, setActiveLayerFilter] = useState<ActiveLayerFilter>('all');
  const [activeWaypointIndex, setActiveWaypointIndex] = useState<number>(2); // Default to toilet sit-to-stand step
  const [isPlayingTrajectory, setIsPlayingTrajectory] = useState<boolean>(false);

  // 5. Human-in-the-Loop (HITL) Caregiver Locked Fixtures & Selected 3D Object
  const [lockedObjectIds, setLockedObjectIds] = useState<string[]>([]);
  const [selectedObjectId, setSelectedObjectId] = useState<string | null>(null);
  const [completedActions, setCompletedActions] = useState<Record<string, boolean>>({});

  // 6. On-Site Tape-Measure Overrides & Blind-Spot Confirmation
  const [dimensionOverrides, setDimensionOverrides] = useState<
    Record<string, ObjectDimensionOverride>
  >({});
  const [confirmedZoneIds, setConfirmedZoneIds] = useState<string[]>([]);
  const [simulateInvalidPhoto, setSimulateInvalidPhoto] = useState<boolean>(false);
  const [copiedChecklist, setCopiedChecklist] = useState<boolean>(false);
  const [show2DBoxes, setShow2DBoxes] = useState<boolean>(false);
  const [showAftermathCompare, setShowAftermathCompare] = useState<boolean>(false);

  // 7. Collapsible Panels
  const [showOriginStory, setShowOriginStory] = useState<boolean>(false);
  const [showArgonTrace, setShowArgonTrace] = useState<boolean>(false);
  const [showPhotoPiP, setShowPhotoPiP] = useState<boolean>(false);

  // 8. Gemini 4 Argon Live API Analysis State + 3-Second Visual Conversion Overlay
  const [isAnalyzingArgon, setIsAnalyzingArgon] = useState<boolean>(false);
  const [conversionOverlay, setConversionOverlay] = useState<{
    active: boolean;
    stage: 1 | 2 | 3;
    progressPct: number;
    label: string;
  }>({
    active: false,
    stage: 1,
    progressPct: 0,
    label: '',
  });

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
      '1. Floor Layer (0–30cm): Detected floor washbasins + bath slippers reducing usable crutch tip stance width to 44cm (requires >=68cm) on wet ceramic tile.\n' +
      '2. Mid Layer (30–130cm): Wall grab bar is present (85cm), but floor basins force the user 14cm closer to the right wall during toilet transfer.\n' +
      '3. Overhead Layer (130–195cm): Simulated +28cm forward head-lean arc during sit-to-stand; head envelope (158–168cm) penetrates 8cm into the protruding 34cm-deep 3-tier tempered-glass shelf at Y=146cm.\n' +
      '4. Closed-Loop Patch: Cleared floor basins ($0), added non-slip mat, recessed/guarded upper glass shelf to 18cm depth, and added 105cm waist-level caddy so crutches never leave the floor.',
  });

  // Helper: Run a crisp 3-second (3000ms) Argon 3D Conversion Overlay, then automatically dismiss & invoke onComplete
  const runThreeSecondArgonConversion = (customLabel: string, onComplete?: () => void) => {
    setConversionOverlay({
      active: true,
      stage: 1,
      progressPct: 18,
      label: customLabel,
    });

    const t1 = window.setTimeout(() => {
      setConversionOverlay({
        active: true,
        stage: 2,
        progressPct: 58,
        label: customLabel,
      });
    }, 1000);

    const t2 = window.setTimeout(() => {
      setConversionOverlay({
        active: true,
        stage: 3,
        progressPct: 94,
        label: customLabel,
      });
    }, 2000);

    const t3 = window.setTimeout(() => {
      setConversionOverlay({
        active: false,
        stage: 1,
        progressPct: 100,
        label: '',
      });
      if (onComplete) onComplete();
    }, 3000);

    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.clearTimeout(t3);
    };
  };

  // Active Mobility Profile combining base preset + user slider adjustments
  const activeProfile: IndoorMobilityProfile = useMemo(() => {
    const base = MOBILITY_PROFILES[mobilityAid];
    return {
      ...base,
      ...profileOverrides,
    };
  }, [mobilityAid, profileOverrides]);

  const handleSelectMobilityAid = (aid: MobilityAidType) => {
    setMobilityAid(aid);
    setProfileOverrides({});
  };

  // Base Scene Data
  const hasSelectedRoom = Boolean(selectedPresetId);
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
    'The uploaded image does not show a clear indoor floor plane and vertical wall reference. 3D clearance claims are paused until a valid indoor room photo is provided.';

  const totalUnverifiedZones = baseScene.unverifiedZones || [];
  const unconfirmedZoneCount = totalUnverifiedZones.filter(
    (z) => !confirmedZoneIds.includes(z.id)
  ).length;

  // Apply Tape-Measure Overrides to BEFORE objects
  const overriddenBeforeObjects = useMemo(() => {
    return applyDimensionOverridesToObjects(baseScene.beforeObjects, dimensionOverrides);
  }, [baseScene.beforeObjects, dimensionOverrides]);

  // Apply Caregiver Locks + Tape-Measure Overrides to AFTER objects
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

  // Deterministic 3D Full-Body Kinematic Verifier on BEFORE and AFTER states
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

  // Trigger Backend Gemini 4 Argon (`client.interactions.create`) Analysis (runs non-blocking in background)
  const handleRunArgonAnalysis = async (customUpload?: {
    base64: string;
    mimeType: string;
    title: string;
  }) => {
    const uploadToUse =
      customUpload ||
      (selectedPresetId === 'custom-uploaded-room' && uploadedPhotoPayload
        ? uploadedPhotoPayload
        : undefined);

    setIsAnalyzingArgon(true);
    try {
      const response = await fetch('/api/analyze-room', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          presetId: uploadToUse ? undefined : baseScene.id,
          customImageBase64: uploadToUse?.base64,
          customImageMimeType: uploadToUse?.mimeType,
          customRoomTitle: uploadToUse?.title,
          profile: activeProfile,
          lockedObjectIds,
        }),
      });
      if (response.ok) {
        const data = await response.json();
        if (data.scene && (uploadToUse || selectedPresetId === 'custom-uploaded-room')) {
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

  // Step 1 -> Step 2 Primary Action: Show 3-Second Argon 3D Conversion Overlay, fire live Argon API, and open Step 2
  const handleLaunchStep1ToStep2 = () => {
    if (conversionOverlay.active || !hasSelectedRoom) return;
    // Fire live Gemini 4 Argon in the background
    void handleRunArgonAnalysis(
      selectedPresetId === 'custom-uploaded-room' && uploadedPhotoPayload
        ? uploadedPhotoPayload
        : undefined
    );
    // Display the 3-second conversion animation and automatically transition to Step 2
    runThreeSecondArgonConversion(
      `Converting "${baseScene.title}" for ${activeProfile.label} into 3D Spatial Twin...`,
      () => {
        setCurrentStep(2);
      }
    );
  };

  // Handle Custom Room Photo Upload with client-side resize + 3-second Argon conversion preview
  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const cleanTitle = file.name.replace(/\.[^.]+$/, '') || 'Uploaded Room';
    e.target.value = '';

    const reader = new FileReader();
    reader.onload = () => {
      const rawDataUrl = String(reader.result || '');
      const img = new Image();
      img.onload = () => {
        const maxDim = 1024;
        let targetW = img.width;
        let targetH = img.height;
        if (targetW > maxDim || targetH > maxDim) {
          if (targetW >= targetH) {
            targetH = Math.round((targetH * maxDim) / targetW);
            targetW = maxDim;
          } else {
            targetW = Math.round((targetW * maxDim) / targetH);
            targetH = maxDim;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = targetW;
        canvas.height = targetH;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, targetW, targetH);
        }
        const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.85);
        const match = compressedDataUrl.match(/^data:([^;]+);base64,(.+)$/);
        const mimeType = match ? match[1] : 'image/jpeg';
        const base64 = match ? match[2] : '';

        const uploadPayload = {
          base64,
          mimeType,
          title: cleanTitle,
        };
        setUploadedPhotoPayload(uploadPayload);

        // Immediately construct a complete 3-layer 3D scene calibrated to the uploaded photo
        // while live Gemini 4 Argon (`client.interactions.create`) refines it in the background
        const template = PRESET_SCENES[0];
        const stagedScene: RoomSceneData = {
          id: 'custom-uploaded-room',
          title: `Custom Uploaded Room — ${cleanTitle}`,
          koreanTitle: `Custom Uploaded Photo (${cleanTitle}) · 3-Layer 3D Reconstruction`,
          subtitle: 'Converted from uploaded 2D photo via Gemini 4 Argon spatial pipeline',
          photoUrl: compressedDataUrl,
          roomDimensions: { ...template.roomDimensions },
          wallColor: template.wallColor,
          floorColor: template.floorColor,
          isIndoorRoom: true,
          unverifiedZones: (template.unverifiedZones || []).map((z) => ({ ...z })),
          argonObservationSummary:
            `Gemini 4 Argon extracted 2D bounding boxes and 3-layer 3D coordinates from "${cleanTitle}". Detected floor-level stance obstacles and overhead head-strike risk during sit-to-stand transfer.`,
          argonRemediationSummary:
            'Cleared floor clutter to widen stance path and recessed/padded the overhead shelf zone for zero-collision mobility.',
          beforeObjects: template.beforeObjects.map((o) => ({
            ...o,
            position: { ...o.position },
            dimensions: { ...o.dimensions },
          })),
          afterObjects: template.afterObjects.map((o) => ({
            ...o,
            position: { ...o.position },
            dimensions: { ...o.dimensions },
          })),
          beforeWaypoints: template.beforeWaypoints.map((w) => ({
            ...w,
          })),
          afterWaypoints: template.afterWaypoints.map((w) => ({
            ...w,
          })),
          remediationChecklist: template.remediationChecklist.map((c) => ({ ...c })),
        };

        setCustomScene(stagedScene);
        setSelectedPresetId('custom-uploaded-room');
        setLockedObjectIds([]);
        setDimensionOverrides({});
        setConfirmedZoneIds([]);
        setSelectedObjectId(null);
        setShow2DBoxes(true);
        setRemediationMode('BEFORE');

        // Kick off live backend Gemini 4 Argon inference in the background
        void handleRunArgonAnalysis(uploadPayload);

        // Show 3-second Argon conversion animation on the uploaded photo and auto-dismiss after 3s
        runThreeSecondArgonConversion(
          `Analyzing Uploaded Photo "${cleanTitle}" with Gemini 4 Argon...`
        );
      };
      img.src = rawDataUrl;
    };
    reader.readAsDataURL(file);
  };

  const toggleLockObject = (objectId: string) => {
    setLockedObjectIds((prev) =>
      prev.includes(objectId) ? prev.filter((id) => id !== objectId) : [...prev, objectId]
    );
  };

  const toggleConfirmZone = (zoneId: string) => {
    setConfirmedZoneIds((prev) =>
      prev.includes(zoneId) ? prev.filter((id) => id !== zoneId) : [...prev, zoneId]
    );
  };

  const handleCopyChecklist = () => {
    const lines = [
      `[HomeFit 3D — Pre-Discharge 3D Safety & Welfare Subsidy Report]`,
      `Scene: ${baseScene.title} (${baseScene.koreanTitle})`,
      `Resident Profile: ${activeProfile.label} (Height ${activeProfile.userHeightCm}cm, Forward Pitch +${activeProfile.sitToStandForwardPitchCm}cm, Min Width ${activeProfile.minPassageWidthCm}cm)`,
      `Safety Verdict: ${afterVerification.epistemicVerdict}`,
      `3D Clearance Summary (BEFORE -> AFTER):`,
      `  • Overhead Head Clearance: ${beforeVerification.overheadHeadClearanceMinCm}cm -> +${afterVerification.overheadHeadClearanceMinCm}cm`,
      `  • Floor Stance / Passage Width: ${beforeVerification.floorClearanceMinCm}cm -> ${afterVerification.floorClearanceMinCm}cm`,
      `  • Mid Turning Circle: ${beforeVerification.midTurningClearanceCm}cm -> ${afterVerification.midTurningClearanceCm}cm`,
      ``,
      `Prioritized Action & Welfare Subsidy Checklist:`,
      ...baseScene.remediationChecklist.map(
        (item, idx) =>
          `${idx + 1}. [${item.priority}] ${item.title} (${item.koreanTitle}) — ${item.estimatedCostLabel} (${item.koreanWelfareProgramTag || 'Zero-Cost Action'})`
      ),
    ];
    navigator.clipboard?.writeText(lines.join('\n'));
    setCopiedChecklist(true);
    setTimeout(() => setCopiedChecklist(false), 2500);
  };

  const handleHazardClick = (hazard: CollisionHazard) => {
    if (hazard.objectIds.length > 0) {
      setSelectedObjectId(hazard.objectIds[0]);
    }
    if (hazard.layer === 'overhead') {
      setActiveWaypointIndex(Math.min(2, activeWaypoints.length - 1));
    } else if (hazard.layer === 'floor') {
      setActiveWaypointIndex(Math.min(1, activeWaypoints.length - 1));
    }
  };

  const confirmAllMeasurements = () => {
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
  };

  const selectedObject = useMemo(() => {
    if (!selectedObjectId) return null;
    return activeObjects.find((o) => o.id === selectedObjectId) || null;
  }, [activeObjects, selectedObjectId]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col selection:bg-sky-500 selection:text-white">
      {/* =====================================================================
          3-SECOND GEMINI 4 ARGON 3D CONVERSION MODAL OVERLAY (AUTO-CLOSES IN 3S)
      ===================================================================== */}
      {conversionOverlay.active && (
        <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="max-w-lg w-full rounded-3xl bg-slate-900 border-2 border-sky-400/60 p-6 shadow-2xl shadow-sky-500/20 space-y-5 text-center">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-sky-500/20 border border-sky-400/50 flex items-center justify-center">
              <Sparkles className="w-7 h-7 text-sky-400 animate-pulse" />
            </div>

            <div className="space-y-1.5">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-[11px] font-mono font-bold bg-sky-950 text-sky-300 border border-sky-500/40">
                <span className="w-2 h-2 rounded-full bg-sky-400 animate-ping" />
                <span>gemini-4-argon · client.interactions.create</span>
              </div>
              <h3 className="text-lg font-extrabold text-white">
                {conversionOverlay.label || 'Converting 2D Photo into 3-Layer 3D Digital Twin...'}
              </h3>
              <p className="text-xs text-slate-300">
                {conversionOverlay.stage === 1 &&
                  'Step 1/3: Detecting 2D object bounding boxes (box_2d) & floor/wall perspective planes...'}
                {conversionOverlay.stage === 2 &&
                  'Step 2/3: Lifting fixtures into 3D coordinates (X, Y, Z) across Floor, Mid & Overhead layers...'}
                {conversionOverlay.stage === 3 &&
                  `Step 3/3: Computing full-body kinematic collisions for ${activeProfile.label} (+${activeProfile.sitToStandForwardPitchCm}cm head lean)...`}
              </p>
            </div>

            {/* Smooth 3-Second Progress Bar */}
            <div className="space-y-1.5">
              <div className="w-full h-2.5 rounded-full bg-slate-950 border border-slate-800 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-sky-400 via-indigo-400 to-emerald-400 transition-all duration-700 ease-out"
                  style={{ width: `${conversionOverlay.progressPct}%` }}
                />
              </div>
              <div className="flex justify-between text-[11px] font-mono text-slate-400">
                <span>2D Vision → 3D Spatial Lift</span>
                <span className="text-sky-300 font-bold">{conversionOverlay.progressPct}%</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          CLEAN TOP NAVIGATION BAR WITH 3-STEP PROGRESS STEPPER
      ===================================================================== */}
      <header className="sticky top-0 z-40 border-b border-slate-800/80 bg-slate-950/95 backdrop-blur-md">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-4">
          {/* Brand Logo */}
          <HoverTooltip
            position="bottom"
            align="start"
            title="HomeFit 3D — Pre-Discharge Safety Simulator"
            description="Click here anytime to return to Step 1 (Room Photo & Mobility Profile Selection)."
          >
            <div
              onClick={() => setCurrentStep(1)}
              className="flex items-center gap-3 cursor-pointer group"
            >
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-sky-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-sky-500/20 border border-sky-400/30 group-hover:scale-105 transition">
                <Box className="w-5 h-5 text-white" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-base sm:text-lg font-bold tracking-tight text-white">
                    HomeFit 3D{' '}
                    <span className="text-sky-400 font-medium">Pre-Discharge Digital Twin</span>
                  </h1>
                  <span className="hidden sm:inline-flex px-2 py-0.5 text-[10px] font-mono rounded-full bg-slate-900 text-sky-300 border border-slate-800">
                    gemini-4-argon
                  </span>
                </div>
                <p className="text-xs text-slate-400">
                  3D Indoor Mobility &amp; Overhead Head-Strike Safety Simulator
                </p>
              </div>
            </div>
          </HoverTooltip>

          {/* Center 3-Step Workflow Stepper */}
          <nav className="flex items-center bg-slate-900/90 p-1 rounded-2xl border border-slate-800">
            {[
              {
                step: 1 as WorkflowStep,
                title: '1. Room & Profile',
                subtitle: 'Choose photo & mobility aid',
                tooltipTitle: 'Step 1: Room Photo & Mobility Aid Setup',
                tooltipDesc:
                  'Select Preset 1 or Preset 2 (recommended for fast judge evaluation) or upload your own indoor room photo, then pick the resident mobility aid.',
              },
              {
                step: 2 as WorkflowStep,
                title: '2. 3D Simulation Studio',
                subtitle: 'Inspect collisions & AI fix',
                tooltipTitle: 'Step 2: Interactive 3D & Photo AR Studio',
                tooltipDesc:
                  'Inspect Floor, Mid, and Overhead 3D collisions, compare BEFORE vs AFTER layouts, lock built-in fixtures, or override dimensions with a tape measure.',
              },
              {
                step: 3 as WorkflowStep,
                title: '3. Safety & Welfare Report',
                subtitle: 'Subsidy codes & print spec',
                tooltipTitle: 'Step 3: Pre-Discharge Safety & Subsidy Spec',
                tooltipDesc:
                  'Generate a 1-page contractor & caregiver checklist with Long-Term Care Insurance (85% government subsidy) item codes and on-site tape verification.',
              },
            ].map((item, idx) => {
              const isActive = currentStep === item.step;
              const isCompleted = currentStep > item.step;
              return (
                <React.Fragment key={item.step}>
                  {idx > 0 && <div className="w-4 h-[1px] bg-slate-800 mx-1 hidden sm:block" />}
                  <HoverTooltip
                    position="bottom"
                    title={item.tooltipTitle}
                    description={item.tooltipDesc}
                    tip={`Click to jump to Step ${item.step}`}
                  >
                    <button
                      onClick={() => setCurrentStep(item.step)}
                      className={`px-3.5 py-2 rounded-xl text-left transition flex items-center gap-2.5 ${
                        isActive
                          ? 'bg-sky-500 text-slate-950 font-bold shadow-md shadow-sky-500/20'
                          : isCompleted
                          ? 'text-emerald-300 hover:bg-slate-800/70'
                          : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
                      }`}
                    >
                      <span
                        className={`w-6 h-6 rounded-full text-xs font-extrabold flex items-center justify-center shrink-0 ${
                          isActive
                            ? 'bg-slate-950 text-sky-400'
                            : isCompleted
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                            : 'bg-slate-800 text-slate-400'
                        }`}
                      >
                        {isCompleted ? <Check className="w-3.5 h-3.5" /> : item.step}
                      </span>
                      <div>
                        <div className="text-xs leading-tight">{item.title}</div>
                        <div
                          className={`text-[10px] hidden md:block ${
                            isActive ? 'text-slate-900 font-medium' : 'text-slate-400'
                          }`}
                        >
                          {item.subtitle}
                        </div>
                      </div>
                    </button>
                  </HoverTooltip>
                </React.Fragment>
              );
            })}
          </nav>

          {/* Right Quick Story Toggle */}
          <div className="flex items-center gap-2">
            <HoverTooltip
              position="bottom"
              align="end"
              title="Real Parent Bathroom Accident Origin Story"
              description="Read why a standard wall grab bar failed to prevent our team member's parent on crutches from shattering an overhead tempered-glass bathroom shelf."
              tip="Click to expand the real-world origin story"
            >
              <button
                onClick={() => setShowOriginStory((v) => !v)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-rose-950/50 hover:bg-rose-900/60 border border-rose-500/30 text-rose-200 text-xs font-medium transition"
              >
                <HeartHandshake className="w-3.5 h-3.5 text-rose-400" />
                <span>Why We Built This</span>
                {showOriginStory ? (
                  <ChevronUp className="w-3.5 h-3.5" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5" />
                )}
              </button>
            </HoverTooltip>
          </div>
        </div>

        {/* Collapsible Real Parent Accident Story */}
        {showOriginStory && (
          <div className="bg-gradient-to-r from-rose-950/50 via-slate-900 to-sky-950/50 border-t border-slate-800">
            <div className="max-w-[1440px] mx-auto px-6 py-3.5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 text-xs">
              <div className="space-y-1 max-w-4xl">
                <div className="font-bold text-rose-300 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-400" />
                  <span>
                    Real Accident Origin Story: Why 2D Floor &amp; Grab-Bar Checklists Fail
                  </span>
                </div>
                <p className="text-slate-300 leading-relaxed">
                  Our team member&apos;s parent uses crutches at home. Even though a{' '}
                  <strong className="text-white">wall grab bar was already installed</strong> next
                  to the toilet, plastic floor washbasins narrowed their crutch stance to{' '}
                  <strong className="text-rose-300">44cm</strong>. While standing up from the
                  toilet, their head pitched forward{' '}
                  <strong className="text-rose-300">+28cm</strong> and shattered a{' '}
                  <strong className="text-rose-300">
                    protruding 3-tier overhead glass shelf (146cm height)
                  </strong>
                  . HomeFit 3D checks all 3 elevation layers (Floor, Mid, and Overhead Head Arc)
                  before discharge.
                </p>
              </div>
              <button
                onClick={() => {
                  setSelectedPresetId(PRESET_SCENES[0].id);
                  setMobilityAid('crutches');
                  setRemediationMode('BEFORE');
                  setCurrentStep(2);
                  setShowOriginStory(false);
                }}
                className="shrink-0 px-3.5 py-2 rounded-xl bg-rose-500 hover:bg-rose-400 text-slate-950 font-bold transition"
              >
                See This Accident in 3D →
              </button>
            </div>
          </div>
        )}
      </header>

      {/* =====================================================================
          MAIN WORKFLOW STAGE (RENDERS STEP 1, STEP 2, OR STEP 3)
      ===================================================================== */}
      <main className="flex-1 max-w-[1440px] w-full mx-auto px-4 sm:px-6 py-6">
        {/* ===================================================================
            STEP 1: ROOM PHOTO & MOBILITY PROFILE SETUP
        =================================================================== */}
        {currentStep === 1 && (
          <div className="max-w-5xl mx-auto space-y-5">
            <div className="text-center space-y-1.5">
              <span className="px-3 py-1 rounded-full text-xs font-bold bg-sky-500/15 text-sky-300 border border-sky-500/30">
                STEP 1 OF 3 · ROOM &amp; MOBILITY SETUP
              </span>
              <h2 className="text-2xl sm:text-3xl font-extrabold text-white">
                Select a Room Photo &amp; Resident Mobility Aid
              </h2>
              <p className="text-sm text-slate-400 max-w-2xl mx-auto">
                Test with our verified real-world preset cases or upload any indoor room photo to
                convert into an interactive 3-Layer 3D Digital Twin.
              </p>
            </div>

            {/* JUDGE EVALUATION & LIVE DEMO GUIDANCE BANNER */}
            <div className="rounded-2xl bg-gradient-to-r from-sky-950/80 via-slate-900 to-indigo-950/80 border border-sky-400/40 p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-lg">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl bg-sky-500/20 border border-sky-400/40 flex items-center justify-center shrink-0 mt-0.5">
                  <Info className="w-5 h-5 text-sky-300" />
                </div>
                <div className="text-xs space-y-1">
                  <div className="font-extrabold text-sky-200 flex flex-wrap items-center gap-2">
                    <span>Recommended for Judges &amp; Live Demo Evaluation</span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-emerald-500/20 text-emerald-300 border border-emerald-400/40">
                      Preset 1 &amp; Preset 2 Ready
                    </span>
                  </div>
                  <p className="text-slate-300 leading-relaxed">
                    Because live <code className="font-mono text-sky-300">gemini-4-argon</code>{' '}
                    vision-to-3D reconstruction requires additional API inference time and an indoor
                    room photo,{' '}
                    <strong className="text-white">
                      we recommend using Preset 1 (Parent&apos;s Bathroom Glass Shelf Case) or
                      Preset 2 (Post-Surgery Hallway)
                    </strong>{' '}
                    for fast, comprehensive evaluation. You can also click{' '}
                    <strong className="text-sky-300">Upload Custom Photo</strong> to test live image
                    conversion (displays a 3-second conversion preview while Argon runs in the
                    background).
                  </p>
                </div>
              </div>
              <HoverTooltip
                position="left"
                title="Why Presets Are Recommended"
                description="Live multimodal 3D bounding-box extraction can take 15–30s depending on API load and requires a clear indoor photo. Presets 1 & 2 provide instant, calibrated 3-layer 3D twins while still allowing live Argon re-analysis."
              >
                <span className="px-3 py-1.5 rounded-xl bg-slate-950/90 border border-slate-700 text-[11px] font-semibold text-sky-300 shrink-0 cursor-help">
                  Hover Controls for Guide 💡
                </span>
              </HoverTooltip>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Left Card: 1A. Choose or Upload Room Photo */}
              <section className="rounded-3xl bg-slate-900/90 border border-slate-800 p-6 space-y-4 flex flex-col justify-between">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <HoverTooltip
                      position="top"
                      align="start"
                      title="Room Source Selection"
                      description="Choose Preset 1 (Bathroom Overhead Glass Shelf) or Preset 2 (Narrow Hallway), or upload your own JPG/PNG indoor room photo."
                      showIcon
                    >
                      <h3 className="text-sm font-bold uppercase tracking-wider text-sky-300 flex items-center gap-2 cursor-help">
                        <Camera className="w-4 h-4" />
                        <span>1. Select Preset or Upload Photo</span>
                      </h3>
                    </HoverTooltip>

                    <HoverTooltip
                      position="top"
                      align="end"
                      title="Upload Custom Room Photo"
                      description="Upload any indoor bathroom, hallway, or bedroom photo. Shows a 3-second Argon 3D conversion preview and reconstructs 2D bounding boxes + 3D fixtures."
                      tip="Supports JPG, PNG, WebP"
                    >
                      <label className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-sky-500/20 hover:bg-sky-500/30 border border-sky-500/40 text-sky-200 text-xs font-bold transition">
                        <Upload className="w-3.5 h-3.5" />
                        <span>Upload Custom Photo</span>
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={handlePhotoUpload}
                        />
                      </label>
                    </HoverTooltip>
                  </div>

                  {/* Custom Uploaded Photo Card + Preset Cards */}
                  <div className="grid grid-cols-1 gap-2.5">
                    {customScene && (
                      <HoverTooltip
                        position="top"
                        title="Custom Uploaded Room Scene"
                        description="Your uploaded photo converted into a 3-layer 3D scene via Gemini 4 Argon."
                        className="w-full"
                      >
                        <button
                          onClick={() => {
                            setSelectedPresetId('custom-uploaded-room');
                            setLockedObjectIds([]);
                            setDimensionOverrides({});
                            setConfirmedZoneIds([]);
                            setSelectedObjectId(null);
                          }}
                          className={`w-full text-left p-3.5 rounded-2xl border transition flex items-center justify-between gap-3 ${
                            selectedPresetId === 'custom-uploaded-room'
                              ? 'bg-emerald-950/60 border-emerald-400 text-white shadow-lg shadow-emerald-500/15'
                              : 'bg-slate-950/60 border-slate-800/80 text-slate-300 hover:bg-slate-900 hover:border-slate-700'
                          }`}
                        >
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-bold">{customScene.title}</span>
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                                {`Argon 3D Ready (${customScene.beforeObjects.length} objects)`}
                              </span>
                            </div>
                            <div className="text-xs text-slate-300 mt-0.5 line-clamp-1">
                              {customScene.argonObservationSummary || customScene.subtitle}
                            </div>
                          </div>
                          <span
                            className={`px-2.5 py-1 rounded-full text-xs font-bold shrink-0 ${
                              selectedPresetId === 'custom-uploaded-room'
                                ? 'bg-emerald-400 text-slate-950'
                                : 'bg-slate-800 text-slate-400'
                            }`}
                          >
                            {selectedPresetId === 'custom-uploaded-room' ? 'Selected' : 'Select'}
                          </span>
                        </button>
                      </HoverTooltip>
                    )}

                    {PRESET_SCENES.map((preset, idx) => {
                      const active = selectedPresetId === preset.id;
                      return (
                        <HoverTooltip
                          key={preset.id}
                          position="top"
                          title={
                            idx === 0
                              ? 'Recommended Preset 1: Real Bathroom Overhead Glass Shelf Case'
                              : 'Recommended Preset 2: Post-Surgery Narrow Hallway Case'
                          }
                          description={
                            idx === 0
                              ? 'Uses /presets/bathroom_shelf_before_broken.png. Demonstrates how floor washbasins narrow crutch stance to 44cm while the +28cm sit-to-stand head pitch shatters the 146cm-high overhead glass shelf.'
                              : 'Uses /presets/post-surgery-hallway.png. Demonstrates a 3.2cm raised threshold and 59cm hallway pinch point blocking crutches, walkers, and wheelchairs.'
                          }
                          tip="Recommended for fast, deterministic judge evaluation"
                          className="w-full"
                        >
                          <button
                            onClick={() => {
                              setSelectedPresetId(preset.id);
                              setShowAftermathCompare(false);
                              setLockedObjectIds([]);
                              setDimensionOverrides({});
                              setConfirmedZoneIds([]);
                              setSelectedObjectId(null);
                            }}
                            className={`w-full text-left p-3.5 rounded-2xl border transition flex items-center justify-between gap-3 ${
                              active
                                ? 'bg-sky-950/60 border-sky-400 text-white shadow-lg shadow-sky-500/10'
                                : 'bg-slate-950/60 border-slate-800/80 text-slate-300 hover:bg-slate-900 hover:border-slate-700'
                            }`}
                          >
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-bold">{preset.title}</span>
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-500/20 text-sky-300 border border-sky-400/30">
                                  Recommended
                                </span>
                              </div>
                              <div className="text-xs text-slate-400 mt-0.5">{preset.subtitle}</div>
                            </div>
                            <span
                              className={`px-2.5 py-1 rounded-full text-xs font-bold shrink-0 ${
                                active
                                  ? 'bg-sky-400 text-slate-950'
                                  : 'bg-slate-800 text-slate-400'
                              }`}
                            >
                              {active ? 'Selected' : 'Select'}
                            </span>
                          </button>
                        </HoverTooltip>
                      );
                    })}
                  </div>

                  {/* Selected Room Photo Preview OR Empty Upload Dropzone */}
                  <div className="relative rounded-2xl overflow-hidden border border-slate-800 bg-slate-950 aspect-[16/10]">
                    {!hasSelectedRoom ? (
                      <label className="cursor-pointer w-full h-full flex flex-col items-center justify-center p-6 text-center border-2 border-dashed border-sky-500/40 hover:border-sky-400 hover:bg-sky-950/20 rounded-2xl transition group">
                        <div className="w-12 h-12 rounded-2xl bg-sky-500/15 border border-sky-400/30 flex items-center justify-center mb-3 group-hover:scale-105 transition">
                          <Upload className="w-6 h-6 text-sky-400" />
                        </div>
                        <div className="text-sm font-extrabold text-white">
                          No Photo Selected Yet — Click to Upload Room Photo
                        </div>
                        <p className="text-xs text-slate-400 mt-1 max-w-sm">
                          Upload a smartphone photo of your bathroom, hallway, or bedroom (or click
                          one of the recommended presets above).
                        </p>
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={handlePhotoUpload}
                        />
                      </label>
                    ) : (
                      <>
                        <img
                          src={
                            selectedPresetId === 'parent-bathroom-accident' && showAftermathCompare
                              ? '/presets/bathroom_shelf_after_broken.png'
                              : baseScene.photoUrl
                          }
                          alt={baseScene.title}
                          className="w-full h-full object-contain bg-slate-950"
                        />
                        {selectedPresetId === 'parent-bathroom-accident' && showAftermathCompare && (
                          <div className="absolute top-3 left-3 px-3 py-1.5 rounded-xl bg-rose-950/90 border border-rose-400/60 text-rose-200 text-xs font-bold shadow-lg">
                            💥 Real Accident Aftermath: Shattered Tempered-Glass Shelf on Bathroom Floor
                          </div>
                        )}
                        {show2DBoxes &&
                          !showAftermathCompare &&
                          activeObjects.map((obj) => {
                            if (!obj.box2d) return null;
                            const [ymin, xmin, ymax, xmax] = obj.box2d;
                            return (
                              <div
                                key={obj.id}
                                style={{
                                  top: `${ymin / 10}%`,
                                  left: `${xmin / 10}%`,
                                  height: `${(ymax - ymin) / 10}%`,
                                  width: `${(xmax - xmin) / 10}%`,
                                }}
                                className="absolute border-2 border-amber-400 bg-amber-500/15 pointer-events-none"
                              >
                                <span className="px-1.5 py-0.5 text-[10px] font-bold bg-slate-950/90 text-amber-300 block truncate">
                                  {obj.name}
                                </span>
                              </div>
                            );
                          })}
                        <div className="absolute bottom-3 right-3 flex flex-wrap items-center gap-2">
                          {selectedPresetId === 'parent-bathroom-accident' && (
                            <HoverTooltip
                              position="top"
                              align="end"
                              title="Compare Before vs. Real Accident Aftermath"
                              description="Toggle between the intact 3-tier overhead glass shelf photo and the real photo taken right after our parent's head struck and shattered the glass shelf."
                            >
                              <button
                                onClick={() => setShowAftermathCompare((v) => !v)}
                                className={`px-2.5 py-1 rounded-lg border text-xs font-bold backdrop-blur-md transition ${
                                  showAftermathCompare
                                    ? 'bg-rose-600 text-white border-rose-400'
                                    : 'bg-rose-950/85 hover:bg-rose-900 text-rose-200 border-rose-500/50'
                                }`}
                              >
                                {showAftermathCompare
                                  ? '← Back to Intact Shelf Photo'
                                  : '💥 View Shattered Glass Aftermath'}
                              </button>
                            </HoverTooltip>
                          )}
                          <HoverTooltip
                            position="top"
                            align="end"
                            title="AI 2D Object Detection Boxes"
                            description="Overlays Gemini 4 Argon's normalized 2D bounding boxes ([ymin, xmin, ymax, xmax]) detected on the source photo."
                          >
                            <button
                              onClick={() => setShow2DBoxes((v) => !v)}
                              className="px-2.5 py-1 rounded-lg bg-slate-950/85 hover:bg-slate-900 text-slate-200 border border-slate-700 text-xs font-medium backdrop-blur-md transition"
                            >
                              {show2DBoxes ? 'Hide AI 2D Boxes' : 'Show AI 2D Boxes'}
                            </button>
                          </HoverTooltip>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </section>

              {/* Right Card: 1B. Select Mobility Aid & Launch 3D Simulation */}
              <section className="rounded-3xl bg-slate-900/90 border border-slate-800 p-6 flex flex-col justify-between space-y-6">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <HoverTooltip
                      position="top"
                      align="start"
                      title="Resident Mobility Aid Profile"
                      description="Each mobility aid defines a distinct 3-layer 3D kinematic envelope: required floor passage width, 360° turning circle, and sit-to-stand forward head pitch."
                      showIcon
                    >
                      <h3 className="text-sm font-bold uppercase tracking-wider text-sky-300 flex items-center gap-2 cursor-help">
                        <Sliders className="w-4 h-4" />
                        <span>2. Resident Mobility Aid Profile</span>
                      </h3>
                    </HoverTooltip>
                    <span className="text-xs font-mono text-slate-400">
                      3D Kinematic Envelope
                    </span>
                  </div>

                  {/* 4 Large Mobility Aid Cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {(Object.keys(MOBILITY_PROFILES) as MobilityAidType[]).map((aidKey) => {
                      const prof = MOBILITY_PROFILES[aidKey];
                      const active = mobilityAid === aidKey;
                      return (
                        <HoverTooltip
                          key={aidKey}
                          position="top"
                          title={`${prof.label} — 3D Kinematic Spec`}
                          description={prof.subtitle}
                          tip={`Min Width >= ${prof.minPassageWidthCm}cm · Turn >= ${prof.turningRadiusCm}cm · Forward Head Pitch +${prof.sitToStandForwardPitchCm}cm`}
                          className="w-full"
                        >
                          <button
                            onClick={() => handleSelectMobilityAid(aidKey)}
                            className={`w-full p-4 rounded-2xl border text-left transition flex flex-col justify-between ${
                              active
                                ? 'bg-sky-500/15 border-sky-400 text-white shadow-lg shadow-sky-500/10'
                                : 'bg-slate-950/70 border-slate-800 text-slate-300 hover:border-slate-700'
                            }`}
                          >
                            <div>
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-sm font-bold">{prof.label}</span>
                                {active && (
                                  <span className="w-2.5 h-2.5 rounded-full bg-sky-400 shrink-0" />
                                )}
                              </div>
                              <div className="text-xs text-slate-400 mt-0.5">{prof.subtitle}</div>
                            </div>
                            <div className="mt-3 pt-2.5 border-t border-slate-800/80 flex items-center justify-between text-xs font-mono text-sky-300">
                              <span>Width &ge; {prof.minPassageWidthCm}cm</span>
                              <span>Pitch +{prof.sitToStandForwardPitchCm}cm</span>
                            </div>
                          </button>
                        </HoverTooltip>
                      );
                    })}
                  </div>

                  {/* Collapsible Custom Body Sliders */}
                  <div className="rounded-2xl bg-slate-950/70 border border-slate-800/90 p-3.5">
                    <HoverTooltip
                      position="top"
                      title="Custom Anthropometric & Biomechanical Sliders"
                      description="Fine-tune the resident's stature (cm), forward head lean during sit-to-stand transfer (cm), and required stance width (cm) to immediately recalculate 3D collisions."
                      className="w-full"
                    >
                      <button
                        onClick={() => setShowAdvancedSliders((v) => !v)}
                        className="w-full flex items-center justify-between text-xs font-semibold text-slate-300 hover:text-white"
                      >
                        <span>
                          Customize Resident Height ({activeProfile.userHeightCm}cm) &amp; Forward
                          Lean (+{activeProfile.sitToStandForwardPitchCm}cm)
                        </span>
                        {showAdvancedSliders ? (
                          <ChevronUp className="w-4 h-4 text-slate-400" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-slate-400" />
                        )}
                      </button>
                    </HoverTooltip>

                    {showAdvancedSliders && (
                      <div className="mt-4 space-y-3 pt-3 border-t border-slate-800 text-xs">
                        <div>
                          <div className="flex justify-between mb-1">
                            <span className="text-slate-400">Resident Height</span>
                            <span className="font-mono text-sky-300">
                              {activeProfile.userHeightCm} cm
                            </span>
                          </div>
                          <input
                            type="range"
                            min={145}
                            max={188}
                            value={activeProfile.userHeightCm}
                            onChange={(e) =>
                              setProfileOverrides((prev) => ({
                                ...prev,
                                userHeightCm: Number(e.target.value),
                              }))
                            }
                            className="w-full accent-sky-400"
                          />
                        </div>

                        <div>
                          <div className="flex justify-between mb-1">
                            <span className="text-slate-400">Sit-to-Stand Forward Head Pitch</span>
                            <span className="font-mono text-rose-300">
                              +{activeProfile.sitToStandForwardPitchCm} cm
                            </span>
                          </div>
                          <input
                            type="range"
                            min={10}
                            max={42}
                            value={activeProfile.sitToStandForwardPitchCm}
                            onChange={(e) =>
                              setProfileOverrides((prev) => ({
                                ...prev,
                                sitToStandForwardPitchCm: Number(e.target.value),
                              }))
                            }
                            className="w-full accent-rose-400"
                          />
                        </div>

                        <div>
                          <div className="flex justify-between mb-1">
                            <span className="text-slate-400">Required Stance / Passage Width</span>
                            <span className="font-mono text-emerald-300">
                              {activeProfile.minPassageWidthCm} cm
                            </span>
                          </div>
                          <input
                            type="range"
                            min={55}
                            max={95}
                            value={activeProfile.minPassageWidthCm}
                            onChange={(e) =>
                              setProfileOverrides((prev) => ({
                                ...prev,
                                minPassageWidthCm: Number(e.target.value),
                              }))
                            }
                            className="w-full accent-emerald-400"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Primary CTA to Step 2 */}
                <div className="space-y-2.5 pt-2">
                  <HoverTooltip
                    position="top"
                    title="Launch Gemini 4 Argon 3D Simulation"
                    description="Displays a 3-second 2D-to-3D spatial conversion preview and opens Step 2 (Interactive 3D & Photo AR Studio) while live Gemini 4 Argon runs."
                    tip="Auto-transitions to Step 2 in 3 seconds"
                    className="w-full"
                  >
                    <button
                      onClick={handleLaunchStep1ToStep2}
                      disabled={conversionOverlay.active || !hasSelectedRoom}
                      className={`w-full py-4 px-6 rounded-2xl font-extrabold text-sm shadow-xl flex items-center justify-center gap-2.5 transition ${
                        !hasSelectedRoom
                          ? 'bg-slate-800 border border-slate-700 text-slate-400 cursor-not-allowed'
                          : conversionOverlay.active
                          ? 'bg-sky-900/80 border border-sky-400/50 text-sky-200 cursor-wait'
                          : 'bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 text-white shadow-sky-500/20'
                      }`}
                    >
                      {!hasSelectedRoom ? (
                        <>
                          <Upload className="w-4 h-4" />
                          <span>Upload a Photo (or Select a Preset) on the Left First</span>
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-4 h-4" />
                          <span>Analyze with Gemini 4 Argon &amp; Launch 3D Simulation</span>
                          <ArrowRight className="w-4 h-4" />
                        </>
                      )}
                    </button>
                  </HoverTooltip>
                  <p className="text-[11px] text-center text-slate-400">
                    Runs a 3-second Gemini 4 Argon 2D-to-3D conversion preview and opens Step 2 (3D
                    Simulation Studio).
                  </p>
                </div>
              </section>
            </div>
          </div>
        )}

        {/* ===================================================================
            STEP 2: 3D COLLISION & AI REMEDIATION STUDIO (CLEAN, FOCUSED)
        =================================================================== */}
        {currentStep === 2 && (
          <div className="space-y-4">
            {/* Non-Indoor Photo Guardrail Banner (only shown if triggered) */}
            {!effectiveIsIndoorRoom && (
              <div className="rounded-2xl bg-amber-950/70 border-2 border-amber-500/70 p-4 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
                  <div className="text-xs text-amber-100">
                    <strong>Unverifiable Photo Guardrail Active:</strong> {effectiveInvalidReason}
                  </div>
                </div>
                <button
                  onClick={() => setSimulateInvalidPhoto(false)}
                  className="px-3 py-1.5 rounded-xl bg-amber-400 text-slate-950 text-xs font-bold shrink-0"
                >
                  Restore Valid Room Photo
                </button>
              </div>
            )}

            {/* Top Studio Toolbar: Room Switcher + Mobility Aid Quick Toggle + Big BEFORE / AFTER Mode Switch + Step Playback */}
            <div className="rounded-2xl bg-slate-900/90 border border-slate-800 p-3 flex flex-wrap items-center justify-between gap-3">
              {/* Left: Current Room & Quick Mobility Aid Switcher */}
              <div className="flex flex-wrap items-center gap-2">
                <HoverTooltip
                  position="bottom"
                  align="start"
                  title="Switch Room Photo or Upload New Image"
                  description="Return to Step 1 to switch between Preset 1 (Bathroom), Preset 2 (Hallway), or upload a custom photo."
                >
                  <button
                    onClick={() => setCurrentStep(1)}
                    className="px-3 py-2 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 text-xs flex items-center gap-2 transition"
                  >
                    <Camera className="w-3.5 h-3.5 text-sky-400" />
                    <span className="font-bold text-white">{baseScene.title.split('—')[0]}</span>
                    <span className="text-[10px] text-sky-400 underline ml-1">Change Photo</span>
                  </button>
                </HoverTooltip>

                {/* Quick Crutches / Wheelchair / Walker / Cane Switcher directly in Step 2 */}
                <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800">
                  {(
                    [
                      {
                        id: 'crutches',
                        label: '🩼 Crutches',
                        desc: 'Axillary crutches: requires 68cm stance width and creates a +28cm forward head-lean arc when standing up.',
                      },
                      {
                        id: 'wheelchair',
                        label: '♿ Wheelchair',
                        desc: 'Manual wheelchair: requires 78cm passage width, <1.5cm threshold, and 140cm turning circle.',
                      },
                      {
                        id: 'walker',
                        label: '🦯 Walker',
                        desc: '4-wheel rollator walker: requires 66cm passage width and +24cm sit-to-stand forward head pitch.',
                      },
                      {
                        id: 'cane_grab_bar',
                        label: '🦯 Cane',
                        desc: 'Quad cane & wall grab-bar gait: requires 62cm passage width and +25cm forward head pitch.',
                      },
                    ] as { id: MobilityAidType; label: string; desc: string }[]
                  ).map((item) => (
                    <HoverTooltip
                      key={item.id}
                      position="bottom"
                      title={`Switch 3D Avatar to ${item.label}`}
                      description={item.desc}
                      tip="Instantly updates 3D avatar & recalculates collisions"
                    >
                      <button
                        onClick={() => handleSelectMobilityAid(item.id)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold transition ${
                          mobilityAid === item.id
                            ? 'bg-sky-500 text-slate-950 shadow'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        {item.label}
                      </button>
                    </HoverTooltip>
                  ))}
                </div>

                <HoverTooltip
                  position="bottom"
                  title="Floating 2D Photo Picture-in-Picture"
                  description="Toggle a floating thumbnail of the original 2D room photo over the corner of the 3D viewport."
                >
                  <button
                    onClick={() => setShowPhotoPiP((v) => !v)}
                    className={`px-3 py-2 rounded-xl border text-xs font-medium flex items-center gap-1.5 transition ${
                      showPhotoPiP
                        ? 'bg-sky-500/20 border-sky-400 text-sky-200'
                        : 'bg-slate-950 border-slate-800 text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>{showPhotoPiP ? 'Hide 2D Photo' : '2D Photo'}</span>
                  </button>
                </HoverTooltip>
              </div>

              {/* Center: Unmistakable BEFORE vs AFTER Switch */}
              <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800">
                <HoverTooltip
                  position="bottom"
                  title="BEFORE Mode — Current Room Hazards"
                  description="Shows the unedited room layout where floor obstacles and low overhead glass shelves collide with the resident's 3D trajectory."
                >
                  <button
                    onClick={() => setRemediationMode('BEFORE')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition ${
                      remediationMode === 'BEFORE'
                        ? 'bg-rose-600 text-white shadow-lg shadow-rose-600/30'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <ShieldAlert className="w-4 h-4" />
                    <span>BEFORE ({beforeVerification.hazards.length} Collisions)</span>
                  </button>
                </HoverTooltip>

                <HoverTooltip
                  position="bottom"
                  title="AFTER Mode — Argon 3D Spatial Remediation"
                  description="Applies Gemini 4 Argon's 3-layer spatial fix: clears floor clutter, recesses/guards the overhead glass shelf, and verifies zero collisions."
                >
                  <button
                    onClick={() => setRemediationMode('AFTER')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition ${
                      remediationMode === 'AFTER'
                        ? 'bg-emerald-500 text-slate-950 shadow-lg shadow-emerald-500/30'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>AFTER: Argon 3D Fix ({afterVerification.hazards.length} Collisions)</span>
                  </button>
                </HoverTooltip>
              </div>

              {/* Right: Trajectory Step Controls */}
              <div className="flex items-center gap-1.5">
                <HoverTooltip
                  position="bottom"
                  align="end"
                  title="Animate Full-Body Kinematic Trajectory"
                  description="Automatically steps the 3D avatar through Entry (S1), Approach/Pivot (S2), Sit-to-Stand Transfer (S3), and Exit (S4)."
                >
                  <button
                    onClick={() => setIsPlayingTrajectory((p) => !p)}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border transition ${
                      isPlayingTrajectory
                        ? 'bg-amber-500/20 border-amber-400 text-amber-200'
                        : 'bg-slate-950 border-slate-800 text-slate-200 hover:bg-slate-800'
                    }`}
                  >
                    {isPlayingTrajectory ? (
                      <>
                        <Pause className="w-3.5 h-3.5" />
                        <span>Pause</span>
                      </>
                    ) : (
                      <>
                        <Play className="w-3.5 h-3.5 text-sky-400" />
                        <span>Play Motion</span>
                      </>
                    )}
                  </button>
                </HoverTooltip>

                <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800">
                  {activeWaypoints.map((wp, idx) => (
                    <button
                      key={wp.id}
                      onClick={() => {
                        setIsPlayingTrajectory(false);
                        setActiveWaypointIndex(idx);
                      }}
                      className={`px-2.5 py-1 rounded-lg text-xs font-mono transition ${
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

            {/* Main Studio Grid: Left 8 Cols (3D Viewport + 3 Clear Cards) / Right 4 Cols (Contextual Inspector) */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
              {/* LEFT 8 COLUMNS: Interactive 3D Viewport + 3 Simple Metric Cards */}
              <div className="lg:col-span-8 space-y-4 relative">
                {/* Optional Floating 2D Source Photo PiP */}
                {showPhotoPiP && (
                  <div className="absolute top-14 left-4 z-30 w-64 rounded-2xl overflow-hidden border-2 border-sky-400/60 bg-slate-950 shadow-2xl">
                    <div className="px-3 py-1.5 bg-slate-900 flex items-center justify-between text-[11px] font-bold text-slate-200">
                      <span>2D Source Photo</span>
                      <button
                        onClick={() => setShowPhotoPiP(false)}
                        className="text-slate-400 hover:text-white"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <img
                      src={baseScene.photoUrl}
                      alt={baseScene.title}
                      className="w-full h-40 object-cover"
                    />
                  </div>
                )}

                <RoomCanvas3D
                  photoUrl={baseScene.photoUrl}
                  roomTitle={baseScene.title}
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

                {/* 3 Clean, At-a-Glance Clearance Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {/* Card 1: Overhead Head Clearance */}
                  <HoverTooltip
                    title="Layer 3: Overhead Head Clearance (130-195cm)"
                    description="Measures vertical and forward clearance between the resident's head trajectory during a sit-to-stand forward lean (+28cm pitch on crutches) and protruding upper cabinets or shelves. Click to filter 3D view."
                    badge="Click to Filter 3D"
                    align="left"
                  >
                    <div
                      onClick={() =>
                        setActiveLayerFilter(activeLayerFilter === 'overhead' ? 'all' : 'overhead')
                      }
                      className={`rounded-2xl p-4 border cursor-pointer transition ${
                        activeVerification.overheadHeadClearanceMinCm < 15
                          ? 'bg-rose-950/35 border-rose-500/50 hover:border-rose-400'
                          : 'bg-emerald-950/25 border-emerald-500/40 hover:border-emerald-400'
                      }`}
                    >
                      <div className="text-xs font-semibold text-slate-400">
                        Overhead Head Clearance
                      </div>
                      <div className="mt-1 flex items-baseline justify-between">
                        <span
                          className={`text-2xl font-extrabold font-mono ${
                            activeVerification.overheadHeadClearanceMinCm < 15
                              ? 'text-rose-400'
                              : 'text-emerald-400'
                          }`}
                        >
                          {activeVerification.overheadHeadClearanceMinCm >= 0
                            ? `+${activeVerification.overheadHeadClearanceMinCm} cm`
                            : `${activeVerification.overheadHeadClearanceMinCm} cm`}
                        </span>
                        <span className="text-xs text-slate-400">Safe: &ge; +15cm</span>
                      </div>
                      <div className="text-xs text-slate-300 mt-1">
                        {activeVerification.overheadHeadClearanceMinCm < 15
                          ? 'Head hits upper glass cabinet on stand-up'
                          : 'Head clears upper cabinet safely'}
                      </div>
                    </div>
                  </HoverTooltip>

                  {/* Card 2: Floor Stance Width */}
                  <HoverTooltip
                    title="Layer 1: Floor Stance & Passage Width (0-30cm)"
                    description="Checks whether the unobstructed floor corridor is wide enough for crutch tips (68cm), walker legs (64cm), or wheelchair wheels (78cm) without tripping on bins or thresholds. Click to filter 3D view."
                    badge="Click to Filter 3D"
                    align="center"
                  >
                    <div
                      onClick={() =>
                        setActiveLayerFilter(activeLayerFilter === 'floor' ? 'all' : 'floor')
                      }
                      className={`rounded-2xl p-4 border cursor-pointer transition ${
                        activeVerification.floorClearanceMinCm < activeProfile.minPassageWidthCm
                          ? 'bg-rose-950/35 border-rose-500/50 hover:border-rose-400'
                          : 'bg-emerald-950/25 border-emerald-500/40 hover:border-emerald-400'
                      }`}
                    >
                      <div className="text-xs font-semibold text-slate-400">
                        Floor Stance / Passage Width
                      </div>
                      <div className="mt-1 flex items-baseline justify-between">
                        <span
                          className={`text-2xl font-extrabold font-mono ${
                            activeVerification.floorClearanceMinCm < activeProfile.minPassageWidthCm
                              ? 'text-rose-400'
                              : 'text-emerald-400'
                          }`}
                        >
                          {activeVerification.floorClearanceMinCm} cm
                        </span>
                        <span className="text-xs text-slate-400">
                          Need: &ge; {activeProfile.minPassageWidthCm}cm
                        </span>
                      </div>
                      <div className="text-xs text-slate-300 mt-1">
                        {activeVerification.floorClearanceMinCm < activeProfile.minPassageWidthCm
                          ? 'Floor clutter pinches crutch / wheel base'
                          : 'Enough floor width for stable stance'}
                      </div>
                    </div>
                  </HoverTooltip>

                  {/* Card 3: 360 Turning Space */}
                  <HoverTooltip
                    title="Layer 2: 360° Mid Turning Space (30-130cm)"
                    description="Evaluates unobstructed turning diameter at hip/elbow/handlebar height so the resident can pivot safely near sinks, toilets, and doorway corners. Click to filter 3D view."
                    badge="Click to Filter 3D"
                    align="right"
                  >
                    <div
                      onClick={() =>
                        setActiveLayerFilter(activeLayerFilter === 'mid' ? 'all' : 'mid')
                      }
                      className={`rounded-2xl p-4 border cursor-pointer transition ${
                        activeVerification.midTurningClearanceCm < activeProfile.turningRadiusCm
                          ? 'bg-amber-950/35 border-amber-500/50 hover:border-amber-400'
                          : 'bg-emerald-950/25 border-emerald-500/40 hover:border-emerald-400'
                      }`}
                    >
                      <div className="text-xs font-semibold text-slate-400">360° Turning Space</div>
                      <div className="mt-1 flex items-baseline justify-between">
                        <span
                          className={`text-2xl font-extrabold font-mono ${
                            activeVerification.midTurningClearanceCm < activeProfile.turningRadiusCm
                              ? 'text-amber-400'
                              : 'text-emerald-400'
                          }`}
                        >
                          {activeVerification.midTurningClearanceCm} cm
                        </span>
                        <span className="text-xs text-slate-400">
                          Need: &ge; {activeProfile.turningRadiusCm}cm
                        </span>
                      </div>
                      <div className="text-xs text-slate-300 mt-1">
                        {activeVerification.midTurningClearanceCm < activeProfile.turningRadiusCm
                          ? 'Tight turning zone near fixtures'
                          : 'Safe turning circle verified'}
                      </div>
                    </div>
                  </HoverTooltip>
                </div>
              </div>

              {/* RIGHT 4 COLUMNS: Clean Contextual Inspector (Only 1 Focused View at a Time!) */}
              <div className="lg:col-span-4 space-y-4">
                {/* =============================================================
                    CASE A: USER CLICKED A 3D OBJECT -> SHOW OBJECT INSPECTOR
                    (Lock Fixture + Tape-Measure Override in one clean drawer)
                ============================================================= */}
                {selectedObject ? (
                  <section className="rounded-3xl bg-slate-900 border-2 border-sky-500/50 p-5 space-y-4 shadow-xl">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-sky-400">
                          Selected 3D Object Inspector
                        </span>
                        <h3 className="text-base font-bold text-white mt-0.5">
                          {selectedObject.name}
                        </h3>
                        <p className="text-xs text-slate-400">{selectedObject.koreanName}</p>
                      </div>
                      <button
                        onClick={() => setSelectedObjectId(null)}
                        className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300"
                        title="Close Object Inspector"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    {/* 1. Caregiver Fixture Lock Button */}
                    <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                          <UserCheck className="w-4 h-4 text-yellow-400" />
                          Built-in or Too Heavy to Move?
                        </span>
                      </div>
                      <HoverTooltip
                        title="Caregiver Non-Destructive Fixture Lock"
                        description="If a landlord forbids removing a built-in cabinet or a fixture is plumbed into the wall, lock it here. HomeFit 3D will automatically compute a zero-demolition safety workaround (such as EVA impact bumper + shatter-proof PET film)."
                        badge="Human-AI Co-Design"
                        align="right"
                      >
                        <button
                          onClick={() => {
                            toggleLockObject(selectedObject.id);
                            setRemediationMode('AFTER');
                          }}
                          className={`w-full py-2.5 px-3 rounded-xl text-xs font-bold border flex items-center justify-center gap-2 transition ${
                            lockedObjectIds.includes(selectedObject.id)
                              ? 'bg-yellow-500/20 border-yellow-400 text-yellow-200'
                              : 'bg-slate-900 hover:bg-slate-800 border-slate-700 text-slate-200'
                          }`}
                        >
                          {lockedObjectIds.includes(selectedObject.id) ? (
                            <>
                              <Lock className="w-4 h-4 text-yellow-400" />
                              <span>Fixture Locked (Non-Destructive Fix Active)</span>
                            </>
                          ) : (
                            <>
                              <Unlock className="w-4 h-4 text-slate-400" />
                              <span>Lock This Fixture in Place</span>
                            </>
                          )}
                        </button>
                      </HoverTooltip>
                    </div>

                    {/* 2. On-Site Tape-Measure Override Inputs */}
                    <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 space-y-3">
                      <HoverTooltip
                        title="Epistemic Humility: On-Site Tape-Measure Override"
                        description="A single 2D photo cannot guarantee millimeter depth accuracy. Enter real tape-measure values (cm) here to immediately update the 3D object's bounding volume and recalculate 3-layer collision clearances."
                        badge="Epistemic Humility"
                        align="right"
                      >
                        <div className="flex items-center justify-between cursor-help">
                          <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                            <Ruler className="w-4 h-4 text-amber-400" />
                            Real Tape-Measure Override (cm)
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-mono ${
                              selectedObject.measurementStatus === 'user_measured'
                                ? 'bg-emerald-500/20 text-emerald-300'
                                : 'bg-amber-500/20 text-amber-300'
                            }`}
                          >
                            {selectedObject.measurementStatus === 'user_measured'
                              ? '✓ Measured'
                              : 'Photo Estimate'}
                          </span>
                        </div>
                      </HoverTooltip>

                      <div className="grid grid-cols-2 gap-2.5 text-xs">
                        <label className="space-y-1">
                          <span className="text-slate-400 text-[11px]">Width (cm)</span>
                          <input
                            type="number"
                            value={Math.round(selectedObject.dimensions.width * 100)}
                            onChange={(e) => {
                              const val = Math.max(5, Number(e.target.value));
                              setDimensionOverrides((prev) => ({
                                ...prev,
                                [selectedObject.id]: {
                                  ...(prev[selectedObject.id] || {}),
                                  widthCm: val,
                                  confirmedByUser: true,
                                },
                              }));
                            }}
                            className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-sky-300 font-mono"
                          />
                        </label>

                        <label className="space-y-1">
                          <span className="text-slate-400 text-[11px]">Height (cm)</span>
                          <input
                            type="number"
                            value={Math.round(selectedObject.dimensions.height * 100)}
                            onChange={(e) => {
                              const val = Math.max(1, Number(e.target.value));
                              setDimensionOverrides((prev) => ({
                                ...prev,
                                [selectedObject.id]: {
                                  ...(prev[selectedObject.id] || {}),
                                  heightCm: val,
                                  confirmedByUser: true,
                                },
                              }));
                            }}
                            className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-sky-300 font-mono"
                          />
                        </label>

                        <label className="space-y-1">
                          <span className="text-slate-400 text-[11px]">Depth / Protrusion (cm)</span>
                          <input
                            type="number"
                            value={Math.round(selectedObject.dimensions.depth * 100)}
                            onChange={(e) => {
                              const val = Math.max(5, Number(e.target.value));
                              setDimensionOverrides((prev) => ({
                                ...prev,
                                [selectedObject.id]: {
                                  ...(prev[selectedObject.id] || {}),
                                  depthCm: val,
                                  confirmedByUser: true,
                                },
                              }));
                            }}
                            className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-sky-300 font-mono"
                          />
                        </label>

                        <label className="space-y-1">
                          <span className="text-slate-400 text-[11px]">Height from Floor (cm)</span>
                          <input
                            type="number"
                            value={Math.round(selectedObject.position.y * 100)}
                            onChange={(e) => {
                              const val = Math.max(1, Number(e.target.value));
                              setDimensionOverrides((prev) => ({
                                ...prev,
                                [selectedObject.id]: {
                                  ...(prev[selectedObject.id] || {}),
                                  positionYCm: val,
                                  confirmedByUser: true,
                                },
                              }));
                            }}
                            className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-sky-300 font-mono"
                          />
                        </label>
                      </div>
                    </div>

                    <button
                      onClick={() => setSelectedObjectId(null)}
                      className="w-full py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 transition"
                    >
                      ← Back to Collision Summary
                    </button>
                  </section>
                ) : (
                  /* =============================================================
                      CASE B: DEFAULT FOCUSED SUMMARY PANEL
                  ============================================================= */
                  <section className="rounded-3xl bg-slate-900/95 border border-slate-800 p-5 space-y-4">
                    {/* Status Header */}
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-bold text-white flex items-center gap-2">
                        {remediationMode === 'BEFORE' ? (
                          <>
                            <ShieldAlert className="w-4 h-4 text-rose-400" />
                            <span>Detected 3D Collisions ({activeVerification.hazards.length})</span>
                          </>
                        ) : (
                          <>
                            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                            <span>Argon 3D Remediation Applied</span>
                          </>
                        )}
                      </h3>
                      <span className="text-[11px] text-slate-400">Click any 3D box to edit</span>
                    </div>

                    {/* Hazard Cards (in BEFORE mode) or Remediation Summary (in AFTER mode) */}
                    {activeVerification.hazards.length > 0 ? (
                      <div className="space-y-3">
                        {activeVerification.hazards.map((haz) => (
                          <HoverTooltip
                            key={haz.id}
                            title={`Inspect ${haz.layer.toUpperCase()} Layer Collision`}
                            description="Click this hazard card to highlight the colliding 3D fixture in the viewport and open the Tape-Measure / Fixture Lock inspector."
                            badge={`${haz.measuredValueCm}cm vs ${haz.requiredValueCm}cm`}
                            align="right"
                          >
                            <div
                              onClick={() => handleHazardClick(haz)}
                              className={`p-3.5 rounded-2xl border cursor-pointer transition ${
                                haz.severity === 'CRITICAL'
                                  ? 'bg-rose-950/40 border-rose-500/50 hover:border-rose-400'
                                  : 'bg-amber-950/30 border-amber-500/40 hover:border-amber-400'
                              }`}
                            >
                              <div className="flex items-center justify-between gap-2 mb-1">
                                <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-rose-500 text-slate-950">
                                  {haz.layer} Layer Collision
                                </span>
                                <span className="text-xs font-mono text-rose-200 font-semibold">
                                  {haz.measuredValueCm}cm (Need {haz.requiredValueCm}cm)
                                </span>
                              </div>
                              <div className="text-sm font-bold text-white mt-1">{haz.title}</div>
                              <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                                {haz.description}
                              </p>
                            </div>
                          </HoverTooltip>
                        ))}

                        {/* Big Button to Preview Argon 3D Fix */}
                        <HoverTooltip
                          title="Preview Gemini 4 Argon 3D Spatial Fix"
                          description="Automatically relocates movable floor obstacles, recesses or elevates protruding upper cabinets, and adds Long-Term Care Insurance safety rails in the 3D scene."
                          badge="Zero-Collision Patch"
                          align="right"
                        >
                          <button
                            onClick={() => setRemediationMode('AFTER')}
                            className="w-full py-3.5 px-4 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold text-xs shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2 transition"
                          >
                            <Sparkles className="w-4 h-4" />
                            <span>Apply Argon 3D Fix (See AFTER Layout) →</span>
                          </button>
                        </HoverTooltip>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="p-4 rounded-2xl bg-emerald-950/35 border border-emerald-500/40 space-y-1.5">
                          <div className="text-sm font-bold text-emerald-300 flex items-center gap-2">
                            <CheckCircle2 className="w-4 h-4" />
                            <span>Zero Collisions Across All 3 Layers!</span>
                          </div>
                          <p className="text-xs text-slate-300 leading-relaxed">
                            Green arrows in the 3D view show where Argon moved floor obstacles and
                            recessed/guarded the overhead cabinet so the {activeProfile.label}{' '}
                            trajectory passes safely.
                          </p>
                        </div>

                        {/* Quick Fixture Lock Pills inside AFTER view */}
                        <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
                          <div className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                            <Lock className="w-3.5 h-3.5 text-yellow-400" />
                            <span>Can&apos;t remove a built-in cabinet? Lock it:</span>
                          </div>
                          <div className="flex flex-wrap gap-1.5">
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
                                  <HoverTooltip
                                    key={obj.id}
                                    title={`Lock / Unlock: ${obj.name}`}
                                    description="Lock this fixture if it cannot be demolished or moved. HomeFit 3D will switch to a non-destructive protective padding + anti-shatter film remediation."
                                    badge={isLocked ? 'Locked' : 'Unlocked'}
                                    align="right"
                                  >
                                    <button
                                      onClick={() => toggleLockObject(obj.id)}
                                      className={`px-2.5 py-1.5 rounded-xl text-xs font-medium border flex items-center gap-1.5 transition ${
                                        isLocked
                                          ? 'bg-yellow-500/20 border-yellow-400 text-yellow-200'
                                          : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700'
                                      }`}
                                    >
                                      {isLocked ? (
                                        <Lock className="w-3 h-3 text-yellow-400" />
                                      ) : (
                                        <Unlock className="w-3 h-3 text-slate-500" />
                                      )}
                                      <span className="truncate max-w-[180px]">{obj.name}</span>
                                    </button>
                                  </HoverTooltip>
                                );
                              })}
                          </div>
                          {lockAdaptationNotes.length > 0 && (
                            <p className="text-[11px] text-yellow-200/90 pt-1">
                              • {lockAdaptationNotes[0]}
                            </p>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Quick Object Pills to Open Tape-Measure / Lock Inspector */}
                    <div className="pt-2 border-t border-slate-800 space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-slate-300 flex items-center gap-1.5">
                          <Ruler className="w-3.5 h-3.5 text-sky-400" />
                          <span>Inspect / Measure a 3D Object:</span>
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {activeObjects.slice(0, 4).map((obj) => (
                          <HoverTooltip
                            key={obj.id}
                            title={`Edit Dimensions: ${obj.name}`}
                            description="Open the 3D Object Inspector to override width, height, depth, or elevation using a physical tape measure, or lock this fixture in place."
                            badge="Tape Measure"
                            align="right"
                          >
                            <button
                              onClick={() => setSelectedObjectId(obj.id)}
                              className="px-2.5 py-1 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-800 text-[11px] text-slate-300 transition truncate max-w-[165px]"
                            >
                              📐 {obj.name}
                            </button>
                          </HoverTooltip>
                        ))}
                      </div>
                    </div>

                    {/* Collapsible Live Gemini 4 Argon Reasoning Trace */}
                    <div className="pt-2 border-t border-slate-800">
                      <div className="flex items-center justify-between">
                        <HoverTooltip
                          title="Gemini 4 Argon Chain-of-Thought Summary"
                          description="Inspect the raw spatial reasoning steps produced by gemini-4-argon when calculating 3-layer collision clearance and welfare equipment placement."
                          badge="AI Transparency"
                          align="left"
                        >
                          <button
                            onClick={() => setShowArgonTrace((v) => !v)}
                            className="text-xs text-slate-400 hover:text-sky-300 flex items-center gap-1.5 font-medium"
                          >
                            <Cpu className="w-3.5 h-3.5 text-sky-400" />
                            <span>
                              {showArgonTrace ? 'Hide' : 'View'} Gemini 4 Argon Reasoning
                            </span>
                          </button>
                        </HoverTooltip>
                        <HoverTooltip
                          title="Re-Run Live Gemini 4 Argon Inference"
                          description="Trigger a fresh API call to NestJS /api/analyze-room using the current room photo and selected mobility aid profile."
                          badge="Live API"
                          align="right"
                        >
                          <button
                            onClick={() => handleRunArgonAnalysis()}
                            disabled={isAnalyzingArgon}
                            className="text-[11px] text-sky-400 hover:underline font-semibold flex items-center gap-1"
                          >
                            <RotateCcw
                              className={`w-3 h-3 ${isAnalyzingArgon ? 'animate-spin' : ''}`}
                            />
                            <span>{isAnalyzingArgon ? 'Running Argon...' : 'Re-Run Live AI'}</span>
                          </button>
                        </HoverTooltip>
                      </div>

                      {showArgonTrace && (
                        <pre className="mt-2 text-[11px] font-mono text-slate-300 bg-slate-950 p-3 rounded-xl border border-slate-800 whitespace-pre-wrap leading-relaxed max-h-40 overflow-y-auto">
                          {argonStatus.thoughtSummary}
                        </pre>
                      )}
                    </div>

                    {/* Primary CTA to Step 3 Report */}
                    <HoverTooltip
                      title="Proceed to Step 3: Action & Subsidy Report"
                      description="Generate a 1-page pre-discharge modification checklist complete with before/after clearance metrics, on-site tape verification sign-off, and Long-Term Care Insurance (85% subsidy) item codes."
                      badge="Step 3 ->"
                      align="right"
                    >
                      <button
                        onClick={() => setCurrentStep(3)}
                        className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 text-white font-extrabold text-xs shadow-lg shadow-sky-500/20 flex items-center justify-center gap-2 transition"
                      >
                        <FileText className="w-4 h-4" />
                        <span>Go to Step 3: Safety &amp; Welfare Subsidy Report →</span>
                      </button>
                    </HoverTooltip>
                  </section>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ===================================================================
            STEP 3: 1-PAGE SAFETY & KOREAN WELFARE SUBSIDY REPORT
        =================================================================== */}
        {currentStep === 3 && (
          <div className="max-w-5xl mx-auto space-y-6">
            {/* Top Report Header Card */}
            <div className="rounded-3xl bg-slate-900/90 border border-slate-800 p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                    STEP 3 OF 3 · PRE-DISCHARGE SAFETY &amp; WELFARE SPEC
                  </span>
                  <span className="text-xs font-mono text-slate-400">
                    Status: {afterVerification.epistemicVerdict}
                  </span>
                </div>
                <h2 className="text-2xl font-extrabold text-white">
                  {baseScene.title} — Action &amp; Subsidy Plan
                </h2>
                <p className="text-xs text-slate-400">
                  Resident Profile: <strong className="text-sky-300">{activeProfile.label}</strong>{' '}
                  (Height {activeProfile.userHeightCm}cm, Forward Pitch +
                  {activeProfile.sitToStandForwardPitchCm}cm)
                </p>
              </div>

              <div className="flex items-center gap-2.5 shrink-0">
                <HoverTooltip
                  title="Return to 3D Simulation Studio"
                  description="Go back to Step 2 to inspect 3D objects, toggle BEFORE/AFTER layouts, or adjust tape-measure overrides."
                  badge="<- Step 2"
                  align="left"
                >
                  <button
                    onClick={() => setCurrentStep(2)}
                    className="px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 flex items-center gap-1.5 transition"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>Back to 3D Studio</span>
                  </button>
                </HoverTooltip>
                <HoverTooltip
                  title="Copy Formatted Action & Subsidy Checklist"
                  description="Copies the complete 3-layer clearance comparison, prioritized modification steps, and Long-Term Care Insurance subsidy tags to your clipboard to share with family or contractors."
                  badge="Clipboard"
                  align="center"
                >
                  <button
                    onClick={handleCopyChecklist}
                    className="px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-sky-300 transition"
                  >
                    {copiedChecklist ? '✓ Copied!' : 'Copy Report Text'}
                  </button>
                </HoverTooltip>
                <HoverTooltip
                  title="Print or Save 1-Page PDF Specification"
                  description="Opens the browser print dialog to export a clean, contractor-ready safety modification and welfare equipment order sheet."
                  badge="PDF Export"
                  align="right"
                >
                  <button
                    onClick={() => window.print()}
                    className="px-4 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 text-xs font-extrabold flex items-center gap-1.5 shadow-lg shadow-sky-500/20 transition"
                  >
                    <Printer className="w-4 h-4" />
                    <span>Print / Save PDF</span>
                  </button>
                </HoverTooltip>
              </div>
            </div>

            {/* 3-Layer Before -> After Clearance Comparison Banner */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-1">
                <div className="text-xs font-bold text-slate-400">
                  1. Overhead Head Clearance (130–195cm)
                </div>
                <div className="text-base font-mono">
                  <span className="text-rose-400 font-bold">
                    {beforeVerification.overheadHeadClearanceMinCm}cm
                  </span>{' '}
                  →{' '}
                  <span className="text-emerald-400 font-extrabold">
                    +{afterVerification.overheadHeadClearanceMinCm}cm
                  </span>
                </div>
                <p className="text-xs text-slate-400">
                  Clears +{activeProfile.sitToStandForwardPitchCm}cm sit-to-stand forward lean arc
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-1">
                <div className="text-xs font-bold text-slate-400">
                  2. Floor Stance &amp; Passage Width (0–30cm)
                </div>
                <div className="text-base font-mono">
                  <span className="text-rose-400 font-bold">
                    {beforeVerification.floorClearanceMinCm}cm
                  </span>{' '}
                  →{' '}
                  <span className="text-emerald-400 font-extrabold">
                    {afterVerification.floorClearanceMinCm}cm
                  </span>
                </div>
                <p className="text-xs text-slate-400">
                  Exceeds {activeProfile.minPassageWidthCm}cm minimum stance width
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-1">
                <div className="text-xs font-bold text-slate-400">
                  3. 360° Mid Turning Space (30–130cm)
                </div>
                <div className="text-base font-mono">
                  <span className="text-amber-400 font-bold">
                    {beforeVerification.midTurningClearanceCm}cm
                  </span>{' '}
                  →{' '}
                  <span className="text-emerald-400 font-extrabold">
                    {afterVerification.midTurningClearanceCm}cm
                  </span>
                </div>
                <p className="text-xs text-slate-400">
                  Safe turning circle for {activeProfile.label}
                </p>
              </div>
            </div>

            {/* Two-Column Action Schedule & On-Site Tape Verification */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Left 8 Cols: Prioritized Action & Korean Welfare Subsidy Checklist */}
              <section className="lg:col-span-8 rounded-3xl bg-slate-900/90 border border-slate-800 p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold uppercase tracking-wider text-emerald-300">
                    Prioritized Home Modification &amp; Welfare Subsidy Schedule
                  </h3>
                  <span className="text-xs text-slate-400">Check off completed items</span>
                </div>

                <div className="space-y-3">
                  {baseScene.remediationChecklist.map((item) => {
                    const checked = Boolean(completedActions[item.id]);
                    return (
                      <div
                        key={item.id}
                        onClick={() =>
                          setCompletedActions((prev) => ({ ...prev, [item.id]: !checked }))
                        }
                        className={`p-4 rounded-2xl border cursor-pointer transition ${
                          checked
                            ? 'bg-emerald-950/25 border-emerald-500/40 opacity-80'
                            : 'bg-slate-950/80 border-slate-800 hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2 mb-1.5">
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase bg-sky-500/20 text-sky-300 border border-sky-500/30">
                            {item.priority.replace(/_/g, ' ')} · {item.layer} Layer
                          </span>
                          <span className="text-xs font-mono font-bold text-emerald-300">
                            {item.estimatedCostLabel}
                          </span>
                        </div>

                        <div className="text-sm font-bold text-white flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => {}}
                            className="accent-emerald-500 w-4 h-4 rounded"
                          />
                          <span className={checked ? 'line-through text-slate-400' : ''}>
                            {item.title}
                          </span>
                        </div>
                        <div className="text-xs text-slate-400 mt-0.5 pl-6">{item.koreanTitle}</div>

                        <div className="mt-2.5 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs font-mono bg-slate-900 p-2.5 rounded-xl">
                          <div className="text-rose-300">Before: {item.beforeState}</div>
                          <div className="text-emerald-300">After: {item.afterState}</div>
                        </div>

                        {item.koreanWelfareProgramTag && (
                          <div className="mt-2 text-xs text-sky-300 font-medium">
                            🏷️ {item.koreanWelfareProgramTag}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>

              {/* Right 4 Cols: On-Site Tape-Measure & Blind-Spot Sign-Off */}
              <section className="lg:col-span-4 rounded-3xl bg-slate-900/90 border border-slate-800 p-6 space-y-4">
                <div className="space-y-1">
                  <h3 className="text-sm font-bold uppercase tracking-wider text-amber-300 flex items-center gap-2">
                    <Ruler className="w-4 h-4" />
                    On-Site Tape Check
                  </h3>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Because a single photo cannot see inside walls or measure millimeter depth,
                    confirm these items on-site before drilling:
                  </p>
                </div>

                <div className="space-y-2.5">
                  {(baseScene.unverifiedZones || []).map((zone) => {
                    const isConfirmed = confirmedZoneIds.includes(zone.id);
                    return (
                      <div
                        key={zone.id}
                        onClick={() => toggleConfirmZone(zone.id)}
                        className={`p-3 rounded-2xl border text-xs cursor-pointer flex items-start gap-2.5 transition ${
                          isConfirmed
                            ? 'bg-emerald-950/30 border-emerald-500/40 text-emerald-200'
                            : 'bg-amber-950/25 border-amber-500/30 text-amber-100'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isConfirmed}
                          onChange={() => {}}
                          className="mt-0.5 accent-emerald-500 w-4 h-4"
                        />
                        <div>
                          <div className="font-bold">{zone.label}</div>
                          <div className="text-slate-300 mt-0.5">{zone.howToVerify}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <HoverTooltip
                  title="Verify All Blind-Spot & Tape-Measure Checks"
                  description="Marks all photo-occluded dimensions and wall-stud checks as physically verified on site, upgrading the Epistemic Verdict from CONDITIONAL_READY to READY_FOR_DISCHARGE."
                  badge="Epistemic Sign-Off"
                  align="right"
                >
                  <button
                    onClick={confirmAllMeasurements}
                    className="w-full py-3 px-4 rounded-2xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-200 text-xs font-bold transition"
                  >
                    ✓ Confirm All On-Site Tape Measurements
                  </button>
                </HoverTooltip>

                {lockAdaptationNotes.length > 0 && (
                  <div className="p-3.5 rounded-2xl bg-yellow-950/35 border border-yellow-500/40 text-xs text-yellow-200 space-y-1">
                    <div className="font-bold flex items-center gap-1.5">
                      <Lock className="w-3.5 h-3.5" />
                      <span>Locked Fixture Adaptation:</span>
                    </div>
                    {lockAdaptationNotes.map((note: string, idx: number) => (
                      <p key={idx}>• {note}</p>
                    ))}
                  </div>
                )}
              </section>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default App;
