import { Injectable } from '@nestjs/common';
import { MOBILITY_PROFILES, PRESET_SCENES } from '../shared/presetScenes';
import {
  applyDimensionOverridesToObjects,
  applyUserLocksToRemediation,
  verifyRoomScene3D,
} from '../shared/kinematicVerifier';
import {
  IndoorMobilityProfile,
  ObjectDimensionOverride,
  RoomSceneData,
} from '../shared/types';
import { analyzeRoomWithArgon } from './argonEngine';

export interface AnalyzeRoomDto {
  presetId?: string;
  customImageBase64?: string;
  customImageMimeType?: string;
  customRoomTitle?: string;
  profile?: IndoorMobilityProfile;
  lockedObjectIds?: string[];
}

export interface VerifySceneDto {
  scene: RoomSceneData;
  profile: IndoorMobilityProfile;
  lockedObjectIds?: string[];
  dimensionOverrides?: Record<string, ObjectDimensionOverride>;
  confirmedZoneIds?: string[];
}

@Injectable()
export class ArgonService {
  getHealthStatus() {
    const hasApiKey = Boolean(
      process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'your_gemini_api_key_here'
    );
    return {
      status: 'ok',
      framework: 'NestJS',
      service: 'HomeFit 3D (Pre-Visit Home Safety Studio) NestJS API',
      model: 'gemini-4-argon',
      liveApiConfigured: hasApiKey,
      timestamp: new Date().toISOString(),
    };
  }

  getPresets() {
    return {
      profiles: MOBILITY_PROFILES,
      scenes: PRESET_SCENES,
    };
  }

  async analyzeRoom(dto: AnalyzeRoomDto) {
    const activeProfile = dto.profile || MOBILITY_PROFILES.crutches;

    const analysis = await analyzeRoomWithArgon({
      presetId: dto.presetId,
      customImageBase64: dto.customImageBase64,
      customImageMimeType: dto.customImageMimeType,
      customRoomTitle: dto.customRoomTitle,
      profile: activeProfile,
      lockedObjectIds: dto.lockedObjectIds || [],
    });

    const unconfirmedZoneCount = (analysis.scene.unverifiedZones || []).length;
    const isIndoorRoom = analysis.scene.isIndoorRoom !== false;

    const beforeVerification = verifyRoomScene3D(
      analysis.scene.beforeObjects,
      analysis.scene.beforeWaypoints,
      activeProfile,
      analysis.scene.roomDimensions.width,
      'BEFORE_REMEDIATION',
      { isIndoorRoom, unconfirmedZoneCount }
    );

    const afterVerification = verifyRoomScene3D(
      analysis.scene.afterObjects,
      analysis.scene.afterWaypoints,
      activeProfile,
      analysis.scene.roomDimensions.width,
      'AFTER_REMEDIATION',
      { isIndoorRoom, unconfirmedZoneCount }
    );

    return {
      ...analysis,
      beforeVerification,
      afterVerification,
    };
  }

  verifyScene(dto: VerifySceneDto) {
    const updatedScene: RoomSceneData = JSON.parse(JSON.stringify(dto.scene));
    const profile = dto.profile || MOBILITY_PROFILES.crutches;
    let lockNotes: string[] = [];

    if (dto.lockedObjectIds && dto.lockedObjectIds.length > 0) {
      const { patchedObjects, lockAdaptationNotes } = applyUserLocksToRemediation(
        updatedScene,
        dto.lockedObjectIds
      );
      updatedScene.afterObjects = patchedObjects;
      lockNotes = lockAdaptationNotes;
    }

    if (dto.dimensionOverrides) {
      updatedScene.beforeObjects = applyDimensionOverridesToObjects(
        updatedScene.beforeObjects,
        dto.dimensionOverrides
      );
      updatedScene.afterObjects = applyDimensionOverridesToObjects(
        updatedScene.afterObjects,
        dto.dimensionOverrides
      );
    }

    const confirmedIds = dto.confirmedZoneIds || [];
    const unconfirmedZoneCount = (updatedScene.unverifiedZones || []).filter(
      (z) => !confirmedIds.includes(z.id)
    ).length;
    const isIndoorRoom = updatedScene.isIndoorRoom !== false;

    const beforeVerification = verifyRoomScene3D(
      updatedScene.beforeObjects,
      updatedScene.beforeWaypoints,
      profile,
      updatedScene.roomDimensions.width,
      'BEFORE_REMEDIATION',
      { isIndoorRoom, unconfirmedZoneCount }
    );

    const afterVerification = verifyRoomScene3D(
      updatedScene.afterObjects,
      updatedScene.afterWaypoints,
      profile,
      updatedScene.roomDimensions.width,
      'AFTER_REMEDIATION',
      { isIndoorRoom, unconfirmedZoneCount }
    );

    return {
      scene: updatedScene,
      lockAdaptationNotes: lockNotes,
      beforeVerification,
      afterVerification,
    };
  }
}
