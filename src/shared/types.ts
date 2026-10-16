export type MobilityAidType = 'crutches' | 'wheelchair' | 'walker' | 'cane_grab_bar';

export type ElevationLayer = 'floor' | 'mid' | 'overhead';

export interface IndoorMobilityProfile {
  id: MobilityAidType;
  label: string;
  subtitle: string;
  userHeightCm: number;
  minPassageWidthCm: number;
  turningRadiusCm: number;
  maxStepThresholdCm: number;
  sitToStandForwardPitchCm: number;
  maxSafeReachHeightCm: number;
  requiresGrabBarAtTransfer: boolean;
  requiresNonSlipWetFloor: boolean;
}

export type ObjectCategory =
  | 'door_threshold'
  | 'floor_clutter'
  | 'wet_zone'
  | 'toilet'
  | 'sink'
  | 'grab_bar'
  | 'furniture'
  | 'overhead_cabinet'
  | 'safety_addition';

export type MaterialHazard =
  | 'tempered_glass'
  | 'wet_slippery_tile'
  | 'sharp_corner'
  | 'heavy_obstacle'
  | 'shatterproof_guarded'
  | 'none';

export type MeasurementStatus = 'visual_estimate' | 'user_measured' | 'standard_spec';

export type EpistemicVerdict = 'Incompatible' | 'Needs checking' | 'Meets checked conditions';

export interface ObjectDimensionOverride {
  widthCm?: number;
  heightCm?: number;
  depthCm?: number;
  positionXCm?: number;
  positionYCm?: number;
  confirmedByUser?: boolean;
}

export interface SceneObject3D {
  id: string;
  name: string;
  koreanName: string;
  category: ObjectCategory;
  layer: ElevationLayer;
  /**
   * 2D Bounding Box on reference photo [ymin, xmin, ymax, xmax] normalized 0-1000 (F03, F11)
   */
  box2d?: [number, number, number, number];
  /**
   * Center position in meters (Three.js Y-up coordinate system):
   * x: left (-) to right (+)
   * y: elevation above floor (0 = floor)
   * z: back (-) to front (+)
   */
  position: { x: number; y: number; z: number };
  /**
   * Bounding box dimensions in meters
   */
  dimensions: { width: number; height: number; depth: number };
  color: string;
  materialHazard: MaterialHazard;
  movable: boolean;
  lockedByUser?: boolean;
  measurementStatus: MeasurementStatus;
  uncertaintyNote?: string;
  evidenceNote: string;
  remediationAction?: string;
}

export type CharacterPosture =
  | 'walking'
  | 'pivoting'
  | 'sitting'
  | 'sit_to_stand_lean'
  | 'overhead_reach'
  | 'wheelchair_cruise'
  | 'wheelchair_turn';

export interface TrajectoryWaypoint {
  id: string;
  stepNumber: number;
  label: string;
  description: string;
  x: number;
  z: number;
  facingAngleDeg: number;
  posture: CharacterPosture;
  torsoForwardPitchDeg: number;
  headHeightM: number;
  headForwardOffsetM: number;
}

export type HazardType =
  | 'OVERHEAD_GLASS_HEAD_STRIKE'
  | 'HIGH_REACH_CRUTCH_RELEASE'
  | 'FLOOR_CLUTTER_STANCE_BLOCK'
  | 'PASSAGE_PINCH_COLLISION'
  | 'TURNING_RADIUS_COLLISION'
  | 'THRESHOLD_TRIP_OR_BLOCK'
  | 'WET_FLOOR_SLIP_AMPLIFIER';

export interface CollisionHazard {
  id: string;
  severity: 'CRITICAL' | 'WARNING' | 'NEEDS_MEASUREMENT';
  hazardType: HazardType;
  layer: ElevationLayer;
  title: string;
  description: string;
  causalChain: string;
  objectIds: string[];
  waypointId: string;
  collisionPoint3D: { x: number; y: number; z: number };
  measuredValueCm: number;
  requiredValueCm: number;
  epistemicNote: string;
}

export interface RemediationActionItem {
  id: string;
  priority: 'IMMEDIATE_ZERO_COST' | 'WELFARE_EQUIPMENT' | 'HOME_MODIFICATION';
  layer: ElevationLayer;
  title: string;
  koreanTitle: string;
  targetObjectId: string;
  beforeState: string;
  afterState: string;
  estimatedCostLabel: string;
  koreanWelfareProgramTag?: string;
}

export interface VerificationLogEntry {
  id: string;
  stage: 'OBSERVE_3D' | 'SIMULATE_PHYSICS' | 'VERIFY_HAZARDS' | 'ARGON_REMEDIATE' | 'RE_VERIFY_PASS' | 'HUMAN_LOCK_OVERRIDE';
  status: 'INFO' | 'FAIL' | 'PASS' | 'NEEDS_CHECK';
  title: string;
  detail: string;
  timestamp: string;
}

export interface UnverifiedZoneItem {
  id: string;
  label: string;
  reason: string;
  howToVerify: string;
}

export interface RoomSceneData {
  id: string;
  title: string;
  koreanTitle: string;
  subtitle: string;
  originStoryBadge?: string;
  photoUrl: string;
  isIndoorRoom?: boolean;
  invalidPhotoReason?: string;
  unverifiedZones?: UnverifiedZoneItem[];
  roomDimensions: { width: number; height: number; depth: number };
  wallColor: string;
  floorColor: string;
  beforeObjects: SceneObject3D[];
  afterObjects: SceneObject3D[];
  beforeWaypoints: TrajectoryWaypoint[];
  afterWaypoints: TrajectoryWaypoint[];
  remediationChecklist: RemediationActionItem[];
  argonObservationSummary: string;
  argonRemediationSummary: string;
}

export interface SimulationVerificationResult {
  overallStatus: 'FAIL_CRITICAL_HAZARDS' | 'NEEDS_ON_SITE_CHECK' | 'VERIFIED_SAFE_PASS';
  epistemicVerdict: EpistemicVerdict;
  totalCollisions: number;
  criticalCount: number;
  warningCount: number;
  unverifiedDimensionCount: number;
  floorClearanceMinCm: number;
  midTurningClearanceCm: number;
  overheadHeadClearanceMinCm: number;
  hazards: CollisionHazard[];
  verificationLogs: VerificationLogEntry[];
}

