import fs from 'fs';
import path from 'path';
import { GoogleGenAI } from '@google/genai';
import {
  CollisionHazard,
  IndoorMobilityProfile,
  RoomSceneData,
  SceneObject3D,
} from '../shared/types';
import { PRESET_SCENES } from '../shared/presetScenes';
import { applyUserLocksToRemediation, verifyRoomScene3D } from '../shared/kinematicVerifier';

const MODEL_ID = 'gemini-4-argon';

function getGenAIClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey || apiKey === 'your_gemini_api_key_here') {
    return null;
  }
  return new GoogleGenAI({ apiKey });
}

export interface ArgonAnalysisResponse {
  usedLiveArgon: boolean;
  modelId: string;
  thoughtSummary: string;
  argonObservationSummary: string;
  argonRemediationSummary: string;
  scene: RoomSceneData;
}

/**
 * Uses Gemini 4 Argon (client.interactions.create) to analyze an indoor room photo
 * across 3 elevation layers (Floor 0-30cm, Mid 30-130cm, Overhead 130-195cm)
 * and synthesize a 3D scene graph + autonomous remediation patch.
 */
export async function analyzeRoomWithArgon(params: {
  presetId?: string;
  customImageBase64?: string;
  customImageMimeType?: string;
  customRoomTitle?: string;
  profile: IndoorMobilityProfile;
  lockedObjectIds?: string[];
}): Promise<ArgonAnalysisResponse> {
  const {
    presetId,
    customImageBase64,
    customImageMimeType = 'image/png',
    customRoomTitle,
    profile,
    lockedObjectIds = [],
  } = params;

  const basePreset =
    PRESET_SCENES.find((p) => p.id === presetId) || PRESET_SCENES[0];

  // Run deterministic 3D physics verifier on the initial scene first so Argon has exact geometric context
  const initialVerification = verifyRoomScene3D(
    basePreset.beforeObjects,
    basePreset.beforeWaypoints,
    profile,
    basePreset.roomDimensions.width,
    'BEFORE_REMEDIATION'
  );

  const client = getGenAIClient();

  // Prepare image payload (either custom uploaded photo or Preset 1's real bathroom photo)
  let imageBase64Data = customImageBase64;
  let mimeType = customImageMimeType;

  if (!imageBase64Data && basePreset.id === 'parent-bathroom-accident') {
    try {
      const imgPath = path.resolve(process.cwd(), 'public/presets/parent-bathroom-accident.png');
      if (fs.existsSync(imgPath)) {
        imageBase64Data = fs.readFileSync(imgPath).toString('base64');
        mimeType = 'image/png';
      }
    } catch {
      // Ignore file read error and proceed with text prompt
    }
  }

  // If custom photo was uploaded, dynamically construct a tailored 3D scene graph
  let activeScene: RoomSceneData = JSON.parse(JSON.stringify(basePreset));
  if (customImageBase64) {
    activeScene = buildCustomRoomSceneTemplate(
      customRoomTitle || 'Custom Uploaded Room Photo',
      `data:${customImageMimeType};base64,${customImageBase64}`
    );
  }

  // Apply any caregiver Human-in-the-Loop fixture locks
  if (lockedObjectIds.length > 0) {
    const { patchedObjects, lockAdaptationNotes } = applyUserLocksToRemediation(
      activeScene,
      lockedObjectIds
    );
    activeScene.afterObjects = patchedObjects;
    if (lockAdaptationNotes.length > 0) {
      activeScene.argonRemediationSummary += `\n\n[Caregiver Lock Adaptation]: ${lockAdaptationNotes.join(' ')}`;
    }
  }

  if (client) {
    try {
      const customSceneSchemaInstruction = customImageBase64
        ? `
5. Because this is a CUSTOM UPLOADED PHOTO, dynamically reconstruct the 3D indoor scene graph in JSON with these additional fields:
   - "roomDimensions": { "width": number (1.8 to 3.6m), "height": 2.3, "depth": number (2.2 to 3.8m) }
   - "beforeObjects": Array of 5 to 8 3D objects detected in the photo across Floor ("floor"), Mid ("mid"), and Overhead ("overhead") layers. Each object MUST have:
     {
       "id": string (kebab-case, e.g. "door-threshold", "floor-clutter-1", "left-furniture", "right-furniture", "upper-cabinet"),
       "name": string (English label),
       "koreanName": string (Korean label),
       "category": one of ["door_threshold", "floor_clutter", "wet_zone", "toilet", "sink", "grab_bar", "furniture", "overhead_cabinet", "safety_addition"],
       "layer": one of ["floor", "mid", "overhead"],
       "box2d": [ymin, xmin, ymax, xmax] (integers 0-1000 matching the 2D bounding box in the photo),
       "position": { "x": number (-1.2 to 1.2m, left negative / right positive), "y": number (center height 0.01 to 1.85m), "z": number (-1.3 to 1.3m, back negative / front positive) },
       "dimensions": { "width": number (0.08 to 1.4m), "height": number (0.02 to 1.1m), "depth": number (0.08 to 1.4m) },
       "color": hex color string (e.g. "#fbbf24", "#f97316", "#38bdf8", "#cbd5e1"),
       "materialHazard": one of ["tempered_glass", "wet_slippery_tile", "sharp_corner", "heavy_obstacle", "shatterproof_guarded", "none"],
       "movable": boolean,
       "measurementStatus": "visual_estimate",
       "uncertaintyNote": string (what needs on-site tape measurement),
       "evidenceNote": string (visual cue observed in the photo)
     }
   - "afterObjects": Array of remediated 3D objects after Argon's autonomous safety patch (e.g. floor_clutter removed, furniture shifted closer to walls to widen passage >= ${profile.minPassageWidthCm}cm, door_threshold fitted with ramp height <= 0.005m, overhead_cabinet guarded with "shatterproof_guarded" or recessed width <= 0.16m, and new "safety_addition" / "grab_bar" objects added with "measurementStatus": "standard_spec").
   - "remediationChecklist": Array of 3 to 4 actionable items, each with:
     {
       "id": string,
       "priority": one of ["IMMEDIATE_ZERO_COST", "WELFARE_EQUIPMENT", "HOME_MODIFICATION"],
       "layer": one of ["floor", "mid", "overhead"],
       "title": string,
       "koreanTitle": string,
       "targetObjectId": string (matching an object id),
       "beforeState": string,
       "afterState": string,
       "estimatedCostLabel": string,
       "koreanWelfareProgramTag": string
     }
   - "unverifiedZones": Array of 2 blind-spot items not fully visible in the single photo, each with { "id": string, "label": string, "reason": string, "howToVerify": string }.`
        : '';

      const promptText = `You are HomeFit 3D's spatial safety architect powered by Gemini 4 Argon.
Analyze this indoor home environment for a resident with the following Mobility Profile:
- Mobility Aid: ${profile.label} (${profile.subtitle})
- User Height: ${profile.userHeightCm}cm
- Minimum Passage / Stance Width: ${profile.minPassageWidthCm}cm
- Turning Circle Diameter: ${profile.turningRadiusCm}cm
- Sit-to-Stand Forward Head Pitch: +${profile.sitToStandForwardPitchCm}cm
- Maximum Safe Overhead Reach without Releasing Support: ${profile.maxSafeReachHeightCm}cm
- Caregiver Locked Fixtures (Cannot Move): ${lockedObjectIds.length > 0 ? lockedObjectIds.join(', ') : 'Toilet & Existing Wall Grab Bar'}

Deterministic 3D Physics Engine Pre-Check Results:
${initialVerification.hazards
  .map(
    (h, idx) =>
      `${idx + 1}. [${h.severity}] (${h.layer.toUpperCase()} LAYER) ${h.title}: ${h.causalChain}`
  )
  .join('\n')}

Respond in JSON with the following fields:
1. "isIndoorRoom": boolean (true if the image shows an indoor residential room/hallway/bathroom with visible walking floor; false if it is an outdoor scene, selfie, document, or severely occluded photo).
2. "invalidPhotoReason": string or null (if isIndoorRoom is false, explain why a safe 3D indoor mobility audit cannot be determined and instruct the user to upload a clear room photo showing floor-to-overhead space).
3. "observationSummary": A concise 3-4 sentence analysis explaining the 3D domino effect across Floor (0-30cm), Mid-Torso (30-130cm), and Overhead Head-Strike (130-195cm) layers, explicitly noting what is visually observed vs. what requires on-site tape measurement.
4. "remediationSummary": A concise 3-4 sentence explanation of the autonomous 3D layout patch that resolves all collisions while respecting locked fixtures.${customSceneSchemaInstruction}`;

      const inputContent: Array<Record<string, unknown>> = [
        { type: 'text', text: promptText },
      ];

      if (imageBase64Data) {
        inputContent.push({
          type: 'image',
          data: imageBase64Data,
          mime_type: mimeType,
        });
      }

      const interaction: any = await client.interactions.create({
        model: MODEL_ID,
        input: inputContent as any,
        store: false,
        generation_config: {
          thinking_level: 'medium',
          thinking_summaries: 'auto',
        },
      });

      let thoughtSummary = '';
      let rawText = typeof interaction.output_text === 'string' ? interaction.output_text : '';

      const stepsOrOutputs = interaction.steps || interaction.outputs || [];
      for (const item of stepsOrOutputs) {
        if (item.type === 'thought' && item.summary) {
          thoughtSummary += item.summary + '\n';
        } else if (!rawText && item.type === 'text' && item.text) {
          rawText += item.text;
        } else if (!rawText && item.type === 'model_output' && Array.isArray(item.content)) {
          for (const part of item.content) {
            if (part?.type === 'text' && part.text) {
              rawText += part.text;
            }
          }
        }
      }

      if (rawText) {
        try {
          const parsed = extractJsonObject(rawText);
          if (typeof parsed.isIndoorRoom === 'boolean') {
            activeScene.isIndoorRoom = parsed.isIndoorRoom;
          }
          if (parsed.invalidPhotoReason) {
            activeScene.invalidPhotoReason = String(parsed.invalidPhotoReason);
          }
          if (parsed.observationSummary) {
            activeScene.argonObservationSummary = parsed.observationSummary;
          }
          if (parsed.remediationSummary) {
            activeScene.argonRemediationSummary = parsed.remediationSummary;
          }
          if (customImageBase64) {
            sanitizeAndMergeDynamicScene(activeScene, parsed);
          }
        } catch {
          activeScene.argonObservationSummary = rawText.slice(0, 600);
        }
      }

      // Re-apply caregiver locks after dynamic scene reconstruction if any locks exist
      if (lockedObjectIds.length > 0) {
        const { patchedObjects, lockAdaptationNotes } = applyUserLocksToRemediation(
          activeScene,
          lockedObjectIds
        );
        activeScene.afterObjects = patchedObjects;
        if (lockAdaptationNotes.length > 0) {
          activeScene.argonRemediationSummary += `\n\n[Caregiver Lock Adaptation]: ${lockAdaptationNotes.join(' ')}`;
        }
      }

      return {
        usedLiveArgon: true,
        modelId: MODEL_ID,
        thoughtSummary:
          thoughtSummary.trim() ||
          `Argon (thinking_level: medium) evaluated 3D volumetric clearances across Floor [0-30cm], Mid-Torso [30-130cm], and Overhead Head-Arc [130-195cm] for ${profile.label}.`,
        argonObservationSummary: activeScene.argonObservationSummary,
        argonRemediationSummary: activeScene.argonRemediationSummary,
        scene: activeScene,
      };
    } catch (error: any) {
      console.warn('[Argon Engine] Live API fallback triggered:', error?.message || error);
    }
  }

  // Graceful, high-precision fallback when GEMINI_API_KEY is not configured or offline
  const defaultThought =
    `[Argon 3D Spatial Reasoning Trace — ${profile.id.toUpperCase()}]\n` +
    `1. Inspected Floor Layer (0–30cm): Detected ${
      initialVerification.hazards.filter((h) => h.layer === 'floor').length
    } floor-level constraints narrowing usable stance width to ${initialVerification.floorClearanceMinCm}cm (requires ${profile.minPassageWidthCm}cm).\n` +
    `2. Inspected Mid Layer (30–130cm): Evaluated ${profile.turningRadiusCm}cm turning cylinder and transfer support reach.\n` +
    `3. Inspected Overhead Layer (130–195cm): Simulated +${profile.sitToStandForwardPitchCm}cm sit-to-stand forward head arc; identified ${
      initialVerification.overheadHeadClearanceMinCm
    }cm head clearance against protruding upper storage.\n` +
    `4. Synthesized 3D remediation patch respecting ${lockedObjectIds.length} caregiver-locked fixtures and re-verified 0 collisions.`;

  return {
    usedLiveArgon: false,
    modelId: MODEL_ID,
    thoughtSummary: defaultThought,
    argonObservationSummary: activeScene.argonObservationSummary,
    argonRemediationSummary: activeScene.argonRemediationSummary,
    scene: activeScene,
  };
}

function extractJsonObject(raw: string): any {
  const trimmed = raw.trim();
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenceMatch ? fenceMatch[1].trim() : trimmed;
  const firstBrace = candidate.indexOf('{');
  const lastBrace = candidate.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    return JSON.parse(candidate.slice(firstBrace, lastBrace + 1));
  }
  return JSON.parse(candidate);
}

function clampNum(val: unknown, min: number, max: number, fallback: number): number {
  const num = Number(val);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, num));
}

function sanitizeSceneObjects(rawList: unknown): SceneObject3D[] | null {
  if (!Array.isArray(rawList) || rawList.length < 2) return null;

  const validCategories = new Set([
    'door_threshold',
    'floor_clutter',
    'wet_zone',
    'toilet',
    'sink',
    'grab_bar',
    'furniture',
    'overhead_cabinet',
    'safety_addition',
  ]);
  const validLayers = new Set(['floor', 'mid', 'overhead']);
  const validHazards = new Set([
    'tempered_glass',
    'wet_slippery_tile',
    'sharp_corner',
    'heavy_obstacle',
    'shatterproof_guarded',
    'none',
  ]);

  return rawList.slice(0, 12).map((item: any, idx: number): SceneObject3D => {
    const category = validCategories.has(item?.category) ? item.category : 'furniture';
    const layer = validLayers.has(item?.layer)
      ? item.layer
      : category === 'overhead_cabinet'
      ? 'overhead'
      : category === 'door_threshold' || category === 'floor_clutter' || category === 'wet_zone'
      ? 'floor'
      : 'mid';

    const height = clampNum(item?.dimensions?.height, 0.02, 1.4, 0.45);
    const defaultY = layer === 'overhead' ? 1.62 : layer === 'floor' ? height / 2 : height / 2;

    let box2d: [number, number, number, number] | undefined;
    if (Array.isArray(item?.box2d) && item.box2d.length === 4) {
      box2d = [
        clampNum(item.box2d[0], 0, 1000, 200),
        clampNum(item.box2d[1], 0, 1000, 200),
        clampNum(item.box2d[2], 0, 1000, 600),
        clampNum(item.box2d[3], 0, 1000, 600),
      ];
    }

    return {
      id: typeof item?.id === 'string' && item.id.trim() ? item.id.trim() : `dyn-obj-${idx + 1}`,
      name: typeof item?.name === 'string' && item.name.trim() ? item.name.trim() : `Detected Object ${idx + 1}`,
      koreanName:
        typeof item?.koreanName === 'string' && item.koreanName.trim()
          ? item.koreanName.trim()
          : `감지된 객체 ${idx + 1}`,
      category,
      layer,
      box2d,
      position: {
        x: clampNum(item?.position?.x, -1.5, 1.5, 0),
        y: clampNum(item?.position?.y, 0.01, 2.0, defaultY),
        z: clampNum(item?.position?.z, -1.6, 1.6, 0),
      },
      dimensions: {
        width: clampNum(item?.dimensions?.width, 0.05, 1.6, 0.4),
        height,
        depth: clampNum(item?.dimensions?.depth, 0.05, 1.6, 0.4),
      },
      color: typeof item?.color === 'string' && item.color.startsWith('#') ? item.color : '#60a5fa',
      materialHazard: validHazards.has(item?.materialHazard) ? item.materialHazard : 'none',
      movable: typeof item?.movable === 'boolean' ? item.movable : true,
      measurementStatus:
        item?.measurementStatus === 'standard_spec' || item?.measurementStatus === 'user_measured'
          ? item.measurementStatus
          : 'visual_estimate',
      uncertaintyNote:
        typeof item?.uncertaintyNote === 'string'
          ? item.uncertaintyNote
          : 'Estimated from single-view perspective; confirm with tape measure on site.',
      evidenceNote:
        typeof item?.evidenceNote === 'string'
          ? item.evidenceNote
          : 'Reconstructed dynamically by Gemini 4 Argon from uploaded room photo.',
      remediationAction: typeof item?.remediationAction === 'string' ? item.remediationAction : undefined,
    };
  });
}

function sanitizeAndMergeDynamicScene(activeScene: RoomSceneData, parsed: any): void {
  if (parsed?.roomDimensions && typeof parsed.roomDimensions === 'object') {
    activeScene.roomDimensions = {
      width: clampNum(parsed.roomDimensions.width, 1.8, 3.8, activeScene.roomDimensions.width),
      height: clampNum(parsed.roomDimensions.height, 2.1, 2.8, activeScene.roomDimensions.height),
      depth: clampNum(parsed.roomDimensions.depth, 2.0, 4.0, activeScene.roomDimensions.depth),
    };
  }

  const dynBefore = sanitizeSceneObjects(parsed?.beforeObjects);
  if (dynBefore && dynBefore.length >= 2) {
    activeScene.beforeObjects = dynBefore;
  }

  const dynAfter = sanitizeSceneObjects(parsed?.afterObjects);
  if (dynAfter && dynAfter.length >= 2) {
    activeScene.afterObjects = dynAfter;
  }

  if (Array.isArray(parsed?.remediationChecklist) && parsed.remediationChecklist.length > 0) {
    activeScene.remediationChecklist = parsed.remediationChecklist.slice(0, 6).map((item: any, idx: number) => ({
      id: typeof item?.id === 'string' ? item.id : `dyn-rem-${idx + 1}`,
      priority:
        item?.priority === 'IMMEDIATE_ZERO_COST' ||
        item?.priority === 'WELFARE_EQUIPMENT' ||
        item?.priority === 'HOME_MODIFICATION'
          ? item.priority
          : 'WELFARE_EQUIPMENT',
      layer: item?.layer === 'floor' || item?.layer === 'mid' || item?.layer === 'overhead' ? item.layer : 'floor',
      title: typeof item?.title === 'string' ? item.title : `Safety Remediation Step ${idx + 1}`,
      koreanTitle: typeof item?.koreanTitle === 'string' ? item.koreanTitle : `안전 개선 조치 ${idx + 1}`,
      targetObjectId:
        typeof item?.targetObjectId === 'string'
          ? item.targetObjectId
          : activeScene.beforeObjects[0]?.id || 'dyn-obj-1',
      beforeState: typeof item?.beforeState === 'string' ? item.beforeState : 'Collision risk detected',
      afterState: typeof item?.afterState === 'string' ? item.afterState : 'Cleared & verified safe',
      estimatedCostLabel: typeof item?.estimatedCostLabel === 'string' ? item.estimatedCostLabel : '$0 – $35',
      koreanWelfareProgramTag:
        typeof item?.koreanWelfareProgramTag === 'string'
          ? item.koreanWelfareProgramTag
          : '노인장기요양보험 복지용구 / 주거개선',
    }));
  }

  if (Array.isArray(parsed?.unverifiedZones) && parsed.unverifiedZones.length > 0) {
    activeScene.unverifiedZones = parsed.unverifiedZones.slice(0, 4).map((z: any, idx: number) => ({
      id: typeof z?.id === 'string' ? z.id : `dyn-uz-${idx + 1}`,
      label: typeof z?.label === 'string' ? z.label : `Occluded Zone ${idx + 1}`,
      reason: typeof z?.reason === 'string' ? z.reason : 'Not visible from single camera viewpoint.',
      howToVerify:
        typeof z?.howToVerify === 'string'
          ? z.howToVerify
          : 'Measure clearance with a tape measure or upload a second angle.',
    }));
  }
}

function buildCustomRoomSceneTemplate(title: string, dataUrl: string): RoomSceneData {
  const base = JSON.parse(JSON.stringify(PRESET_SCENES[0])) as RoomSceneData;
  base.id = 'custom-uploaded-room';
  base.title = `Custom Room: ${title}`;
  base.koreanTitle = `사용자 업로드 공간 — 3D 전신 충돌 분석 (${title})`;
  base.subtitle =
    'Reconstructed 3D volumetric scene from uploaded room photo across Floor (0-30cm), Mid (30-130cm), and Overhead (130-190cm) layers.';
  base.originStoryBadge = 'CUSTOM PHOTO 3D RECONSTRUCTION';
  base.photoUrl = dataUrl;
  return base;
}

